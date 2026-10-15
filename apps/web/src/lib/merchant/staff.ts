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

interface OverviewRow {
  user_id: string;
  display_name: string;
  role: Role;
  email: string | null;
  stamps_given: number;
  invite_pending: boolean;
  invited_at: string | null;
}

const toMember = (r: OverviewRow): Member => ({
  userId: r.user_id,
  displayName: r.display_name,
  role: r.role,
  email: r.email,
  stampsGiven: Number(r.stamps_given),
  invitePending: r.invite_pending,
  invitedAt: r.invited_at ? new Date(r.invited_at).toISOString() : null,
});

/** Staff del negozio con timbri dati e inviti in attesa (funzione staff_overview). */
async function overview(shop: Shop): Promise<OverviewRow[]> {
  const { data, error } = await supabaseAdmin().rpc("staff_overview", { p_shop_id: shop.id });
  if (error) throw error;
  return (data ?? []) as OverviewRow[];
}

async function memberOf(shop: Shop, userId: string): Promise<Member> {
  const row = (await overview(shop)).find((r) => r.user_id === userId);
  if (!row) throw new AppError("E_STAFF_NOT_FOUND", `l'utente ${userId} non è nello staff del negozio ${shop.id}`);
  return toMember(row);
}

export async function listStaff(shop: Shop): Promise<{ staff: Member[] }> {
  return { staff: (await overview(shop)).map(toMember) };
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
      data: { name: input.displayName, shop_name: shop.name },
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
  return { member: await memberOf(shop, memberId), existingAccount: existingId !== null };
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
  return { member: await memberOf(shop, memberId) };
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

/** Reinvia l'email d'invito a chi non l'ha ancora accettato (stesso link: /invito della web app). */
export async function resendInvite(shop: Shop, memberId: string, actor: ActorFields) {
  const member = await memberOf(shop, memberId);
  if (!member.invitePending || !member.email) {
    throw new AppError(
      "E_VALIDATION",
      `${member.displayName} ha già accettato l'invito: niente da reinviare`,
      { fields: ["params.userId"] },
      { userMessage: `${member.displayName} ha già accettato l'invito e può accedere con la sua password.` },
    );
  }
  const base = process.env.MERCHANT_APP_URL ?? process.env.APP_BASE_URL ?? "";
  const { error } = await supabaseAdmin().auth.admin.inviteUserByEmail(member.email, {
    redirectTo: `${base.replace(/\/$/, "")}/invito`,
    data: { name: member.displayName, shop_name: shop.name },
  });
  if (error) {
    throw new AppError(
      "E_INVITE_FAILED",
      `reinvio dell'invito a ${maskEmail(member.email)} non riuscito: ${error.message}`,
    );
  }
  log.event("staff.invite.resent", {
    ...actor,
    shop_name: shop.name,
    member_name: member.displayName,
    member_email: maskEmail(member.email),
  });
  return { member: await memberOf(shop, memberId) };
}
