import type { NextConfig } from "next";

const backendURL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendURL}/api/:path*` }];
  },
};

export default nextConfig;
