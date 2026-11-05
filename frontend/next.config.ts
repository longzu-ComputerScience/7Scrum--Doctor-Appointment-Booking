import type { NextConfig } from "next";

// Frontend-only Vercel deployments proxy /api/* to the Render FastAPI origin.
// A local fallback is retained for development and CI builds.
const configuredBackendURL = process.env.BACKEND_URL?.trim();
if (process.env.VERCEL_ENV === "production" && !configuredBackendURL) {
  throw new Error("BACKEND_URL is required for Vercel Production (Render FastAPI origin).");
}
const backendURL = (configuredBackendURL || "http://127.0.0.1:8000").replace(/\/+$/, "");
if (!/^https?:\/\/[^/?#]+$/.test(backendURL)) {
  throw new Error("BACKEND_URL must be an HTTP(S) origin without a path or /api suffix.");
}
if (process.env.VERCEL_ENV === "production" && !backendURL.startsWith("https://")) {
  throw new Error("BACKEND_URL must use HTTPS on Vercel Production.");
}

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendURL}/api/:path*` }];
  },
};

export default nextConfig;
