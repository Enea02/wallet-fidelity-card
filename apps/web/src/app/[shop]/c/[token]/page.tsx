import { redirect } from "next/navigation";
import { CUSTOMER_COLS, SHOP_COLS } from "@/lib/db-columns";
import { log } from "@/lib/observability/logger";
import { verifyPhoneLinkToken } from "@/lib/public/links";
import { supabaseAdmin } from "@/lib/supabase";
import type { Customer, Shop } from "@/lib/types";
import { googleEnabled } from "@/lib/wallet/google/config";
import { saveUrl } from "@/lib/wallet/google/payload";
import { StatusScreen } from "../../../_components/StatusScreen";

export const dynamic = "force-dynamic";

function Expired() {
  return (
    <StatusScreen title="Link scaduto">
      <p className="lw-lead">
        Questo link per salvare la carta non è più valido (dura 24 ore). Iscriviti di nuovo dal QR del bancone con lo
        stesso numero: ritrovi la tua carta con i timbri.
      </p>
    </StatusScreen>
  );
}

/** QR mostrato sul computer → aperto dal telefono: porta al "Salva in Google Wallet" della carta. */
export default async function OpenCard({ params }: { params: Promise<{ shop: string; token: string }> }) {
  const { token } = await params;
  const customerId = verifyPhoneLinkToken(token);
  if (!customerId) {
    log.event("public.link.invalid", { link_kind: "carta", reason: "firma non valida o scaduto" });
    return <Expired />;
  }
  const db = supabaseAdmin();
  const { data: customer } = await db
    .from("customers")
    .select(CUSTOMER_COLS)
    .eq("id", customerId)
    .maybeSingle<Customer>();
  const { data: shop } = customer
    ? await db.from("shops").select(SHOP_COLS).eq("id", customer.shop_id).maybeSingle<Shop>()
    : { data: null };
  if (!customer || !shop || customer.deleted_at || shop.status !== "active") {
    log.event("public.link.invalid", {
      link_kind: "carta",
      reason: customer?.deleted_at ? "carta cancellata" : "negozio non attivo",
    });
    return <Expired />;
  }

  const { data: session } = await db
    .from("enrollment_sessions")
    .select("id")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  log.event("enroll.wallet.link.clicked", {
    enrollment_id: (session?.id as string | undefined) ?? "n/d",
    shop_name: shop.name,
    customer_ref: customer.short_code,
    wallet: "qr-da-computer",
  });

  if (!googleEnabled()) {
    return (
      <StatusScreen title="La tua carta" brand={shop.hex_color}>
        <p className="lw-lead">
          Mostra in cassa il codice <strong>{customer.short_code}</strong>.
        </p>
      </StatusScreen>
    );
  }
  redirect(saveUrl(shop, customer));
}
