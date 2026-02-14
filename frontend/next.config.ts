import type { NextConfig } from "next";

const backendBase = process.env.BACKEND ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.BACKEND ?? process.env.NEXT_PUBLIC_API_URL,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
