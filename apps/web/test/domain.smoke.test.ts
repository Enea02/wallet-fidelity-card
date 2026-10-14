/**
 * Regole di business sul database reale (`pnpm db:start`), passando dal dominio (loyalty.ts):
 * concorrenza, cooldown, annullamento, riscatto, rettifica, cancellazione, consenso marketing,
 * audit append-only e coerente. Usa i negozi e lo staff di supabase/seed.sql:
 *   salone-demo   (cooldown 60 min)  Giulia titolare, Marco operatore
 *   barbiere-demo (cooldown 0)       Marco operatore
 */
import type { LogLine } from "@loyalty/shared/logger";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  addStamp,
  adjustBalance,
  deleteCustomer,
  enroll,
  getCustomerByQr,
  redeem,
  setMarketingConsent,
  undoLastStamp,
} from "@/lib/loyalty";
import { runWithContext } from "@/lib/observability/context";
import { setLogSink } from "@/lib/observability/logger";

const SALONE = { id: "11111111-1111-4111-8111-111111111111", slug: "salone-demo" };
const BARBIERE = { id: "44444444-4444-4444-8444-444444444444", slug: "barbiere-demo" };
const GIULIA = "22222222-2222-4222-8222-222222222222"; // titolare di salone-demo
const MARCO = "55555555-5555-4555-8555-555555555555"; // operatore di entrambi

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false },
});

// telefoni univoci per questa esecuzione: +39 398 + 7 cifre
const RUN = `398${String(Date.now()).slice(-4)}`;
let seq = 0;
const phone = () => `+39${RUN}${String(seq++).padStart(3, "0")}`;

let lines: LogLine[] = [];
beforeEach(() => {
  lines = [];
  setLogSink((_t, l) => lines.push(l));
});

afterAll(async () => {
  // audit_log resta (append-only, nessuna FK sul cliente); stamp_events segue il cliente
  await db.from("customers").delete().like("phone", `+39${RUN}%`);
});

interface Card {
  id: string;
  qr: string;
  shortCode: string;
}

async function newCard(shop: { id: string; slug: string }, ph = phone()): Promise<Card> {
  await enroll({
    shopSlug: shop.slug,
    name: "Cliente Smoke",
    phone: ph,
    consentPrivacy: true,
    consentMarketing: false,
  });
  const { data } = await db
    .from("customers")
    .select("id, qr_token, short_code")
    .eq("shop_id", shop.id)
    .eq("phone", ph)
    .is("deleted_at", null)
    .single<{ id: string; qr_token: string; short_code: string }>();
  if (!data) throw new Error("cliente non creato");
  return { id: data.id, qr: data.qr_token, shortCode: data.short_code };
}

async function card(id: string) {
  const { data } = await db
    .from("customers")
    .select("name, phone, stamps, rewards_available, consent_marketing, deleted_at")
    .eq("id", id)
    .single();
  return data as {
    name: string;
    phone: string | null;
    stamps: number;
    rewards_available: number;
    consent_marketing: boolean;
    deleted_at: string | null;
  };
}

async function audit(customerId: string) {
  const { data } = await db.from("audit_log").select("*").eq("entity_id", customerId).order("id");
  return (data ?? []) as Array<Record<string, unknown> & { action: string; before: unknown; after: unknown }>;
}

const events = (name: string) => lines.filter((l) => l.event === name);

describe("timbri", () => {
  it("20 timbri in parallelo producono esattamente 20 incrementi (2 premi, 0 timbri)", async () => {
    const c = await newCard(BARBIERE);
    await Promise.all(Array.from({ length: 20 }, () => addStamp(BARBIERE.id, c.qr, MARCO)));
    expect(await card(c.id)).toMatchObject({ stamps: 0, rewards_available: 2 });
    expect((await audit(c.id)).filter((a) => a.action === "stamp")).toHaveLength(20);
    expect(events("stamp.add.ok")).toHaveLength(20);
    expect(events("reward.unlocked")).toHaveLength(2);
  });

  it("cooldown: secondo timbro rifiutato con i minuti mancanti, nessuna riga di audit", async () => {
    const c = await newCard(SALONE);
    await addStamp(SALONE.id, c.qr, MARCO);
    const before = (await audit(c.id)).length;

    await expect(addStamp(SALONE.id, c.qr, GIULIA)).rejects.toMatchObject({
      code: "E_STAMP_COOLDOWN",
      logged: true,
      userMessage: "Ultimo timbro meno di un minuto fa: si potrà timbrare di nuovo tra 60 minuti.",
    });
    expect((await audit(c.id)).length).toBe(before);
    expect(await card(c.id)).toMatchObject({ stamps: 1 });
    const rejected = events("stamp.add.rejected_cooldown")[0];
    expect(rejected).toMatchObject({
      level: "warn",
      customer_ref: c.shortCode,
      cooldown_min: 60,
      actor_name: "Giulia",
    });
  });

  it("una carta di un altro negozio non si trova; il database rifiuta comunque lo staff di un altro negozio", async () => {
    const c = await newCard(BARBIERE);
    await expect(addStamp(SALONE.id, c.qr, GIULIA)).rejects.toMatchObject({ code: "E_CARD_NOT_FOUND" });
    const { error } = await db.rpc("add_stamp", {
      p_customer_id: c.id,
      p_meta: { actor_type: "staff", actor_id: GIULIA },
    });
    expect(error?.message).toBe("E_FORBIDDEN_SHOP");
  });
});

describe("annullamento dell'ultimo timbro", () => {
  it("riporta il saldo a prima, marca il timbro come annullato e scrive l'audit", async () => {
    const c = await newCard(BARBIERE);
    await addStamp(BARBIERE.id, c.qr, MARCO);
    await addStamp(BARBIERE.id, c.qr, MARCO);
    await undoLastStamp(BARBIERE.id, c.qr, MARCO);

    expect(await card(c.id)).toMatchObject({ stamps: 1, rewards_available: 0 });
    const undo = (await audit(c.id)).find((a) => a.action === "undo");
    expect(undo).toMatchObject({
      before: { stamps: 2, rewards_available: 0 },
      after: { stamps: 1, rewards_available: 0 },
    });
    const { count } = await db
      .from("stamp_events")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", c.id)
      .not("undone_at", "is", null);
    expect(count).toBe(1);
    expect(events("stamp.undo.ok")[0]?.msg).toContain("2 → 1 su 10");
  });

  it("toglie il premio sbloccato dal timbro annullato (se non è stato riscattato)", async () => {
    const c = await newCard(BARBIERE);
    for (let i = 0; i < 10; i++) await addStamp(BARBIERE.id, c.qr, MARCO);
    expect(await card(c.id)).toMatchObject({ stamps: 0, rewards_available: 1 });
    await undoLastStamp(BARBIERE.id, c.qr, MARCO);
    expect(await card(c.id)).toMatchObject({ stamps: 9, rewards_available: 0 });
  });

  it("E_NOTHING_TO_UNDO su una carta senza timbri, nessuna riga di audit", async () => {
    const c = await newCard(BARBIERE);
    const before = (await audit(c.id)).length;
    await expect(undoLastStamp(BARBIERE.id, c.qr, MARCO)).rejects.toMatchObject({
      code: "E_NOTHING_TO_UNDO",
      logged: true,
    });
    expect((await audit(c.id)).length).toBe(before);
    expect(events("stamp.undo.rejected")[0]).toMatchObject({ error_code: "E_NOTHING_TO_UNDO", level: "warn" });
  });

  it("E_UNDO_OTHER_OPERATOR se il timbro l'ha dato un altro, nessuna riga di audit", async () => {
    const c = await newCard(SALONE);
    await addStamp(SALONE.id, c.qr, MARCO);
    const before = (await audit(c.id)).length;
    await expect(undoLastStamp(SALONE.id, c.qr, GIULIA)).rejects.toMatchObject({
      code: "E_UNDO_OTHER_OPERATOR",
      userMessage: "Puoi annullare solo un timbro che hai dato tu: questo l'ha dato Marco.",
    });
    expect((await audit(c.id)).length).toBe(before);
  });

  it("E_UNDO_EXPIRED dopo 5 minuti", async () => {
    const c = await newCard(BARBIERE);
    await addStamp(BARBIERE.id, c.qr, MARCO);
    await db
      .from("stamp_events")
      .update({ created_at: new Date(Date.now() - 6 * 60_000).toISOString() })
      .eq("customer_id", c.id);
    const before = (await audit(c.id)).length;
    await expect(undoLastStamp(BARBIERE.id, c.qr, MARCO)).rejects.toMatchObject({ code: "E_UNDO_EXPIRED" });
    expect((await audit(c.id)).length).toBe(before);
    expect(events("stamp.undo.rejected")[0]?.msg).toContain("6 minuti fa (limite 5 minuti)");
  });

  it("E_UNDO_REWARD_REDEEMED se il timbro ha sbloccato un premio già riscattato", async () => {
    const c = await newCard(BARBIERE);
    for (let i = 0; i < 10; i++) await addStamp(BARBIERE.id, c.qr, MARCO);
    await redeem(BARBIERE.id, c.qr, MARCO);
    await expect(undoLastStamp(BARBIERE.id, c.qr, MARCO)).rejects.toMatchObject({ code: "E_UNDO_REWARD_REDEEMED" });
  });

  it("E_UNDO_NOT_LAST se dopo il timbro c'è stata una rettifica", async () => {
    const c = await newCard(SALONE);
    await addStamp(SALONE.id, c.qr, GIULIA);
    await adjustBalance(SALONE.id, c.id, { stamps: 5, rewards: 0, reason: "carta cartacea" }, GIULIA);
    await expect(undoLastStamp(SALONE.id, c.qr, GIULIA)).rejects.toMatchObject({ code: "E_UNDO_NOT_LAST" });
    expect(await card(c.id)).toMatchObject({ stamps: 5 });
  });
});

describe("riscatto", () => {
  it("senza premi: E_NO_REWARD, nessuna riga di audit", async () => {
    const c = await newCard(BARBIERE);
    const before = (await audit(c.id)).length;
    await expect(redeem(BARBIERE.id, c.qr, MARCO)).rejects.toMatchObject({ code: "E_NO_REWARD", logged: true });
    expect((await audit(c.id)).length).toBe(before);
    expect(events("reward.redeem.rejected_none")).toHaveLength(1);
  });

  it("con un premio: scala il premio e scrive l'audit", async () => {
    const c = await newCard(BARBIERE);
    for (let i = 0; i < 10; i++) await addStamp(BARBIERE.id, c.qr, MARCO);
    await redeem(BARBIERE.id, c.qr, MARCO);
    expect(await card(c.id)).toMatchObject({ stamps: 0, rewards_available: 0 });
    expect((await audit(c.id)).at(-1)).toMatchObject({
      action: "redeem",
      before: { rewards_available: 1 },
      after: { rewards_available: 0 },
    });
  });
});

describe("rettifica del saldo", () => {
  it("solo il titolare, con motivo e valori nell'intervallo", async () => {
    const c = await newCard(SALONE);
    const input = { stamps: 7, rewards: 1, reason: "timbri della carta cartacea" };
    await expect(adjustBalance(SALONE.id, c.id, input, MARCO)).rejects.toMatchObject({ code: "E_FORBIDDEN_ROLE" });
    await expect(adjustBalance(SALONE.id, c.id, { ...input, reason: " " }, GIULIA)).rejects.toMatchObject({
      code: "E_VALIDATION",
      context: { field: "reason" },
    });
    await expect(adjustBalance(SALONE.id, c.id, { ...input, stamps: 10 }, GIULIA)).rejects.toMatchObject({
      code: "E_VALIDATION",
      context: { field: "stamps" },
    });
    expect((await audit(c.id)).filter((a) => a.action === "adjust")).toHaveLength(0);

    await adjustBalance(SALONE.id, c.id, input, GIULIA);
    expect(await card(c.id)).toMatchObject({ stamps: 7, rewards_available: 1 });
    expect((await audit(c.id)).at(-1)).toMatchObject({
      action: "adjust",
      actor_id: GIULIA,
      reason: "timbri della carta cartacea",
      before: { stamps: 0, rewards_available: 0 },
      after: { stamps: 7, rewards_available: 1 },
    });
  });
});

describe("audit", () => {
  it("ogni riga ha request_id, attore, piattaforma, versione e ip_hash della richiesta", async () => {
    const c = await newCard(BARBIERE);
    const ctx = {
      request_id: "01JB7K3QX0ABCDEFGHJKMNPQRS",
      platform: "ios",
      app_version: "1.4.0",
      ip_hash: "9f2c4e1ab37d5c08",
    };
    await runWithContext(ctx, () => addStamp(BARBIERE.id, c.qr, MARCO));
    expect((await audit(c.id)).at(-1)).toMatchObject({
      action: "stamp",
      actor_type: "staff",
      actor_id: MARCO,
      shop_id: BARBIERE.id,
      entity: "customer",
      ...ctx,
      before: { stamps: 0, rewards_available: 0 },
      after: { stamps: 1, rewards_available: 0, reward_unlocked: false },
    });
    expect(events("stamp.add.ok")[0]?.msg).toBe(
      `Marco (operatore, iOS 1.4.0) ha aggiunto un timbro alla carta ${c.shortCode} del negozio Barbiere Demo: 0 → 1 su 10.`,
    );
  });

  it("non si può modificare né cancellare, nemmeno con la service role", async () => {
    const c = await newCard(BARBIERE);
    const row = (await audit(c.id))[0];
    const upd = await db.from("audit_log").update({ action: "manomesso" }).eq("id", row?.id);
    expect(upd.error?.message).toBe("E_AUDIT_IMMUTABLE");
    const del = await db.from("audit_log").delete().eq("id", row?.id);
    expect(del.error?.message).toBe("E_AUDIT_IMMUTABLE");
    expect(await audit(c.id)).toHaveLength(1);
  });
});

describe("cancellazione del cliente", () => {
  it("rimuove i dati personali, pseudonimizza l'audit e blocca la carta; il numero può reiscriversi", async () => {
    const ph = phone();
    const c = await newCard(SALONE, ph);
    await addStamp(SALONE.id, c.qr, GIULIA);
    expect(JSON.stringify(await audit(c.id))).toContain("Cliente Smoke");

    await expect(deleteCustomer(SALONE.id, c.id, { type: "staff", userId: MARCO })).rejects.toMatchObject({
      code: "E_FORBIDDEN_ROLE",
    });
    await deleteCustomer(SALONE.id, c.id, { type: "staff", userId: GIULIA }, "richiesta del cliente");

    expect(await card(c.id)).toMatchObject({ name: "Cliente cancellato", phone: null, consent_marketing: false });
    const rows = await audit(c.id);
    expect(JSON.stringify(rows)).not.toContain("Cliente Smoke");
    expect(rows.map((r) => r.action)).toEqual(["enroll", "stamp", "customer_delete"]);
    expect(rows[1]).toMatchObject({ after: { stamps: 1 } }); // conteggi e storico restano
    expect(events("customer.delete.ok")[0]).toMatchObject({ audit_rows_pseudonymized: 2, customer_ref: c.shortCode });

    await expect(getCustomerByQr(SALONE.id, c.qr)).rejects.toMatchObject({ code: "E_CARD_DELETED" });
    await expect(addStamp(SALONE.id, c.qr, GIULIA)).rejects.toMatchObject({ code: "E_CARD_DELETED" });

    const again = await newCard(SALONE, ph);
    expect(again.id).not.toBe(c.id);
    expect(events("enroll.customer.created").length).toBeGreaterThanOrEqual(1);
  });
});

describe("consenso marketing", () => {
  it("cambia solo se diverso, con audit; il cliente può revocare il proprio", async () => {
    const c = await newCard(SALONE);
    expect(await setMarketingConsent(SALONE.id, c.id, true, { type: "staff", userId: GIULIA })).toMatchObject({
      changed: true,
    });
    expect(await setMarketingConsent(SALONE.id, c.id, true, { type: "staff", userId: GIULIA })).toMatchObject({
      changed: false,
    });
    await setMarketingConsent(SALONE.id, c.id, false, { type: "customer", customerId: c.id });
    const rows = (await audit(c.id)).filter((a) => a.action === "marketing_consent");
    expect(rows.map((r) => r.actor_type)).toEqual(["staff", "customer"]);
    expect(events("customer.marketing.changed").map((l) => l.msg)).toEqual([
      `Giulia (titolare) ha attivato il consenso alle promozioni per la carta ${c.shortCode} del negozio Salone Demo.`,
      `Il cliente ha revocato il consenso alle promozioni per la carta ${c.shortCode} del negozio Salone Demo.`,
    ]);
  });
});

describe("codice breve e iscrizione", () => {
  it("500 iscrizioni: codici di 8 caratteri leggibili, tutti diversi nel negozio", async () => {
    const codes: string[] = [];
    for (let batch = 0; batch < 10; batch++) {
      const results = await Promise.all(
        Array.from({ length: 50 }, () =>
          db.rpc("enroll_customer", {
            p_shop_id: BARBIERE.id,
            p_name: "Cliente Smoke",
            p_phone: phone(),
            p_consent_privacy: true,
            p_consent_marketing: false,
            p_meta: { actor_type: "customer" },
          }),
        ),
      );
      for (const r of results) codes.push((r.data as { short_code: string }).short_code);
    }
    expect(codes.every((c) => /^[2-9A-HJKMNP-Z]{8}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(500);
  });

  it("lo stesso telefono ritrova la stessa carta, anche con due iscrizioni contemporanee", async () => {
    const ph = phone();
    await Promise.all([1, 2, 3].map(() => newCard(SALONE, ph)));
    const { count } = await db
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("phone", ph)
      .is("deleted_at", null);
    expect(count).toBe(1);
    expect(events("enroll.customer.created")).toHaveLength(1);
    expect(events("enroll.customer.returning")).toHaveLength(2);
  });
});
