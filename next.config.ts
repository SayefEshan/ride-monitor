import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with only the files the server actually needs, so
  // the production image ships without node_modules. `public` and
  // `.next/static` are not included automatically — the Dockerfile copies
  // them in.
  output: "standalone",
};

export default nextConfig;
