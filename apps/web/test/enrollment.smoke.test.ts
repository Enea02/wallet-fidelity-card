/**
 * Iscrizione dal web pubblico (Fase 5) sul Supabase locale, dalle route vere:
 * funnel e log senza dati personali, limiti SMS (anche in parallelo), nuovo codice, blocco dopo
 * 5 errori, scadenza, anti-bot, fornitore Twilio (simulato), disiscrizione monouso, pulizia.
 */
import type { LogLine } from "@loyalty/shared/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as funnel } from "@/app/api/public/funnel/route";
import { POST as resend } from "@/app/api/public/enroll/resend/route";
import { POST as start } from "@/app/api/public/enroll/start/route";
import { POST as verify } from "@/app/api/public/enroll/verify/route";
import { POST as unsubscribe } from "@/app/api/public/unsubscribe/route";
import { setLogSink } from "@/lib/observability/logger";
import { phoneLinkToken, verifyPhoneLinkToken } from "@/lib/public/links";
import { unsubscribeToken } from "@/lib/wallet/unsubscribe";
import { startPublicMocks, type PublicMocks } from "./support/public-mocks";
import { SALONE, admin, testPhone } from "./support/merchant";

let mocks: PublicMocks;
let lines: LogLine[] = [];
const created: string[] = [];
let ipSeq = 0;
// base casuale per esecuzione + contatore: IP diversi nella stessa esecuzione e (quasi sempre) tra esecuzioni
// ravvicinate, che altrimenti si sommerebbero nel limite orario per IP
const IP_BASE = Math.floor(Math.random() * 62_500);
const newIp = () => {
  const n = (IP_BASE + ipSeq++) % 62_500;
  return `198.18.${Math.floor(n / 250)}.${n % 250}`;
};

beforeAll(async () => {
  mocks = await startPublicMocks();
  process.env.TURNSTILE_VERIFY_URL = mocks.turnstileUrl;
  process.env.TWILIO_VERIFY_API_BASE = mocks.twilioBase;
});
beforeEach(() => {
  process.env.OTP_PROVIDER = "test";
  lines = [];
  setLogSink((_t, l) => lines.push(l));
});
afterAll(async () => {
  await admin.from("customers").delete().in("id", created);
  await mocks.close();
});

const req = (body: unknown, ip: string) =>
  new Request("http://localhost:3000/api/public", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, "x-platform": "public-web" },
    body: JSON.stringify(body),
  });

async function json(res: Response) {
  const j = (await res.json()) as Record<string, unknown> & { error?: { code: string; message: string } };
  return { status: res.status, body: j, code: j.error?.code, message: j.error?.message };
}

const form = (phone: string, extra: Record<string, unknown> = {}) => ({
  shopSlug: "salone-demo",
  name: "Giulia Verdi",
  phone,
  consentPrivacy: true,
  consentMarketing: true,
  captchaToken: "ok",
  ...extra,
});

async function startOk(phone: string, ip = newIp()) {
  const r = await json(await start(req(form(phone), ip)));
  expect(r.status).toBe(200);
  return { id: r.body.enrollmentId as string, ip };
}

const ev = (name: string) => lines.filter((l) => l.event === name);

describe("funnel completo", () => {
  it("form → SMS → codice → carta: stesso enrollment_id, nessun dato personale nei log", async () => {
    const phone = testPhone();
    const { id, ip } = await startOk(phone);
    const v = await json(await verify(req({ enrollmentId: id, code: "123456" }, ip)));
    expect(v.body).toMatchObject({ status: "created", firstName: "Giulia", card: { stamps: 0, stampsRequired: 10 } });
    expect(v.body.phoneLink).toMatch(/^http:\/\/localhost:3000\/salone-demo\/c\/[\w-]+\.[\w-]+$/);
    const { data: c } = await admin
      .from("customers")
      .select("id, short_code, consent_marketing")
      .eq("phone", phone)
      .single();
    created.push(c!.id as string);
    expect(c?.consent_marketing).toBe(true);

    await funnel(req({ enrollmentId: id, step: "link.shown", wallet: "google" }, ip));
    await funnel(req({ enrollmentId: id, step: "link.clicked", wallet: "google" }, ip));

    const steps = lines.filter((l) => String(l.event).startsWith("enroll.")).map((l) => l.event);
    expect(steps).toEqual([
      "enroll.form.submitted",
      "enroll.otp.sent",
      "enroll.otp.verified",
      "enroll.customer.created",
      "enroll.wallet.link.shown",
      "enroll.wallet.link.clicked",
    ]);
    // dall'SMS in poi tutte le righe hanno l'id dell'iscrizione
    expect(
      lines
        .filter((l) => l.event !== "enroll.form.submitted" && String(l.event).startsWith("enroll."))
        .every((l) => l.enrollment_id === id),
    ).toBe(true);
    const text = JSON.stringify(lines);
    expect(text).not.toContain(phone.slice(3));
    expect(text).not.toContain("Giulia");
    expect(text).not.toContain("Verdi");

    // la sessione non tiene più nome e telefono
    const { data: s } = await admin.from("enrollment_sessions").select("phone, name, status").eq("id", id).single();
    expect(s).toEqual({ phone: null, name: null, status: "verified" });
    // il link breve del telefono porta alla stessa carta
    expect(verifyPhoneLinkToken(String(v.body.phoneLink).split("/").at(-1)!)).toBe(c!.id);
  });

  it("cliente di ritorno: stessa carta, timbri conservati, e il consenso dato ora viene registrato", async () => {
    const phone = testPhone();
    const first = await startOk(phone);
    await verify(req({ enrollmentId: first.id, code: "123456" }, first.ip));
    const { data: c } = await admin.from("customers").select("id").eq("phone", phone).single();
    created.push(c!.id as string);
    await admin.from("customers").update({ stamps: 6, consent_marketing: false }).eq("id", c!.id);

    const again = await startOk(phone);
    const v = await json(await verify(req({ enrollmentId: again.id, code: "123456" }, again.ip)));
    expect(v.body).toMatchObject({ status: "returning", card: { stamps: 6 } });
    expect(
      (await admin.from("customers").select("consent_marketing").eq("id", c!.id).single()).data?.consent_marketing,
    ).toBe(true);
    expect(ev("enroll.customer.returning")).toHaveLength(1);
  });
});

describe("codice sbagliato e blocco", () => {
  it("dice quanti tentativi restano; al 5° errore blocca il numero per 15 minuti", async () => {
    const phone = testPhone();
    const { id, ip } = await startOk(phone);
    const messages: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await json(await verify(req({ enrollmentId: id, code: "000000" }, ip)));
      expect(r.code).toBe("E_OTP_WRONG_CODE");
      messages.push(String(r.message));
    }
    expect(messages).toEqual([
      "Codice non corretto. Ti restano 4 tentativi.",
      "Codice non corretto. Ti restano 3 tentativi.",
      "Codice non corretto. Ti restano 2 tentativi.",
      "Codice non corretto. Ti resta 1 tentativo.",
    ]);
    const last = await json(await verify(req({ enrollmentId: id, code: "000000" }, ip)));
    expect([last.status, last.code]).toEqual([429, "E_OTP_TOO_MANY_ATTEMPTS"]);
    expect(ev("enroll.otp.too_many_attempts")).toHaveLength(1);

    // anche il codice giusto ora è rifiutato, e una nuova iscrizione con lo stesso numero è bloccata
    expect((await json(await verify(req({ enrollmentId: id, code: "123456" }, ip)))).code).toBe(
      "E_OTP_TOO_MANY_ATTEMPTS",
    );
    const blocked = await json(await start(req(form(phone), newIp())));
    expect(blocked.code).toBe("E_OTP_LIMIT");
    expect(blocked.message).toMatch(/riprova tra 1[45] minuti/);
  });

  it("iscrizione scaduta: E_OTP_EXPIRED", async () => {
    const { id, ip } = await startOk(testPhone());
    await admin
      .from("enrollment_sessions")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", id);
    expect((await json(await verify(req({ enrollmentId: id, code: "123456" }, ip)))).code).toBe("E_OTP_EXPIRED");
  });
});

describe("limiti degli SMS", () => {
  it("nuovo codice solo dopo 60 secondi", async () => {
    const { id, ip } = await startOk(testPhone());
    const early = await json(await resend(req({ enrollmentId: id }, ip)));
    expect([early.status, early.code]).toEqual([429, "E_OTP_RESEND_TOO_SOON"]);
    expect(early.message).toMatch(/tra (59|60) secondi/);
    await admin
      .from("enrollment_sessions")
      .update({ last_sent_at: new Date(Date.now() - 61_000).toISOString() })
      .eq("id", id);
    const ok = await json(await resend(req({ enrollmentId: id }, ip)));
    expect(ok.status).toBe(200);
    expect(ev("enroll.otp.sent").at(-1)).toMatchObject({ send_number: 2 });
  });

  it("10 iscrizioni in parallelo con lo stesso numero: solo 3 SMS (limite orario per numero)", async () => {
    const phone = testPhone();
    const results = await Promise.all(Array.from({ length: 10 }, () => start(req(form(phone), newIp())).then(json)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(results.filter((r) => r.code === "E_OTP_LIMIT")).toHaveLength(7);
    expect(ev("enroll.otp.limited")[0]).toMatchObject({ scope: "numero", retry_after_min: 60 });
  });

  it("limite per IP", async () => {
    const before = process.env.OTP_LIMIT_PER_IP_HOUR;
    process.env.OTP_LIMIT_PER_IP_HOUR = "2";
    try {
      const ip = newIp();
      const r = [];
      for (let i = 0; i < 3; i++) r.push(await json(await start(req(form(testPhone()), ip))));
      expect(r.map((x) => x.status)).toEqual([200, 200, 429]);
      expect(ev("enroll.otp.limited")[0]?.scope).toBe("IP");
    } finally {
      process.env.OTP_LIMIT_PER_IP_HOUR = before;
    }
  });
});

describe("controlli prima dell'SMS", () => {
  it("anti-bot non superato: nessun SMS", async () => {
    const phone = testPhone();
    const r = await json(await start(req(form(phone, { captchaToken: "bot" }), newIp())));
    expect([r.status, r.code]).toEqual([400, "E_CAPTCHA_FAILED"]);
    expect(ev("enroll.captcha.failed")[0]?.reason).toBe("invalid-input-response");
    expect(ev("enroll.otp.sent")).toHaveLength(0);
  });

  it.each([
    ["347 12", "Numero incompleto: servono 9 o 10 cifre."],
    ["06 1234 5678", "Serve un numero di cellulare: inizia con 3."],
    ["+41 79 123 45 67", "Per ora la carta è disponibile solo con un numero italiano (+39)."],
  ])("telefono %j rifiutato con il messaggio del design", async (phone, message) => {
    const r = await json(await start(req(form(phone), newIp())));
    expect([r.code, r.message]).toEqual(["E_PHONE_INVALID", message]);
  });

  it("negozio inesistente o sospeso", async () => {
    expect((await json(await start(req(form(testPhone(), { shopSlug: "non-esiste" }), newIp())))).code).toBe(
      "E_SHOP_NOT_FOUND",
    );
    const r = await json(await start(req(form(testPhone(), { shopSlug: "negozio-sospeso" }), newIp())));
    expect(r.code).toBe("E_SHOP_SUSPENDED");
    expect(ev("enroll.shop.unavailable").at(-1)).toMatchObject({ reason: "sospeso" });
  });
});

describe("fornitore Twilio Verify (simulato)", () => {
  beforeEach(() => {
    process.env.OTP_PROVIDER = "twilio";
    process.env.TWILIO_ACCOUNT_SID = `AC${"0".repeat(32)}`;
    process.env.TWILIO_AUTH_TOKEN = "t".repeat(32);
    process.env.TWILIO_VERIFY_SERVICE_SID = `VA${"0".repeat(32)}`;
  });

  it("SMS inviato e codice controllato da Twilio", async () => {
    const phone = testPhone();
    const { id, ip } = await startOk(phone);
    expect(mocks.sms.get(phone)).toBe("654321");
    expect((await json(await verify(req({ enrollmentId: id, code: "123456" }, ip)))).code).toBe("E_OTP_WRONG_CODE");
    const ok = await json(await verify(req({ enrollmentId: id, code: "654321" }, ip)));
    expect(ok.body.status).toBe("created");
    const { data } = await admin.from("customers").select("id").eq("phone", phone).single();
    created.push(data!.id as string);
  });

  it("Twilio rifiuta l'invio: E_OTP_SEND_FAILED, una riga di errore, l'invio non conta per i limiti", async () => {
    const phone = testPhone();
    mocks.twilioFailNext(401);
    const r = await json(await start(req(form(phone), newIp())));
    expect([r.status, r.code]).toEqual([502, "E_OTP_SEND_FAILED"]);
    expect(lines.filter((l) => l.level === "error")).toHaveLength(1);
    expect(ev("enroll.otp.send_failed")[0]).toMatchObject({ http_status: 401 });
    // l'invio fallito non consuma il limite: 3 tentativi riusciti dopo
    for (let i = 0; i < 3; i++) expect((await json(await start(req(form(phone), newIp())))).status).toBe(200);
  });
});

describe("disiscrizione e link", () => {
  it("link firmato e monouso: revoca il consenso (in audit come cliente), poi 'già disiscritto'", async () => {
    const { data: c } = await admin.rpc("enroll_customer", {
      p_shop_id: SALONE,
      p_name: "Cliente Promo",
      p_phone: testPhone(),
      p_consent_privacy: true,
      p_consent_marketing: true,
      p_meta: { actor_type: "customer" },
    });
    const id = (c as { customer_id: string }).customer_id;
    created.push(id);
    const token = unsubscribeToken(id, "7d1e2b3c-4d5e-4f43-9a51-5f1c2a9e0d1b");

    const first = await json(await unsubscribe(req({ token }, newIp())));
    expect(first.body).toEqual({ status: "done", shopName: "Salone Demo" });
    expect(
      (await admin.from("customers").select("consent_marketing").eq("id", id).single()).data?.consent_marketing,
    ).toBe(false);
    const { data: audit } = await admin
      .from("audit_log")
      .select("action, actor_type")
      .eq("entity_id", id)
      .eq("action", "marketing_consent");
    expect(audit).toEqual([{ action: "marketing_consent", actor_type: "customer" }]);

    expect((await json(await unsubscribe(req({ token }, newIp())))).body.status).toBe("already");
    const forged = `${token.split(".")[0]}.firmafalsa`;
    expect((await json(await unsubscribe(req({ token: forged }, newIp())))).code).toBe("E_LINK_INVALID");
    expect(ev("marketing.unsubscribe.ok").map((l) => l.already_unsubscribed)).toEqual([false, true]);
  });

  it("link breve del telefono: scade dopo 24 ore", () => {
    const t = phoneLinkToken("c1", Date.parse("2026-11-03T10:00:00Z"));
    expect(verifyPhoneLinkToken(t, Date.parse("2026-11-04T09:59:00Z"))).toBe("c1");
    expect(verifyPhoneLinkToken(t, Date.parse("2026-11-04T10:01:00Z"))).toBeNull();
  });

  it("pulizia: le iscrizioni più vecchie di 24 ore spariscono (con nome e telefono)", async () => {
    const { id } = await startOk(testPhone());
    await admin
      .from("enrollment_sessions")
      .update({ created_at: new Date(Date.now() - 25 * 3600_000).toISOString() })
      .eq("id", id);
    const { data } = await admin.rpc("enrollment_cleanup");
    expect((data as { sessions: number }).sessions).toBeGreaterThanOrEqual(1);
    expect((await admin.from("enrollment_sessions").select("id").eq("id", id)).data).toEqual([]);
  });
});
