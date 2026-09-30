import type { NextConfig } from "next";

/**
 * Optional single-origin mode for local HTTPS tunnels (Slack OAuth needs an HTTPS redirect URL).
 * When API_PROXY_TARGET is set, the browser talks only to this server and these paths are
 * forwarded to the API, so the session cookie is valid on the tunnel's hostname too.
 * Leave it unset for normal development and for Docker (Caddy does this there).
 */
const API_PROXY_TARGET = process.env.API_PROXY_TARGET;
/** Tunnel hostname (no scheme), so the dev server accepts requests that arrive through it. */
const DEV_TUNNEL_HOST = process.env.DEV_TUNNEL_HOST;
const PROXIED_PATHS = ["/api", "/auth", "/admin", "/health"];

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source (zod schemas + types used by the API too).
  transpilePackages: ["@scheduler/shared"],
  // Standalone output produces a self-contained server bundle for Docker.
  output: "standalone",
  allowedDevOrigins: DEV_TUNNEL_HOST ? [DEV_TUNNEL_HOST] : [],
  async rewrites() {
    if (!API_PROXY_TARGET) return [];
    return PROXIED_PATHS.map((path) => ({
      source: `${path}/:rest*`,
      destination: `${API_PROXY_TARGET}${path}/:rest*`,
    }));
  },
};

export default nextConfig;
