/**
 * Google Wallet robusto (Fase 4) contro un'API Google SIMULATA (support/google-mock.ts) e il
 * Supabase locale: sincronizzazione completa e idempotente, errori con nuovi tentativi e backoff,
 * riallineamento, disattivazione, template, notifiche e promozioni una volta sola.
 */
import type { LogLine } from "@loyalty/shared/logger";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as cronRoute } from "@/app/api/internal/cron/wallet-sync/route";
import { addStamp, deleteCustomer, enroll } from "@/lib/loyalty";
import { setLogSink } from "@/lib/observability/logger";
import { resetGoogleToken } from "@/lib/wallet/google/client";
import { notifyShopChanged } from "@/lib/wallet/notifier";
import { processDueRetries, resyncShop, sendCardMessage, syncCard } from "@/lib/wallet/sync";
import { runWalletCron } from "@/lib/wallet/cron";
import { startGoogleMock, type GoogleMock } from "./support/google-mock";
import { BARBIERE, GIULIA, MARCO, SALONE, admin, testPhone } from "./support/merchant";

const ISSUER = "3388000000099999999";
const oid = (customerId: string) => `${ISSUER}.cust-${customerId}`;
const TEST_SHOP = { id: "66666666-6666-4666-8666-666666666666", slug: "wallet-test" };

let mock: GoogleMock;
let lines: LogLine[] = [];
const created: string[] = [];
const ev = (name: string) => lines.filter((l) => l.event === name);

beforeAll(async () => {
  mock = await startGoogleMock();
  Object.assign(process.env, mock.env());
  resetGoogleToken();
  await admin.from("shops").upsert({
    id: TEST_SHOP.id,
    slug: TEST_SHOP.slug,
    name: "Negozio Wallet Test",
    stamps_required: 10,
    reward_label: "Caffè gratis",
    hex_color: "#1f2937",
    stamp_cooldown_minutes: 0,
    status: "active",
    stamp_unit: "caffè",
    stamp_unit_plural: "caffè",
  });
});

afterAll(async () => {
  await admin.from("customers").delete().in("id", created);
  await admin.from("customers").delete().eq("shop_id", TEST_SHOP.id);
  await admin.from("promotions").delete().eq("shop_id", TEST_SHOP.id);
  await mock.close();
});

beforeEach(() => {
  mock.recover();
  lines = [];
  setLogSink((_t, l) => lines.push(l));
});

/** Cliente iscritto dal web: la carta su Google la crea la sincronizzazione (inline nei test). */
async function enrolled(shopSlug: string, shopId: string) {
  const phone = testPhone();
  const r = await enroll({ shopSlug, name: "Cliente Wallet", phone, consentPrivacy: true, consentMarketing: false });
  const { data } = await admin
    .from("customers")
    .select("id, short_code")
    .eq("shop_id", shopId)
    .eq("phone", phone)
    .single();
  created.push(data!.id as string);
  return { id: data!.id as string, shortCode: data!.short_code as string, saveUrl: r.googleSaveUrl };
}

/** Cliente inserito direttamente (negozio di test senza staff), opzionalmente già sincronizzato. */
async function testCustomer(opts: { consent?: boolean; sync?: boolean } = {}) {
  const { data } = await admin
    .from("customers")
    .insert({
      shop_id: TEST_SHOP.id,
      name: "Cliente Test",
      phone: testPhone(),
      consent_privacy: true,
      consent_marketing: opts.consent ?? false,
    })
    .select("id, short_code")
    .single();
  const id = data!.id as string;
  created.push(id);
  if (opts.sync ?? true) expect(await syncCard(id)).toBe(true);
  return { id, shortCode: data!.short_code as string };
}

const state = async (customerId: string) =>
  (await admin.from("wallet_sync_state").select("*").eq("customer_id", customerId).eq("wallet", "google").single())
    .data;
const openFailures = async (customerId: string) =>
  (
    await admin
      .from("wallet_sync_failures")
      .select("*")
      .eq("customer_id", customerId)
      .is("resolved_at", null)
      .is("exhausted_at", null)
  ).data ?? [];
const makeDue = (customerId: string) =>
  admin
    .from("wallet_sync_failures")
    .update({ next_retry_at: new Date(Date.now() - 1000).toISOString() })
    .eq("customer_id", customerId);
const balance = (customerId: string) =>
  (mock.objects.get(oid(customerId))?.loyaltyPoints as { balance: { string: string } } | undefined)?.balance.string;

describe("iscrizione e timbri", () => {
  it("iscrizione: template e carta creati su Google, stato allineato, link con la carta completa", async () => {
    const c = await enrolled("barbiere-demo", BARBIERE);
    expect(mock.classes.has(`${ISSUER}.shop-barbiere-demo`)).toBe(true);
    const obj = mock.objects.get(oid(c.id)) as Record<string, unknown> & { textModulesData: Array<{ header: string }> };
    expect(obj).toMatchObject({ state: "ACTIVE", accountId: c.shortCode, barcode: { alternateText: c.shortCode } });
    expect(obj.textModulesData[0]?.header).toBe("Come funziona");
    expect(await state(c.id)).toMatchObject({
      synced_stamps: 0,
      synced_rewards: 0,
      synced_state: "ACTIVE",
      attempts: 0,
    });
    expect(ev("wallet.google.object.upsert.ok")).toHaveLength(1);

    const payload = jwt.decode(c.saveUrl!.split("/").at(-1)!) as {
      payload: { loyaltyObjects: Array<{ id: string }>; loyaltyClasses: unknown[] };
    };
    expect(payload.payload.loyaltyObjects[0]?.id).toBe(oid(c.id));
    expect(payload.payload.loyaltyClasses).toHaveLength(1);
  });

  it("timbro: la carta riceve lo stato completo (saldo e testi)", async () => {
    const c = await enrolled("barbiere-demo", BARBIERE);
    await addStamp(BARBIERE, c.id, MARCO);
    expect(balance(c.id)).toBe("1 / 10");
    const obj = mock.objects.get(oid(c.id)) as { textModulesData: Array<{ header: string }> };
    expect(obj.textModulesData[0]?.header).toBe("Ti mancano 9 barbe");
    expect(await state(c.id)).toMatchObject({ synced_stamps: 1, attempts: 0 });
    expect(ev("wallet.google.patch.ok")[0]?.msg).toBe(
      `Carta ${c.shortCode} aggiornata su Google Wallet (1/10, 0 premi) in ${ev("wallet.google.patch.ok")[0]?.duration_ms} ms.`,
    );
  });
});

describe("errori e nuovi tentativi", () => {
  it("401: timbro salvato, stato di sync in errore, retry pianificato; al ripristino la carta si riallinea", async () => {
    const c = await enrolled("barbiere-demo", BARBIERE);
    lines = [];
    mock.fail(401);

    const r = await addStamp(BARBIERE, c.id, MARCO);
    expect(r.customer.stamps).toBe(1); // il timbro c'è
    expect((await admin.from("customers").select("stamps").eq("id", c.id).single()).data?.stamps).toBe(1);
    expect(await state(c.id)).toMatchObject({ synced_stamps: 0, last_error_code: "E_GOOGLE_AUTH", attempts: 1 });
    const [failure] = await openFailures(c.id);
    expect(failure).toMatchObject({ kind: "object", attempt: 1, error_code: "E_GOOGLE_AUTH" });
    const inMin = (Date.parse(failure.next_retry_at) - Date.now()) / 60_000;
    expect(inMin).toBeGreaterThan(0.5);
    expect(inMin).toBeLessThan(1.1);

    const failed = ev("wallet.google.patch.failed")[0];
    expect(failed?.msg).toBe(
      `Aggiornamento su Google Wallet fallito per la carta ${c.shortCode}: credenziali del service account rifiutate (401). ` +
        "Il dato è salvato; verrà ritentato tra 1 minuto. Azione: verificare la chiave GOOGLE_WALLET_SA_KEY_B64 e il ruolo del service account nella Wallet Console.",
    );
    expect(ev("wallet.sync.retry.scheduled")[0]).toMatchObject({ next_attempt: 2, retry_in_min: 1 });
    // una sola riga di errore: le righe tecniche delle chiamate a Google sono a debug
    expect(lines.filter((l) => l.level === "error")).toHaveLength(1);

    mock.recover();
    await makeDue(c.id);
    await runWalletCron();
    expect(balance(c.id)).toBe("1 / 10");
    expect(await state(c.id)).toMatchObject({ synced_stamps: 1, attempts: 0 });
    expect(await openFailures(c.id)).toHaveLength(0);
    expect(ev("wallet.google.patch.ok").find((l) => l.customer_ref === c.shortCode)).toMatchObject({ attempt: 2 });
    expect((ev("cron.wallet_sync.run")[0]?.retries_ok as number) ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("backoff 1, 5, 15, 60 minuti, poi tentativi esauriti", async () => {
    const c = await enrolled("barbiere-demo", BARBIERE);
    mock.fail(503);
    await addStamp(BARBIERE, c.id, MARCO);
    const waits = [ev("wallet.sync.retry.scheduled").at(-1)?.retry_in_min];
    for (let i = 0; i < 3; i++) {
      await makeDue(c.id);
      await processDueRetries(50);
      waits.push(ev("wallet.sync.retry.scheduled").at(-1)?.retry_in_min);
    }
    expect(waits).toEqual([1, 5, 15, 60]);

    await makeDue(c.id);
    await processDueRetries(50);
    expect(ev("wallet.sync.retry.exhausted")[0]).toMatchObject({
      target: c.shortCode,
      attempts: 5,
      error_code: "E_GOOGLE_UNAVAILABLE",
    });
    expect(ev("wallet.google.patch.failed").at(-1)?.msg).toContain(
      "Il dato è salvato; tentativi automatici esauriti. Azione: quando Google torna disponibile, risincronizzare con pnpm wallet:resync.",
    );
    const { data } = await admin.from("wallet_sync_failures").select("exhausted_at").eq("customer_id", c.id).single();
    expect(data?.exhausted_at).not.toBeNull();
  });

  it("due esecuzioni del cron in parallelo non rifanno due volte lo stesso tentativo", async () => {
    const c = await enrolled("barbiere-demo", BARBIERE);
    mock.fail(500, { times: 1 });
    await addStamp(BARBIERE, c.id, MARCO);
    await makeDue(c.id);
    const before = mock.calls.filter((x) => x.path === `/loyaltyObject/${oid(c.id)}`).length;
    await Promise.all([processDueRetries(50), processDueRetries(50)]);
    expect(mock.calls.filter((x) => x.path === `/loyaltyObject/${oid(c.id)}`).length - before).toBe(1);
  });

  it.each([
    [403, "E_GOOGLE_AUTH"],
    [404, "E_GOOGLE_NOT_FOUND"],
    [429, "E_GOOGLE_QUOTA"],
    [400, "E_GOOGLE_INVALID_PAYLOAD"],
    [502, "E_GOOGLE_UNAVAILABLE"],
  ])("Google risponde %i → %s", async (status, code) => {
    const c = await testCustomer();
    mock.fail(status);
    expect(await syncCard(c.id)).toBe(false);
    expect((await state(c.id))?.last_error_code).toBe(code);
  });
});

describe("notifiche e disattivazione", () => {
  it("premio sbloccato: una sola notifica anche se il primo invio fallisce", async () => {
    const c = await enrolled("barbiere-demo", BARBIERE);
    for (let i = 0; i < 9; i++) await addStamp(BARBIERE, c.id, MARCO);
    mock.fail(500, { times: 1, match: /addMessage/ });
    await addStamp(BARBIERE, c.id, MARCO);
    expect(ev("wallet.google.message.failed")).toHaveLength(1);

    await makeDue(c.id);
    await processDueRetries(50);
    const sent = [...(mock.messages.get(oid(c.id))?.values() ?? [])];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      messageType: "TEXT_AND_NOTIFY",
      body: "Premio sbloccato! Barba gratis al prossimo passaggio: mostra la carta alla cassa.",
    });

    // un ulteriore tentativo con lo stesso id non duplica (409 = già inviato)
    const again = await sendCardMessage(c.id, {
      id: String(sent[0]?.id),
      header: "x",
      body: "y",
      kind: "premio sbloccato",
    });
    expect(again.ok).toBe(true);
    expect(mock.messages.get(oid(c.id))?.size).toBe(1);
  });

  it("cancellazione del cliente: carta INACTIVE su Google", async () => {
    const c = await enrolled("salone-demo", SALONE);
    await deleteCustomer(SALONE, c.id, { type: "staff", userId: GIULIA }, "richiesta del cliente");
    expect(mock.objects.get(oid(c.id))).toMatchObject({ state: "INACTIVE", accountName: "Cliente cancellato" });
    expect(ev("wallet.card.deactivated")[0]).toMatchObject({ reason: "cliente cancellato", customer_ref: c.shortCode });
    expect(ev("wallet.google.patch.ok")[0]?.msg).toBe(
      `Carta ${c.shortCode} disattivata su Google Wallet in ${ev("wallet.google.patch.ok")[0]?.duration_ms} ms.`,
    );
  });

  it("negozio sospeso e riattivato: le carte seguono lo stato del negozio", async () => {
    const c = await testCustomer();
    await admin.from("shops").update({ status: "suspended" }).eq("id", TEST_SHOP.id);
    try {
      const r = await resyncShop(TEST_SHOP.id);
      expect(r.classOk).toBe(true);
      expect(mock.objects.get(oid(c.id))?.state).toBe("INACTIVE");
    } finally {
      await admin.from("shops").update({ status: "active" }).eq("id", TEST_SHOP.id);
    }
    await resyncShop(TEST_SHOP.id);
    expect(mock.objects.get(oid(c.id))?.state).toBe("ACTIVE");
  });
});

describe("riconciliazione e impostazioni", () => {
  const age = async (customerId: string) => {
    const past = new Date(Date.now() - 10 * 60_000).toISOString();
    await admin.from("customers").update({ created_at: past }).eq("id", customerId);
    await admin.from("wallet_sync_state").update({ last_attempt_at: past }).eq("customer_id", customerId);
  };

  it("una carta rimasta indietro (sincronizzazione persa) viene riallineata dal cron", async () => {
    const c = await testCustomer();
    await admin.from("customers").update({ stamps: 5 }).eq("id", c.id); // il timbro c'è, la sync no
    await age(c.id);
    await runWalletCron();
    expect(balance(c.id)).toBe("5 / 10");
    expect(ev("wallet.sync.reconciled").find((l) => l.customer_ref === c.shortCode)?.reason).toBe("saldo");
  });

  it("cambio impostazioni: template subito, carte riallineate per versione", async () => {
    const c = await testCustomer();
    await age(c.id);
    const { data: before } = await admin.from("shops").select("card_version").eq("id", TEST_SHOP.id).single();
    const version = (before?.card_version as number) + 1;
    await admin.from("shops").update({ hex_color: "#0f766e", card_version: version }).eq("id", TEST_SHOP.id);
    const { data: shop } = await admin.from("shops").select("*").eq("id", TEST_SHOP.id).single();
    await notifyShopChanged(shop);
    expect(mock.classes.get(`${ISSUER}.shop-${TEST_SHOP.slug}`)?.hexBackgroundColor).toBe("#0f766e");

    await runWalletCron();
    expect(ev("wallet.sync.reconciled").find((l) => l.customer_ref === c.shortCode)?.reason).toBe(
      "impostazioni del negozio",
    );
    expect((await state(c.id))?.synced_version).toBe(version);
  });
});

describe("promozioni", () => {
  it("solo ai clienti con consenso, una volta sola anche con nuovi tentativi e cron in parallelo", async () => {
    await admin.from("promotions").delete().eq("shop_id", TEST_SHOP.id);
    const a = await testCustomer({ consent: true });
    const b = await testCustomer({ consent: false });
    const revoked = await testCustomer({ consent: true });
    const neverOnGoogle = await testCustomer({ consent: true, sync: false });
    const { data: promo } = await admin
      .from("promotions")
      .insert({ shop_id: TEST_SHOP.id, body: "Questa settimana il secondo caffè è offerto!", recipients_estimated: 3 })
      .select("id")
      .single();
    // 1. consegne preparate (destinatari = consenso in questo momento: a, revoked, neverOnGoogle)
    await admin.rpc("promotions_prepare");
    // 2. il cliente revoca il consenso DOPO la preparazione: la sua consegna va saltata all'invio
    await admin.from("customers").update({ consent_marketing: false }).eq("id", revoked.id);
    // 3. due cron in parallelo; il primo invio ad "a" fallisce
    mock.fail(503, { times: 1, match: new RegExp(`${a.id}/addMessage`) });
    await Promise.all([runWalletCron(), runWalletCron()]);
    // 4. nuovo tentativo per "a", poi un altro giro che non deve rimandare nulla
    await admin
      .from("promotion_deliveries")
      .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
      .eq("promotion_id", promo!.id)
      .eq("status", "pending");
    await runWalletCron();
    await runWalletCron();

    const toA = [...(mock.messages.get(oid(a.id))?.values() ?? [])];
    expect(toA).toHaveLength(1);
    expect(toA[0]).toMatchObject({ id: `promo-${promo!.id}` });
    expect(String(toA[0]?.body)).toMatch(
      /^Questa settimana il secondo caffè è offerto!\n\nNon vuoi più ricevere promozioni\? http:\/\/localhost:3000\/u\/[\w-]+\.[\w-]+$/,
    );
    expect(mock.messages.get(oid(b.id))).toBeUndefined();
    expect(mock.messages.get(oid(revoked.id))).toBeUndefined();
    expect(mock.messages.get(oid(neverOnGoogle.id))).toBeUndefined();

    const { data: deliveries } = await admin
      .from("promotion_deliveries")
      .select("customer_id, status, skip_reason")
      .eq("promotion_id", promo!.id);
    expect(Object.fromEntries((deliveries ?? []).map((d) => [d.customer_id, d.status]))).toEqual({
      [a.id]: "sent",
      [revoked.id]: "skipped",
      [neverOnGoogle.id]: "skipped",
    });
    expect((await admin.from("promotions").select("status").eq("id", promo!.id).single()).data?.status).toBe("sent");
    expect(ev("promo.send.completed")).toEqual([expect.objectContaining({ sent: 1, skipped: 2, failed: 0 })]);
  });
});

describe("endpoint del cron", () => {
  const call = (auth?: string) =>
    cronRoute(
      new Request("http://localhost:3000/api/internal/cron/wallet-sync", {
        method: "POST",
        ...(auth !== undefined && { headers: { authorization: auth } }),
      }),
    );

  it("senza il segreto giusto: 401 E_CRON_UNAUTHORIZED", async () => {
    for (const auth of [undefined, "Bearer sbagliato"]) {
      const res = await call(auth);
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("E_CRON_UNAUTHORIZED");
    }
  });

  it("con il segreto: esegue e restituisce il riepilogo", async () => {
    const res = await call(`Bearer ${process.env.CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ retries: expect.any(Number), reconciled: expect.any(Number) });
  });
});
