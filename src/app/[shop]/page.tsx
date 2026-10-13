import { notFound } from "next/navigation";
import { getShopBySlug } from "@/lib/loyalty";
import EnrollForm from "./EnrollForm";

export const dynamic = "force-dynamic";

export default async function EnrollPage({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) notFound();

  return (
    <main>
      <h1>{shop.name}</h1>
      <p className="muted">
        Carta fedeltà digitale: ogni {shop.stamps_required} visite, {shop.reward_label.toLowerCase()}. Niente app da
        scaricare, la carta va nel Wallet del telefono.
      </p>
      <EnrollForm shopSlug={shop.slug} accent={shop.hex_color} />
    </main>
  );
}
