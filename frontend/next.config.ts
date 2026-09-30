import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source (zod schemas + types used by the API too).
  transpilePackages: ["@scheduler/shared"],
};

export default nextConfig;
