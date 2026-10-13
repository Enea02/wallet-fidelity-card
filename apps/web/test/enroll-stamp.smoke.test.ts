/**
 * Smoke test dello scheletro contro il Supabase locale (`pnpm db:start`):
 * iscrizione di un cliente e timbro dello staff, passando dai veri route handler.
 * Usa negozio e utente staff di supabase/seed.sql.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as enroll } from "@/app/api/enroll/route";
import { POST as stamp } from "@/app/api/staff/stamp/route";

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SHOP_ID = "99999999-9999-4999-8999-999999999999";
/** QR del "Cliente Demo" di supabase/seed.sql */
const SEED_CUSTOMER_QR = "0123456789abcdef0123456789abcdef";
const phone = `+39399${Date.now().toString().slice(-7)}`;

const env = (name: string) => process.env[name] ?? "";
const admin = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const post = (body: unknown, token?: string) =>
  new Request("http://localhost:3000/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });

let staffToken = "";

beforeAll(async () => {
  const anon = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email: "staff@salone-demo.test",
    password: "password-demo-locale",
  });
  if (error) throw new Error(`Login staff di prova fallito (seed applicato?): ${error.message}`);
  staffToken = data.session.access_token;
});

afterAll(async () => {
  await admin.from("customers").delete().eq("shop_id", SHOP_ID).eq("phone", phone);
});

describe("scheletro: iscrizione e timbro in locale", () => {
  it("iscrive un nuovo cliente (senza Google Wallet il link è assente)", async () => {
    const res = await enroll(post({ shopSlug: "salone-demo", name: "Smoke Test", phone, consentPrivacy: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ googleSaveUrl: null });
  });

  it("lo stesso telefono ritrova lo stesso cliente", async () => {
    const res = await enroll(post({ shopSlug: "salone-demo", name: "Smoke Test", phone, consentPrivacy: true }));
    expect(res.status).toBe(200);
    const { count } = await admin
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", SHOP_ID)
      .eq("phone", phone);
    expect(count).toBe(1);
  });

  it("lo staff aggiunge un timbro e resta traccia in stamp_events", async () => {
    const { data: customer } = await admin
      .from("customers")
      .select("id, qr_token")
      .eq("shop_id", SHOP_ID)
      .eq("phone", phone)
      .single();
    expect(customer).not.toBeNull();

    const res = await stamp(post({ shopId: SHOP_ID, qrToken: customer?.qr_token }, staffToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      customer: { stamps: number; stampsRequired: number };
      rewardUnlocked: boolean;
    };
    expect(body.customer.stamps).toBe(1);
    expect(body.customer.stampsRequired).toBe(10);
    expect(body.rewardUnlocked).toBe(false);

    const { count } = await admin
      .from("stamp_events")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customer?.id ?? "")
      .eq("kind", "stamp");
    expect(count).toBe(1);
  });

  it("senza token il timbro è rifiutato", async () => {
    const res = await stamp(post({ shopId: SHOP_ID, qrToken: SEED_CUSTOMER_QR }));
    expect(res.status).toBe(401);
  });

  it("lo staff non può timbrare per un negozio non suo", async () => {
    const res = await stamp(post({ shopId: OTHER_SHOP_ID, qrToken: SEED_CUSTOMER_QR }, staffToken));
    expect(res.status).toBe(403);
  });
});
