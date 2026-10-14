import type { MetadataRoute } from "next";

/** Pagine dei negozi indicizzabili; API e link personali (disiscrizione, carta) no. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/u/", "/*/c/"] }] };
}
