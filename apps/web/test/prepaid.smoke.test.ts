/**
 * Tessere prepagate (Fase 9.5) sul Supabase locale, dalle route vere e con l'API Google simulata:
 * tipo di tessera, iscrizione dal web con OTP, scansione, attivazione dopo il pagamento, scalo,
 * mai sotto zero né dopo la scadenza né prima dell'attivazione, doppio tocco, annullamento,
 * ricarica, correzione del titolare, altri negozi, cancellazione del cliente e Google Wallet.
 */
import { randomUUID } from "node:crypto";
import { HEADERS } from "@loyalty/shared/api";
import type { LogLine } from "@loyalty/shared/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as start } from "@/app/api/public/enroll/start/route";
import { POST as verify } from "@/app/api/public/enroll/verify/route";
import { setLogSink } from "@/lib/observability/logger";
import { resetGoogleToken } from "@/lib/wallet/google/client";
import { startGoogleMock, type GoogleMock } from "./support/google-mock";
import { startPublicMocks, type PublicMocks } from "./support/public-mocks";
import { BARBIERE, SALONE, admin, call, giulia, marco, testPhone } from "./support/merchant";

let G = "";
let M = "";
let mocks: PublicMocks;
let google: GoogleMock;
let lines: LogLine[] = [];
let productId = "";
let productCode = "";
const customers: string[] = [];

beforeAll(async () => {
  [G, M] = await Promise.all([giulia(), marco()]);
  mocks = await startPublicMocks();
  google = await startGoogleMock();
  Object.assign(process.env, google.env(), {
    TURNSTILE_VERIFY_URL: mocks.turnstileUrl,
    TWILIO_VERIFY_API_BASE: mocks.twilioBase,
    OTP_PROVIDER: "test",
  });
  resetGoogleToken();
  const r = await call("createPrepaidProduct", {
    token: G,
    shopId: SALONE,
    body: {
      name: `Tessera smoke ${Date.now() % 100000}`,
      units: 150,
      unitSingular: "pagina",
      unitPlural: "pagine",
      validityMonths: 12,
    },
  });
  expect(r.status).toBe(200);
  const product = (r.json as { product: { id: string; code: string } }).product;
  productId = product.id;
  productCode = product.code;
});
beforeEach(() => {
  lines = [];
  setLogSink((_t, l) => lines.push(l));
});
afterAll(async () => {
  await admin.from("customers").delete().in("id", customers);
  await admin.from("prepaid_products").delete().eq("id", productId);
  await mocks.close();
  await google.close();
});

const ev = (name: string) => lines.filter((l) => l.event === name);
let ipSeq = 0;
const IP_BASE = Math.floor(Math.random() * 62_500);
const ip = () => {
  const n = (IP_BASE + ipSeq++) % 62_500;
  return `198.19.${Math.floor(n / 250)}.${n % 250}`;
};
const req = (body: unknown) =>
  new Request("http://localhost:3000/api/public", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip(),
      "x-platform": "public-web",
    },
    body: JSON.stringify(body),
  });

/** Iscrizione dal web alla tessera: restituisce la risposta della verifica. */
async function enrollPrepaid(phone = testPhone()) {
  const s = await start(
    req({
      shopSlug: "salone-demo",
      name: "Tina Tessera",
      phone,
      consentPrivacy: true,
      captchaToken: "ok",
      productCode,
    }),
  );
  const started = (await s.json()) as { enrollmentId: string };
  expect(s.status).toBe(200);
  const v = await verify(req({ enrollmentId: started.enrollmentId, code: "123456" }));
  const body = (await v.json()) as {
    status: string;
    card: { shortCode: string; qrToken: string };
    prepaid: { state: string; productName: string; module: { header: string } } | null;
    googleSaveUrl: string | null;
  };
  expect(v.status).toBe(200);
  const { data } = await admin
    .from("prepaid_cards")
    .select("id, customer_id")
    .eq("short_code", body.card.shortCode)
    .single();
  customers.push(data!.customer_id as string);
  return { ...body, cardId: data!.id as string, customerId: data!.customer_id as string };
}

const act = (
  key: "prepaidActivate" | "prepaidRecharge" | "prepaidUndo",
  token: string,
  cardId: string,
  idempotency?: string,
) =>
  call(key, {
    token,
    shopId: SALONE,
    body: { cardId },
    ...(idempotency && { headers: { [HEADERS.idempotencyKey]: idempotency } }),
  });
const consume = (token: string, cardId: string, quantity: number) =>
  call("prepaidConsume", { token, shopId: SALONE, body: { cardId, quantity } });
const balanceOf = async (cardId: string) =>
  ((await admin.from("prepaid_cards").select("balance").eq("id", cardId).single()).data?.balance as number) ?? -1;

describe("iscrizione dal web", () => {
  it("la tessera nasce da attivare, con il suo QR, e chi si riscrive la ritrova", async () => {
    const phone = testPhone();
    const first = await enrollPrepaid(phone);
    expect(first).toMatchObject({
      status: "created",
      prepaid: { state: "da_attivare", module: { header: "Da attivare in negozio" } },
    });
    expect(first.googleSaveUrl).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);
    expect(ev("prepaid.enroll.created")[0]).toMatchObject({ customer_ref: first.card.shortCode, returning: false });
    const again = await enrollPrepaid(phone);
    expect(again.status).toBe("returning");
    expect(again.card.shortCode).toBe(first.card.shortCode);
  });

  it("tessera inesistente o non disponibile: E_PREPAID_PRODUCT_NOT_FOUND prima dell'SMS", async () => {
    const r = await start(
      req({
        shopSlug: "salone-demo",
        name: "Tina",
        phone: testPhone(),
        consentPrivacy: true,
        captchaToken: "ok",
        productCode: "non-esiste",
      }),
    );
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe("E_PREPAID_PRODUCT_NOT_FOUND");
  });
});

describe("in cassa", () => {
  it("scansione: il QR della tessera apre la tessera; da un altro negozio è E_QR_OTHER_SHOP", async () => {
    const t = await enrollPrepaid();
    const r = await call("lookup", { token: M, shopId: SALONE, body: { code: t.card.qrToken } });
    expect(r.json).toMatchObject({ kind: "tessera", prepaid: { id: t.cardId, state: "da_attivare", balance: 0 } });
    expect(ev("prepaid.lookup.ok")).toHaveLength(1);
    const other = await call("lookup", { token: M, shopId: BARBIERE, body: { code: t.card.qrToken } });
    expect(other.code).toBe("E_QR_OTHER_SHOP");
  });

  it("prima dell'attivazione non si scala; attivazione (operatore) una volta sola, anche col doppio tocco", async () => {
    const t = await enrollPrepaid();
    const early = await consume(M, t.cardId, 1);
    expect(early.code).toBe("E_PREPAID_NOT_ACTIVE");
    expect(ev("prepaid.consume.rejected_inactive")).toHaveLength(1);

    const key = randomUUID();
    const [a, b] = await Promise.all([
      act("prepaidActivate", M, t.cardId, key),
      act("prepaidActivate", M, t.cardId, key),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.json?.duplicate, b.json?.duplicate].sort()).toEqual([false, true]);
    expect(await balanceOf(t.cardId)).toBe(150);
    expect(ev("prepaid.activate.ok")).toHaveLength(1);
    const again = await act("prepaidActivate", M, t.cardId);
    expect(again.code).toBe("E_PREPAID_ALREADY_ACTIVE");
  });

  it("scalo con quantità, mai sotto zero; annulla solo chi ha scalato; ricarica sulla stessa carta", async () => {
    const t = await enrollPrepaid();
    await act("prepaidActivate", M, t.cardId);
    const r = await consume(M, t.cardId, 12);
    expect(r.json).toMatchObject({ prepaid: { balance: 138, state: "attiva" } });
    expect(ev("prepaid.consume.ok")[0]?.msg).toContain("150 → 138");

    const tooMuch = await consume(M, t.cardId, 500);
    expect(tooMuch.code).toBe("E_PREPAID_INSUFFICIENT");
    expect(await balanceOf(t.cardId)).toBe(138);

    expect((await act("prepaidUndo", G, t.cardId)).code).toBe("E_UNDO_OTHER_OPERATOR");
    expect((await act("prepaidUndo", M, t.cardId)).json).toMatchObject({ prepaid: { balance: 150 } });

    await consume(M, t.cardId, 150);
    expect((await call("lookup", { token: M, shopId: SALONE, body: { code: t.card.shortCode } })).json).toMatchObject({
      prepaid: { state: "esaurita", balance: 0 },
    });
    expect((await act("prepaidRecharge", G, t.cardId)).json).toMatchObject({
      prepaid: { balance: 150, state: "attiva" },
    });
    expect(ev("prepaid.recharge.ok")).toHaveLength(1);
  });

  it("dopo la scadenza non si scala; la ricarica fa ripartire la scadenza", async () => {
    const t = await enrollPrepaid();
    await act("prepaidActivate", M, t.cardId);
    await admin
      .from("prepaid_cards")
      .update({ expires_at: new Date(Date.now() - 86_400_000).toISOString() })
      .eq("id", t.cardId);
    expect((await consume(M, t.cardId, 1)).code).toBe("E_PREPAID_EXPIRED");
    expect(ev("prepaid.consume.rejected_expired")).toHaveLength(1);
    const r = await act("prepaidRecharge", M, t.cardId);
    expect(r.json).toMatchObject({ prepaid: { state: "attiva", balance: 300 } });
    expect(
      new Date(String((r.json as { prepaid: { expiresAt: string } }).prepaid.expiresAt)).getTime(),
    ).toBeGreaterThan(Date.now());
  });

  it("correzione del saldo: solo il titolare, con motivo; audit e log", async () => {
    const t = await enrollPrepaid();
    await act("prepaidActivate", M, t.cardId);
    const body = { balance: 140, reason: "due pagine stampate male" };
    expect((await call("prepaidAdjust", { token: M, shopId: SALONE, params: { id: t.cardId }, body })).code).toBe(
      "E_FORBIDDEN_ROLE",
    );
    const r = await call("prepaidAdjust", { token: G, shopId: SALONE, params: { id: t.cardId }, body });
    expect(r.json).toMatchObject({ prepaid: { balance: 140 } });
    const { data } = await admin
      .from("audit_log")
      .select("action, reason")
      .eq("entity_id", t.cardId)
      .eq("action", "prepaid_adjust");
    expect(data).toEqual([{ action: "prepaid_adjust", reason: "due pagine stampate male" }]);
  });

  it("la tessera di un negozio non si tocca da un altro", async () => {
    const t = await enrollPrepaid();
    const r = await call("prepaidActivate", { token: M, shopId: BARBIERE, body: { cardId: t.cardId } });
    expect(r.code).toBe("E_CARD_NOT_FOUND");
  });
});

describe("Google Wallet", () => {
  it("la tessera su Google segue lo stato: da attivare → saldo → esaurita", async () => {
    const t = await enrollPrepaid();
    const objectId = [...google.objects.keys()].find((k) => k.endsWith(`prepaid-${t.cardId}`));
    expect(objectId).toBeTruthy();
    const obj = () =>
      google.objects.get(objectId!) as {
        loyaltyPoints: { balance: { string: string } };
        textModulesData: Array<{ header: string }>;
      };
    expect(obj().textModulesData[0]?.header).toBe("Da attivare in negozio");
    expect((await act("prepaidActivate", M, t.cardId)).status).toBe(200);
    expect(obj().loyaltyPoints.balance.string).toBe("150 / 150");
    const used = await consume(M, t.cardId, 150);
    expect(used.status, JSON.stringify(used.json)).toBe(200);
    expect(ev("wallet.google.prepaid.upsert.failed"), "nessun errore verso Google").toEqual([]);
    expect(obj().textModulesData[0]?.header).toBe("Tessera esaurita");
    expect(ev("wallet.google.prepaid.upsert.ok").length).toBeGreaterThan(0);
  });
});

describe("cliente cancellato", () => {
  it("la cancellazione del cliente cancella anche le sue tessere", async () => {
    const t = await enrollPrepaid();
    await call("deleteCustomer", {
      token: G,
      shopId: SALONE,
      params: { id: t.customerId },
      body: { reason: "richiesta" },
    });
    const { data } = await admin.from("prepaid_cards").select("deleted_at").eq("id", t.cardId).single();
    expect(data?.deleted_at).not.toBeNull();
    expect((await call("lookup", { token: M, shopId: SALONE, body: { code: t.card.qrToken } })).code).toBe(
      "E_CARD_NOT_FOUND",
    );
  });
});
