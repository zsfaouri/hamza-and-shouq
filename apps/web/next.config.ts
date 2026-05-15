import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.env.VERCEL ? undefined : join(__dirname, "../.."),
  serverExternalPackages: ["whatsapp-web.js"],
};

export default nextConfig;
