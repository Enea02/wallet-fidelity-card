import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // google-auth-library usa moduli Node: resta lato server
  serverExternalPackages: ["google-auth-library", "jsonwebtoken"],
};

export default nextConfig;
