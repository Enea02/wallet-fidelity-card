import type { MetadataRoute } from "next";

// Rende /staff installabile come PWA sul telefono del negozio
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Timbri – Staff",
    short_name: "Timbri",
    start_url: "/staff",
    display: "standalone",
    background_color: "#f7f5f2",
    theme_color: "#1f2937",
    icons: [],
  };
}
