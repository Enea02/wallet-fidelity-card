import "server-only";
import type { MeResponse, ShopsResponse } from "@loyalty/shared/api";
import type { z } from "zod";
import type { AuthUser } from "../auth";
import { supabaseAdmin } from "../supabase";
import type { StaffRole } from "../types";

interface Row {
  role: StaffRole;
  display_name: string;
  shops: {
    id: string;
    name: string;
    slug: string;
    hex_color: string;
    logo_url: string | null;
    stamps_required: number;
    reward_label: string;
    status: "active" | "suspended";
  };
}

async function memberships(userId: string): Promise<Row[]> {
  const { data, error } = await supabaseAdmin()
    .from("staff")
    .select(
      "role, display_name, shops!inner(id, name, slug, hex_color, logo_url, stamps_required, reward_label, status)",
    )
    .eq("user_id", userId)
    .order("display_name");
  if (error) throw error;
  return (data ?? []) as unknown as Row[];
}

export async function me(user: AuthUser): Promise<z.input<typeof MeResponse>> {
  const rows = await memberships(user.id);
  return {
    user: { id: user.id, email: user.email },
    memberships: rows.map((r) => ({
      shopId: r.shops.id,
      shopName: r.shops.name,
      slug: r.shops.slug,
      role: r.role,
      displayName: r.display_name,
    })),
  };
}

export async function myShops(user: AuthUser): Promise<z.input<typeof ShopsResponse>> {
  const rows = await memberships(user.id);
  return {
    shops: rows.map((r) => ({
      id: r.shops.id,
      name: r.shops.name,
      slug: r.shops.slug,
      role: r.role,
      hexColor: r.shops.hex_color,
      logoUrl: r.shops.logo_url,
      stampsRequired: r.shops.stamps_required,
      rewardLabel: r.shops.reward_label,
      status: r.shops.status,
    })),
  };
}
