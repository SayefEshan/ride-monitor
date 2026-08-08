import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with only the files the server actually needs, so
  // the production image ships without node_modules. `public` and
  // `.next/static` are not included automatically — the Dockerfile copies
  // them in.
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Login and money-mutation pages must never render inside a frame.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
