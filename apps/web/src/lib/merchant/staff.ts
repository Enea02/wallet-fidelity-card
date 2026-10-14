import "server-only";
import type { Role, StaffMember } from "@loyalty/shared/api";
import { AppError } from "@loyalty/shared/errors";
import { maskEmail } from "@loyalty/shared/logger";
import type { ActorFields } from "@loyalty/shared/logging/events";
import type { z } from "zod";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import type { Shop } from "../types";
import { callDomain, staffMeta } from "./domain-call";

type Member = z.input<typeof StaffMember>;

async function emailOf(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

export async function listStaff(shop: Shop): Promise<{ staff: Member[] }> {
  const { data, error } = await supabaseAdmin()
    .from("staff")
    .select("user_id, display_name, role")
    .eq("shop_id", shop.id)
    .order("role")
    .order("display_name");
  if (error) throw error;
  const rows = (data ?? []) as Array<{ user_id: string; display_name: string; role: Role }>;
  const emails = await Promise.all(rows.map((r) => emailOf(r.user_id)));
  return {
    staff: rows.map((r, i) => ({
      userId: r.user_id,
      displayName: r.display_name,
      role: r.role,
      email: emails[i] ?? null,
    })),
  };
}

/**
 * Aggiunge una persona allo staff. Se non ha un account riceve l'email d'invito di Supabase Auth
 * con il link alla web app esercente; se ce l'ha già (es. staff di un altro negozio) viene solo aggiunta.
 */
export async function inviteStaff(
  shop: Shop,
  input: { email: string; displayName: string; role: Role },
  userId: string,
  actor: ActorFields,
) {
  const db = supabaseAdmin();
  const email = input.email.trim().toLowerCase();
  const { data: existingId, error } = await db.rpc("find_user_id_by_email", { p_email: email });
  if (error) throw error;

  let memberId = existingId as string | null;
  if (!memberId) {
    const base = process.env.MERCHANT_APP_URL ?? process.env.APP_BASE_URL ?? "";
    const { data, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${base.replace(/\/$/, "")}/invito`,
      data: { name: input.displayName },
    });
    if (inviteError || !data.user) {
      throw new AppError(
        "E_INVITE_FAILED",
        `invito di ${maskEmail(email)} non riuscito: ${inviteError?.message ?? "utente non creato"}`,
      );
    }
    memberId = data.user.id;
  }

  await callDomain("add_staff_member", {
    p_shop_id: shop.id,
    p_user_id: memberId,
    p_role: input.role,
    p_display_name: input.displayName,
    p_meta: staffMeta(userId),
  });
  log.event("staff.invite.sent", {
    ...actor,
    shop_name: shop.name,
    member_name: input.displayName.trim(),
    member_email: maskEmail(email),
    member_role: input.role,
    existing_account: existingId !== null,
  });
  return {
    member: { userId: memberId, displayName: input.displayName.trim(), role: input.role, email },
    existingAccount: existingId !== null,
  };
}

export async function updateStaff(
  shop: Shop,
  memberId: string,
  input: { role?: Role | undefined; displayName?: string | undefined },
  userId: string,
  actor: ActorFields,
) {
  const r = await callDomain<{ role_before: Role; role: Role; display_name: string }>("update_staff_member", {
    p_shop_id: shop.id,
    p_user_id: memberId,
    p_role: input.role ?? null,
    p_display_name: input.displayName ?? null,
    p_meta: staffMeta(userId),
  });
  log.event("staff.role.changed", {
    ...actor,
    shop_name: shop.name,
    member_name: r.display_name,
    role_before: r.role_before,
    role_after: r.role,
  });
  return { member: { userId: memberId, displayName: r.display_name, role: r.role, email: await emailOf(memberId) } };
}

export async function removeStaff(shop: Shop, memberId: string, userId: string, actor: ActorFields) {
  const r = await callDomain<{ role: Role; display_name: string }>("remove_staff_member", {
    p_shop_id: shop.id,
    p_user_id: memberId,
    p_meta: staffMeta(userId),
  });
  log.event("staff.revoked", { ...actor, shop_name: shop.name, member_name: r.display_name, member_role: r.role });
  return { removed: true as const };
}
