/**
 * Percorso principale contro il Supabase locale (`pnpm db:start`): iscrizione dal web pubblico
 * con verifica del telefono (OTP di prova), poi scansione e timbro dall'API esercente.
 */
import { supportCodeFromRequestId } from "@loyalty/shared/logging/request-id";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as start } from "@/app/api/public/enroll/start/route";
import { POST as verify } from "@/app/api/public/enroll/verify/route";
import { startPublicMocks, type PublicMocks } from "./support/public-mocks";
import { SALONE, admin, call, marco, testPhone } from "./support/merchant";

const phone = testPhone();
let mocks: PublicMocks;
let qrToken = "";

const post = (body: unknown) =>
  new Request("http://localhost:3000/api/public", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  mocks = await startPublicMocks();
  process.env.TURNSTILE_VERIFY_URL = mocks.turnstileUrl;
  process.env.OTP_PROVIDER = "test";
});
afterAll(async () => {
  await admin.from("customers").delete().eq("shop_id", SALONE).eq("phone", phone);
  await mocks.close();
});

async function enrollWithOtp() {
  const s = await start(
    post({
      shopSlug: "salone-demo",
      name: "Smoke Test",
      phone,
      consentPrivacy: true,
      consentMarketing: false,
      captchaToken: "ok",
    }),
  );
  expect(s.status).toBe(200);
  const { enrollmentId } = (await s.json()) as { enrollmentId: string };
  const v = await verify(post({ enrollmentId, code: "123456" }));
  expect(v.status).toBe(200);
  return (await v.json()) as { status: string; card: { qrToken: string; stamps: number } };
}

describe("iscrizione e timbro", () => {
  it("iscrive un nuovo cliente dopo la verifica del telefono", async () => {
    const r = await enrollWithOtp();
    expect(r).toMatchObject({ status: "created", card: { stamps: 0 } });
    qrToken = r.card.qrToken;
  });

  it("lo stesso telefono ritrova la stessa carta", async () => {
    const r = await enrollWithOtp();
    expect(r).toMatchObject({ status: "returning", card: { qrToken } });
    const { count } = await admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", SALONE)
      .eq("phone", phone);
    expect(count).toBe(1);
  });

  it("lo staff scansiona il QR e aggiunge un timbro; resta traccia in stamp_events", async () => {
    const token = await marco();
    const found = await call("lookup", { token, shopId: SALONE, body: { code: qrToken } });
    const id = (found.json?.card as { id: string }).id;
    const stamped = await call("stamp", { token, shopId: SALONE, body: { customerId: id } });
    expect(stamped.json).toMatchObject({ card: { stamps: 1 }, rewardUnlocked: false });
    const { count } = await admin
      .from("stamp_events")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", id)
      .eq("kind", "stamp");
    expect(count).toBe(1);
  });

  it("senza token: E_AUTH_REQUIRED con il codice assistenza della richiesta", async () => {
    const r = await call("stamp", { shopId: SALONE, body: { customerId: "33333333-3333-4333-8333-333333333333" } });
    const rid = r.res.headers.get("x-request-id") ?? "";
    expect(r.json).toEqual({
      error: {
        code: "E_AUTH_REQUIRED",
        message: "Devi accedere per continuare.",
        support_code: supportCodeFromRequestId(rid),
      },
    });
  });
});
