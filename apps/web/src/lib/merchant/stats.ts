import "server-only";
import type { StatsResponse } from "@loyalty/shared/api";
import type { ActorFields } from "@loyalty/shared/logging/events";
import type { z } from "zod";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import type { Shop } from "../types";

interface DbWeek {
  week_start: string;
  stamps: number;
  unlocked: number;
  redeems: number;
  enrollments: number;
}

interface DbInactive {
  customer_id: string;
  name: string;
  stamps: number;
  last_activity_at: string;
}

/** Statistiche per la dashboard (funzione Postgres shop_stats, settimane ISO in ora italiana). */
export async function shopStats(shop: Shop, actor: ActorFields): Promise<z.input<typeof StatsResponse>> {
  const { data, error } = await supabaseAdmin().rpc("shop_stats", { p_shop_id: shop.id });
  if (error) throw error;
  const s = data as {
    customers_total: number;
    customers_marketing: number;
    inactive_60_days: number;
    inactive_marketing: number;
    inactive_recent: DbInactive[];
    weeks: DbWeek[];
  };
  const weeks = s.weeks.map((w) => ({
    weekStart: w.week_start,
    stamps: w.stamps,
    unlocked: w.unlocked,
    redeems: w.redeems,
    enrollments: w.enrollments,
  }));
  log.event("stats.viewed", { ...actor, shop_name: shop.name, customers_total: s.customers_total });
  const thisWeek = weeks.at(-1) ?? { weekStart: "", stamps: 0, unlocked: 0, redeems: 0, enrollments: 0 };
  return {
    customersTotal: s.customers_total,
    customersMarketing: s.customers_marketing,
    inactive60Days: s.inactive_60_days,
    inactiveMarketing: s.inactive_marketing,
    inactiveRecent: s.inactive_recent.map((c) => ({
      customerId: c.customer_id,
      name: c.name,
      stamps: c.stamps,
      lastActivityAt: new Date(c.last_activity_at).toISOString(),
    })),
    thisWeek,
    weeks,
  };
}
