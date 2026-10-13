/**
 * Modalità diagnostica sul database reale (`pnpm db:start`): vincoli della tabella
 * e chiusura atomica delle scadenze, che deve valere anche con più istanze del server.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false },
});

afterAll(async () => {
  await db.from("diagnostic_modes").delete().eq("enabled_by", "smoke-test");
});

const enable = (hours: number, reason = "smoke test diagnostica") =>
  db.rpc("enable_diagnostic_mode", {
    p_scope_type: "shop",
    p_scope_id: SHOP_ID,
    p_scope_label: "salone-demo",
    p_reason: reason,
    p_enabled_by: "smoke-test",
    p_hours: hours,
  });

describe("diagnostic_modes", () => {
  it("rifiuta durate oltre 7 giorni e motivi vuoti", async () => {
    expect((await enable(169)).error?.message).toContain("diagnostic_duration_out_of_range");
    expect((await enable(0)).error).not.toBeNull();
    expect((await enable(24, "  ")).error).not.toBeNull();
  });

  it("una scadenza viene chiusa una volta sola anche con 5 chiusure concorrenti", async () => {
    const { data, error } = await enable(24).single<{ id: string }>();
    expect(error).toBeNull();
    // forza la scadenza nel passato (vincolo: expires_at > enabled_at)
    await db
      .from("diagnostic_modes")
      .update({
        enabled_at: new Date(Date.now() - 7200_000).toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      .eq("id", data?.id ?? "");

    const results = await Promise.all(Array.from({ length: 5 }, () => db.rpc("close_expired_diagnostic_modes")));
    const closed = results
      .flatMap((r) => (r.data as Array<{ id: string }> | null) ?? [])
      .filter((m) => m.id === data?.id);
    expect(closed).toHaveLength(1);
  });

  it("disattivare due volte la stessa modalità chiude una volta sola", async () => {
    const { data } = await enable(1).single<{ id: string }>();
    const first = await db.rpc("disable_diagnostic_mode", { p_id: data?.id, p_disabled_by: "smoke-test" });
    const second = await db.rpc("disable_diagnostic_mode", { p_id: data?.id, p_disabled_by: "smoke-test" });
    expect(first.data).toHaveLength(1);
    expect(second.data).toHaveLength(0);
  });
});
