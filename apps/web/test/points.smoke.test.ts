/**
 * Carta a punti e abbonamenti (Fase 9.6) sul Supabase locale, dalle route vere e con l'API Google
 * simulata: scansione di una carta a punti, punti per euro (per difetto, spesa minima), cambio di
 * livello con notifica, doppio tocco, annullamento, correzione del titolare, timbri rifiutati in un
 * negozio a punti, impostazioni dei livelli; abbonamento attivato, rinnovato dalla scadenza e scaduto.
 */
import { randomUUID } from "node:crypto";
import { HEADERS } from "@loyalty/shared/api";
import type { LogLine } from "@loyalty/shared/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setLogSink } from "@/lib/observability/logger";
import { resetGoogleToken } from "@/lib/wallet/google/client";
import { startGoogleMock, type GoogleMock } from "./support/google-mock";
import { SALONE, admin, call, giulia, newCustomer, testPhone, tokenFor } from "./support/merchant";

const BAR = "88888888-8888-4888-8888-888888888888";
const LEVELS = [
  { name: "Silver", min: 0, perk: "" },
  { name: "Gold", min: 100, perk: "-5% su tutto" },
  { name: "Platinum", min: 300, perk: "-10% su tutto" },
];

let P = "";
let G = "";
let google: GoogleMock;
let lines: LogLine[] = [];
const customers: string[] = [];
let productId = "";

beforeAll(async () => {
  [P, G] = await Promise.all([tokenFor("titolare@bar-punti.test"), giulia()]);
  google = await startGoogleMock();
  Object.assign(process.env, google.env());
  resetGoogleToken();
  // valori del seed: un'esecuzione precedente o una prova a mano possono averli cambiati
  await admin
    .from("shops")
    .update({ loyalty_mode: "punti", points_per_euro: 1, points_min_cents: 0, points_levels: LEVELS })
    .eq("id", BAR);
});
beforeEach(() => {
  lines = [];
  setLogSink((_t, l) => lines.push(l));
});
afterAll(async () => {
  await admin.from("customers").delete().in("id", customers);
  if (productId) await admin.from("prepaid_products").delete().eq("id", productId);
  await google.close();
});

const ev = (name: string) => lines.filter((l) => l.event === name);

async function barCustomer() {
  const c = await newCustomer(BAR, { name: "Pietro Punti" });
  customers.push(c.id);
  return c;
}

const add = (customerId: string, amountCents: number, key?: string) =>
  call("pointsAdd", {
    token: P,
    shopId: BAR,
    body: { customerId, amountCents },
    ...(key && { headers: { [HEADERS.idempotencyKey]: key } }),
  });

describe("carta a punti in cassa", () => {
  it("la scansione riconosce la carta a punti", async () => {
    const c = await barCustomer();
    const r = await call("lookup", { token: P, shopId: BAR, body: { code: c.qr } });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({
      kind: "punti",
      card: { points: 0, level: "Silver", nextLevel: "Gold", toNext: 100 },
    });
    expect(ev("points.lookup.ok")).toHaveLength(1);
    expect(ev("customer.lookup.ok")).toHaveLength(0);
  });

  it("punti per euro arrotondati per difetto, poi il livello sale con la notifica", async () => {
    const c = await barCustomer();
    const r1 = await add(c.id, 2399);
    expect(r1.status).toBe(200);
    expect(r1.json).toMatchObject({ pointsAdded: 23, levelChanged: false, card: { points: 23, level: "Silver" } });
    expect(ev("points.add.ok")[0]).toMatchObject({ amount_cents: 2399, points_added: 23, points_after: 23 });

    const r2 = await add(c.id, 8000);
    expect(r2.json).toMatchObject({ pointsAdded: 80, levelChanged: true, card: { points: 103, level: "Gold" } });
    expect(ev("points.level.changed")[0]).toMatchObject({
      level_before: "Silver",
      level_after: "Gold",
      perk: "-5% su tutto",
    });
    const sent = [...google.messages.entries()]
      .filter(([oid]) => oid.endsWith(c.id))
      .flatMap(([, m]) => [...m.values()]);
    expect(JSON.stringify(sent)).toContain("Hai raggiunto il livello Gold");
    expect(ev("wallet.google.points.ok").length).toBeGreaterThan(0);

    const { data } = await admin.from("customers").select("points, points_total, points_level").eq("id", c.id).single();
    expect(data).toEqual({ points: 103, points_total: 103, points_level: "Gold" });
  });

  it("doppio tocco: stessa chiave, punti dati una volta", async () => {
    const c = await barCustomer();
    const key = randomUUID();
    const [a, b] = await Promise.all([add(c.id, 1000, key), add(c.id, 1000, key)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const dup = [a.json, b.json].filter((j) => (j as { duplicate: boolean }).duplicate);
    expect(dup).toHaveLength(1);
    const { data } = await admin.from("customers").select("points").eq("id", c.id).single();
    expect(data!.points).toBe(10);
    expect(ev("points.add.duplicate_ignored")).toHaveLength(1);
  });

  it("annullamento degli ultimi punti, una volta sola", async () => {
    const c = await barCustomer();
    await add(c.id, 5000);
    const u = await call("pointsUndo", { token: P, shopId: BAR, body: { customerId: c.id } });
    expect(u.status).toBe(200);
    expect(u.json).toMatchObject({ card: { points: 0, pointsTotal: 0 } });
    expect(ev("points.undo.ok")[0]).toMatchObject({ points_removed: 50, points_after: 0 });
    const again = await call("pointsUndo", { token: P, shopId: BAR, body: { customerId: c.id } });
    expect(again.code).toBe("E_NOTHING_TO_UNDO");
  });

  it("spesa minima e importi non validi", async () => {
    const c = await barCustomer();
    await admin.from("shops").update({ points_min_cents: 500 }).eq("id", BAR);
    try {
      const low = await add(c.id, 499);
      expect(low.json).toMatchObject({ pointsAdded: 0 });
    } finally {
      await admin.from("shops").update({ points_min_cents: 0 }).eq("id", BAR);
    }
    const bad = await add(c.id, 1_000_001);
    expect(bad.status).toBe(400);
  });

  it("correzione del titolare con motivo: anche il livello", async () => {
    const c = await barCustomer();
    const r = await call("pointsAdjust", {
      token: P,
      shopId: BAR,
      params: { id: c.id },
      body: { points: 320, reason: "Scontrini di ieri dimenticati" },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ card: { points: 320, level: "Platinum" } });
    expect(ev("points.adjust.ok")[0]).toMatchObject({ points_before: 0, points_after: 320 });
    const { data } = await admin
      .from("audit_log")
      .select("action, reason")
      .eq("entity_id", c.id)
      .eq("action", "points_adjust")
      .single();
    expect(data!.reason).toBe("Scontrini di ieri dimenticati");
  });

  it("timbri e premi rifiutati in un negozio a punti; punti rifiutati in un negozio a timbri", async () => {
    const c = await barCustomer();
    const s = await call("stamp", { token: P, shopId: BAR, body: { customerId: c.id } });
    expect(s.code).toBe("E_STAMPS_MODE_REQUIRED");
    const salone = await newCustomer(SALONE);
    customers.push(salone.id);
    const p = await call("pointsAdd", { token: G, shopId: SALONE, body: { customerId: salone.id, amountCents: 1000 } });
    expect(p.code).toBe("E_POINTS_MODE_REQUIRED");
  });

  it("impostazioni: livelli validati, cambio registrato e livelli ricalcolati", async () => {
    const c = await barCustomer();
    await add(c.id, 15000); // 150 punti: Gold
    const bad = await call("updateSettings", {
      token: P,
      shopId: BAR,
      body: { pointsLevels: [{ name: "Base", min: 10, perk: "" }] },
    });
    expect(bad.status).toBe(400);
    try {
      const r = await call("updateSettings", {
        token: P,
        shopId: BAR,
        body: {
          pointsPerEuro: 2,
          pointsLevels: [
            { name: "Base", min: 0, perk: "" },
            { name: "Oro", min: 200, perk: "caffè gratis" },
          ],
        },
      });
      expect(r.status).toBe(200);
      expect(r.json).toMatchObject({
        settings: { pointsPerEuro: 2, pointsLevels: [{ name: "Base" }, { name: "Oro" }] },
      });
      expect(ev("points.settings.updated")[0]!.msg).toContain("punti per euro 1 → 2");
      const { data } = await admin.from("customers").select("points_level").eq("id", c.id).single();
      expect(data!.points_level).toBe("Base");
    } finally {
      await admin.from("shops").update({ points_per_euro: 1, points_levels: LEVELS }).eq("id", BAR);
    }
  });

  it("elenco clienti con punti e livello", async () => {
    const c = await barCustomer();
    await add(c.id, 12000);
    const r = await call("customer", { token: P, shopId: BAR, params: { id: c.id } });
    expect(r.json).toMatchObject({ customer: { points: 120, pointsLevel: "Gold" } });
    const history = (r.json as { history: Array<{ action: string }> }).history.map((h) => h.action);
    expect(history).toContain("points_add");
  });
});

describe("abbonamento (membership)", () => {
  async function membershipCard() {
    const { data, error } = await admin.rpc("prepaid_enroll", {
      p_product_id: productId,
      p_name: "Sofia Socia",
      p_phone: testPhone(),
      p_consent_privacy: true,
      p_consent_marketing: false,
      p_meta: {},
    });
    if (error) throw new Error(error.message);
    const card = data as { card_id: string; qr_token: string; customer_id: string };
    customers.push(card.customer_id);
    return card;
  }

  beforeAll(async () => {
    const r = await call("createPrepaidProduct", {
      token: G,
      shopId: SALONE,
      body: {
        kind: "abbonamento",
        name: `Socio smoke ${Date.now() % 100000}`,
        benefit: "accesso illimitato",
        validityMonths: 12,
      },
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ product: { kind: "abbonamento", benefit: "accesso illimitato", units: null } });
    productId = (r.json as { product: { id: string } }).product.id;
    expect(ev("prepaid.product.created")[0]!.msg).toContain("abbonamento");
  });

  it("attivazione, scansione, rinnovo dalla scadenza; niente scalo", async () => {
    const card = await membershipCard();
    const a = await call("prepaidActivate", { token: G, shopId: SALONE, body: { cardId: card.card_id } });
    expect(a.status).toBe(200);
    expect(a.json).toMatchObject({ prepaid: { kind: "abbonamento", state: "attiva", benefit: "accesso illimitato" } });
    expect(ev("membership.activate.ok")).toHaveLength(1);
    const exp1 = new Date((a.json as { prepaid: { expiresAt: string } }).prepaid.expiresAt);

    const l = await call("lookup", { token: G, shopId: SALONE, body: { code: card.qr_token } });
    expect(l.json).toMatchObject({ kind: "tessera", prepaid: { kind: "abbonamento" } });
    expect(ev("membership.lookup.ok")[0]).toMatchObject({ membership_state: "valida" });

    const consume = await call("prepaidConsume", {
      token: G,
      shopId: SALONE,
      body: { cardId: card.card_id, quantity: 1 },
    });
    expect(consume.status).toBe(400);

    const r = await call("prepaidRecharge", { token: G, shopId: SALONE, body: { cardId: card.card_id } });
    expect(r.status).toBe(200);
    const exp2 = new Date((r.json as { prepaid: { expiresAt: string } }).prepaid.expiresAt);
    // ancora valido: il rinnovo allunga dalla scadenza (12 mesi in più), non da oggi
    expect(exp2.getTime() - exp1.getTime()).toBeGreaterThan(360 * 86_400_000);
    expect(ev("membership.renew.ok")[0]).toMatchObject({ expires_before: exp1.toISOString() });
  });

  it("scaduto: il rinnovo riparte da oggi", async () => {
    const card = await membershipCard();
    await call("prepaidActivate", { token: G, shopId: SALONE, body: { cardId: card.card_id } });
    await admin
      .from("prepaid_cards")
      .update({ expires_at: new Date(Date.now() - 86_400_000).toISOString() })
      .eq("id", card.card_id);
    const l = await call("lookup", { token: G, shopId: SALONE, body: { code: card.qr_token } });
    expect(l.json).toMatchObject({ prepaid: { state: "scaduta" } });
    const r = await call("prepaidRecharge", { token: G, shopId: SALONE, body: { cardId: card.card_id } });
    const exp = new Date((r.json as { prepaid: { expiresAt: string } }).prepaid.expiresAt).getTime();
    const inAYear = Date.now() + 365 * 86_400_000;
    expect(Math.abs(exp - inAYear)).toBeLessThan(3 * 86_400_000);
  });
});
