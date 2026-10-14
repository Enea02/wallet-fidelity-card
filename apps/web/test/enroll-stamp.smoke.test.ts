/**
 * Smoke test del percorso principale contro il Supabase locale (`pnpm db:start`):
 * iscrizione dal web pubblico, poi scansione e timbro dall'API esercente.
 */
import { supportCodeFromRequestId } from "@loyalty/shared/logging/request-id";
import { afterAll, describe, expect, it } from "vitest";
import { POST as enroll } from "@/app/api/enroll/route";
import { SALONE, admin, call, marco } from "./support/merchant";

const phone = `+39399${Date.now().toString().slice(-7)}`;

const post = (body: unknown) =>
  new Request("http://localhost:3000/api/enroll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

afterAll(async () => {
  await admin.from("customers").delete().eq("shop_id", SALONE).eq("phone", phone);
});

describe("iscrizione e timbro", () => {
  it("iscrive un nuovo cliente (senza Google Wallet il link è assente)", async () => {
    const res = await enroll(post({ shopSlug: "salone-demo", name: "Smoke Test", phone, consentPrivacy: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ googleSaveUrl: null });
  });

  it("lo stesso telefono ritrova lo stesso cliente", async () => {
    await enroll(post({ shopSlug: "salone-demo", name: "Smoke Test", phone, consentPrivacy: true }));
    const { count } = await admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", SALONE)
      .eq("phone", phone);
    expect(count).toBe(1);
  });

  it("lo staff scansiona il QR e aggiunge un timbro; resta traccia in stamp_events", async () => {
    const { data: c } = await admin.from("customers").select("id, qr_token").eq("phone", phone).single();
    const token = await marco();
    const found = await call("lookup", { token, shopId: SALONE, body: { code: c?.qr_token } });
    expect(found.json).toMatchObject({ card: { id: c?.id, stamps: 0, stampsRequired: 10 } });

    const stamped = await call("stamp", { token, shopId: SALONE, body: { customerId: c?.id } });
    expect(stamped.json).toMatchObject({ card: { stamps: 1 }, rewardUnlocked: false });
    const { count } = await admin
      .from("stamp_events")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", c?.id ?? "")
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
