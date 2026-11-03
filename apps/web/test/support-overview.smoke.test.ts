/**
 * Pannello interno, Panoramica e card dei negozi contro il Supabase locale: le funzioni di sola lettura
 * support_*_overview vedono attività, carte non sincronizzate e ticket, e non sono chiamabili dai client.
 * Un negozio creato solo per questo file: gli altri test in parallelo non cambiano i suoi numeri.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navCounts, networkOverview, shopOverview, shopsOverview } from "@/lib/support/overview";
import { admin, giulia, newCustomer } from "./support/merchant";

const MARCO = "55555555-5555-4555-8555-555555555555"; // operatore del seed, messo nello staff del negozio di prova
const SLUG = `smoke-pano-${Date.now().toString(36)}`;
const NAME = `Panoramica ${SLUG.slice(-6)}`;
let SHOP = "";

beforeAll(async () => {
  const { data, error } = await admin
    .from("shops")
    .insert({ slug: SLUG, name: NAME, stamp_cooldown_minutes: 0 })
    .select("id")
    .single();
  if (error) throw error;
  SHOP = data.id as string;
  const staff = await admin
    .from("staff")
    .insert({ user_id: MARCO, shop_id: SHOP, role: "operator", display_name: "Marco" });
  if (staff.error) throw staff.error;
});

// cancellare il negozio toglie a cascata clienti, timbri, staff, errori di sincronizzazione e pacchetti
afterAll(async () => {
  if (SHOP) await admin.from("shops").delete().eq("id", SHOP);
});

const stamp = async (customerId: string) => {
  const { error } = await admin.rpc("add_stamp", {
    p_customer_id: customerId,
    p_meta: { actor_type: "staff", actor_id: MARCO, platform: "script" },
  });
  expect(error).toBeNull();
};

describe("Panoramica del pannello interno", () => {
  it("nuovi clienti e timbri entrano nei numeri del negozio, della card e della rete", async () => {
    const a = await newCustomer(SHOP);
    const b = await newCustomer(SHOP);
    await stamp(a.id);
    await stamp(a.id);
    await stamp(b.id);

    const [net, shop, cards] = await Promise.all([networkOverview(7), shopOverview(SHOP), shopsOverview()]);
    expect(shop).toMatchObject({
      customers: 2,
      customers_new_7: 2,
      activity_7: 3,
      activity_prev_7: 0,
      visitors_60: 2,
      returning_60: 1, // solo a ha 2+ visite
    });
    expect(shop.recent.map((r) => r.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(shop.recent.find((r) => r.id === a.id)).toMatchObject({ stamps: 2, wallet_error: null });

    // serie di 30 giorni che finisce oggi (ora italiana), con l'attività di oggi
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
    expect(shop.series).toHaveLength(30);
    expect(shop.series.at(-1)).toEqual({ day: today, count: 3 });
    expect(net.series).toHaveLength(30);
    expect(net.series.at(-1)).toMatchObject({ day: today });

    const card = cards.find((s) => s.id === SHOP)!;
    expect(card).toMatchObject({
      slug: SLUG,
      loyalty_mode: "timbri",
      customers: 2,
      customers_new_7: 2,
      activity_7: 3,
      staff: 1,
      owner: null,
    });
    expect(card.spark).toHaveLength(30);
    expect(card.spark.at(-1)).toBe(3);
    expect(card.issues).toEqual([]);
  });

  it("carta non sincronizzata e ticket di diagnostica: da guardare, nella card e nel numero della barra", async () => {
    const c = await newCustomer(SHOP);
    const fail = await admin
      .from("wallet_sync_failures")
      .insert({
        customer_id: c.id,
        shop_id: SHOP,
        wallet: "google",
        kind: "object",
        error_code: "E_GOOGLE_API",
        error: "prova smoke",
        next_retry_at: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("id")
      .single();
    expect(fail.error).toBeNull();
    const bundle = await admin
      .from("diagnostic_bundles")
      .insert({ shop_id: SHOP, platform: "ios", app_version: "1.0.0", size_bytes: 10, events: [] })
      .select("id, ticket_code")
      .single();
    expect(bundle.error).toBeNull();

    const [net, cards, shop, counts] = await Promise.all([
      networkOverview(7),
      shopsOverview(),
      shopOverview(SHOP),
      navCounts(),
    ]);
    const watch = net.watch.filter((w) => w.shop_id === SHOP);
    expect(watch).toHaveLength(1); // una riga per negozio: la più grave
    expect(watch[0]).toMatchObject({ kind: "sync", shop_name: NAME, detail: { cards: 1, error_code: "E_GOOGLE_API" } });
    expect(net.unsynced_shops).toContain(NAME);
    expect(net.open_tickets).toBeGreaterThanOrEqual(1);

    const card = cards.find((s) => s.id === SHOP)!;
    expect(card.issues.map((i) => i.kind)).toEqual(["sync", "ticket"]);
    expect(card.issues[1]!.detail).toMatchObject({ ticket: bundle.data!.ticket_code, platform: "ios", total: 1 });

    expect(shop.google).toMatchObject({ failing: 1, last_error_code: "E_GOOGLE_API" });
    expect(shop.issues.map((i) => i.kind)).toEqual(["sync", "ticket"]);
    expect(counts.problemShops).toBeGreaterThanOrEqual(1);
    expect(counts.tickets).toBeGreaterThanOrEqual(1);
  });

  it("le funzioni della Panoramica non sono chiamabili dai client (anonimo o staff)", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const staff = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${await giulia()}` } },
    });
    for (const db of [anon, staff]) {
      for (const [fn, args] of [
        ["support_network_overview", { p_days: 7 }],
        ["support_shops_overview", {}],
        ["support_shop_overview", { p_shop_id: SHOP }],
        ["support_shop_issues", {}],
      ] as const) {
        const { data, error } = await db.rpc(fn, args);
        expect(data, fn).toBeNull();
        expect(error?.code, fn).toBe("42501");
      }
      const view = await db.from("support_activity").select("shop_id").limit(1);
      expect(view.error?.code).toBe("42501");
    }
  });
});
