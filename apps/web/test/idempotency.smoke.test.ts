/**
 * Fase 7: azioni sul saldo idempotenti (doppio tocco, rete che ripete la richiesta),
 * timbro forzato durante il cooldown e scheda della carta con iscrizione e visite.
 */
import { randomUUID } from "node:crypto";
import type { LogLine } from "@loyalty/shared/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLogSink } from "@/lib/observability/logger";
import { BARBIERE, SALONE, admin, call, cleanupCustomers, giulia, marco, newCustomer } from "./support/merchant";

let G = "";
let M = "";
let lines: LogLine[] = [];
beforeAll(async () => {
  [G, M] = await Promise.all([giulia(), marco()]);
});
beforeEach(() => {
  lines = [];
  setLogSink((_t, l) => lines.push(l));
});
afterAll(cleanupCustomers);

const ev = (name: string) => lines.filter((l) => l.event === name);
const key = (k: string) => ({ "idempotency-key": k });

async function balance(customerId: string) {
  const { data } = await admin.from("customers").select("stamps, rewards_available").eq("id", customerId).single();
  return data as { stamps: number; rewards_available: number };
}
const stampEvents = async (customerId: string) =>
  (await admin.from("stamp_events").select("id").eq("customer_id", customerId).eq("kind", "stamp")).data?.length ?? 0;

describe("idempotenza delle azioni sul saldo", () => {
  it("stessa chiave due volte: un solo timbro, stessa risposta, stamp.add.duplicate_ignored", async () => {
    const c = await newCustomer(BARBIERE);
    const k = randomUUID();
    const a = await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id }, headers: key(k) });
    const b = await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id }, headers: key(k) });
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.json).toEqual(a.json);
    expect((await balance(c.id)).stamps).toBe(1);
    expect(await stampEvents(c.id)).toBe(1);
    expect(ev("stamp.add.ok")).toHaveLength(1);
    const dup = ev("stamp.add.duplicate_ignored");
    expect(dup).toHaveLength(1);
    expect(dup[0]?.msg).toMatch(/ignorata/);
    expect(dup[0]?.customer_ref).toBe(c.shortCode);
  });

  it("doppio tocco: due richieste contemporanee con la stessa chiave danno un solo timbro", async () => {
    const c = await newCustomer(BARBIERE);
    const k = randomUUID();
    const rs = await Promise.all(
      Array.from({ length: 5 }, () =>
        call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id }, headers: key(k) }),
      ),
    );
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect((await balance(c.id)).stamps).toBe(1);
    expect(await stampEvents(c.id)).toBe(1);
    expect(ev("stamp.add.duplicate_ignored")).toHaveLength(4);
  });

  it("chiavi diverse sono tocchi diversi (nessun cooldown su barbiere-demo)", async () => {
    const c = await newCustomer(BARBIERE);
    await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id } });
    await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id } });
    expect((await balance(c.id)).stamps).toBe(2);
  });

  it("annullamento e riscatto ripetuti con la stessa chiave agiscono una volta", async () => {
    const c = await newCustomer(BARBIERE);
    const { data: shop } = await admin.from("shops").select("stamps_required").eq("id", BARBIERE).single();
    const required = Number(shop?.stamps_required);
    for (let i = 0; i < required; i++) await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id } });
    expect(await balance(c.id)).toEqual({ stamps: 0, rewards_available: 1 });

    await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id } });
    await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id } });
    const ku = randomUUID();
    for (let i = 0; i < 2; i++)
      await call("undo", { token: M, shopId: BARBIERE, body: { customerId: c.id }, headers: key(ku) });
    expect((await balance(c.id)).stamps).toBe(1);
    expect(ev("stamp.undo.ok")).toHaveLength(1);
    expect(ev("stamp.undo.duplicate_ignored")).toHaveLength(1);

    const kr = randomUUID();
    for (let i = 0; i < 2; i++)
      await call("redeem", { token: M, shopId: BARBIERE, body: { customerId: c.id }, headers: key(kr) });
    expect((await balance(c.id)).rewards_available).toBe(0);
    expect(ev("reward.redeem.ok")).toHaveLength(1);
    expect(ev("reward.redeem.duplicate_ignored")).toHaveLength(1);
  });

  it("un tocco rifiutato (cooldown) non consuma la chiave", async () => {
    const c = await newCustomer(SALONE);
    await call("stamp", { token: M, shopId: SALONE, body: { customerId: c.id } });
    const k = randomUUID();
    const r1 = await call("stamp", { token: M, shopId: SALONE, body: { customerId: c.id }, headers: key(k) });
    expect([r1.status, r1.code]).toEqual([409, "E_STAMP_COOLDOWN"]);
    const { data } = await admin.from("action_keys").select("key").eq("key", k);
    expect(data).toEqual([]);
  });

  it("la stessa chiave per un'altra carta è un errore, non una risposta sbagliata", async () => {
    const [a, b] = await Promise.all([newCustomer(BARBIERE), newCustomer(BARBIERE)]);
    const k = randomUUID();
    await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: a.id }, headers: key(k) });
    const r = await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: b.id }, headers: key(k) });
    expect([r.status, r.code]).toEqual([400, "E_VALIDATION"]);
    expect((await balance(b.id)).stamps).toBe(0);
  });

  it("senza Idempotency-Key (o non UUID) le azioni sul saldo sono rifiutate", async () => {
    const c = await newCustomer(BARBIERE);
    for (const h of [{ "idempotency-key": "" }, { "idempotency-key": "non-una-chiave" }]) {
      const r = await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id }, headers: h });
      expect([r.status, r.code]).toEqual([400, "E_VALIDATION"]);
    }
    expect((await balance(c.id)).stamps).toBe(0);
  });
});

describe("timbro forzato durante il cooldown", () => {
  it("con force il timbro passa, resta nell'audit e scrive stamp.add.forced", async () => {
    const c = await newCustomer(SALONE);
    await call("stamp", { token: M, shopId: SALONE, body: { customerId: c.id } });
    const r = await call("stamp", { token: M, shopId: SALONE, body: { customerId: c.id, force: true } });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ forced: true, card: { stamps: 2 } });

    const forced = ev("stamp.add.forced");
    expect(forced).toHaveLength(1);
    expect(forced[0]).toMatchObject({ actor_name: "Marco", cooldown_min: 60, customer_ref: c.shortCode });
    expect(forced[0]?.msg).toMatch(/forzato un timbro .* durante il cooldown \(mancavano \d+ minuti su 60 minuti\)/);

    const { data } = await admin
      .from("audit_log")
      .select("reason, after")
      .eq("entity_id", c.id)
      .eq("action", "stamp")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(data?.reason).toBe("timbro forzato durante il cooldown");
    expect(data?.after).toMatchObject({ forced: true, stamps: 2 });
  });

  it("senza cooldown in corso force non cambia nulla", async () => {
    const c = await newCustomer(SALONE);
    const r = await call("stamp", { token: G, shopId: SALONE, body: { customerId: c.id, force: true } });
    expect(r.json).toMatchObject({ forced: false });
    expect(ev("stamp.add.forced")).toHaveLength(0);
  });
});

describe("scheda della carta", () => {
  it("la ricerca restituisce data d'iscrizione e visite (timbri non annullati)", async () => {
    const c = await newCustomer(BARBIERE);
    for (let i = 0; i < 3; i++) await call("stamp", { token: M, shopId: BARBIERE, body: { customerId: c.id } });
    await call("undo", { token: M, shopId: BARBIERE, body: { customerId: c.id } });
    const r = await call("lookup", { token: M, shopId: BARBIERE, body: { code: c.shortCode } });
    expect(r.json).toMatchObject({ visits: 2, card: { stamps: 2 } });
    expect(Date.now() - new Date(String(r.json?.since)).getTime()).toBeLessThan(60_000);
  });
});
