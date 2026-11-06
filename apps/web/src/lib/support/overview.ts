import "server-only";
import { setContext } from "../observability/context";
import { supabaseAdmin } from "../supabase";
import { isProblem, type Issue, type NetworkOverview, type ShopCard, type ShopOverview } from "./overview-view";

/*
 * Letture della Panoramica, delle card dei negozi e della scheda negozio del pannello interno.
 * Solo lettura (funzioni Postgres support_*_overview); le chiama solo il server dopo supportPage.
 */

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const PERIODS = [1, 7, 30] as const;
export type Period = (typeof PERIODS)[number];

export const networkOverview = (days: Period) => rpc<NetworkOverview>("support_network_overview", { p_days: days });

export const shopsOverview = () => rpc<ShopCard[]>("support_shops_overview");

export async function shopOverview(shopId: string): Promise<ShopOverview> {
  setContext({ shop_id: shopId });
  return rpc<ShopOverview>("support_shop_overview", { p_shop_id: shopId });
}

/** Numeri della barra laterale: negozi con problemi (Google o ticket) e ticket arrivati nelle ultime 24 ore. */
export async function navCounts(): Promise<{ problemShops: number; tickets: number }> {
  const db = supabaseAdmin();
  const [issues, tickets] = await Promise.all([
    db.rpc("support_shop_issues"),
    db
      .from("diagnostic_bundles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
  ]);
  if (issues.error) throw issues.error;
  if (tickets.error) throw tickets.error;
  const rows = (issues.data ?? []) as Array<Issue & { shop_id: string }>;
  return { problemShops: new Set(rows.filter(isProblem).map((r) => r.shop_id)).size, tickets: tickets.count ?? 0 };
}
