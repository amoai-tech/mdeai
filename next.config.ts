import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["@copilotkit/runtime"],
  webpack: (config, { dev }) => {
    // Production builds must not reuse webpack's persistent cache. With it, Tailwind v4's CSS came
    // back stale: a utility class added to a file the previous build had already compiled never
    // reached the stylesheet (reproduced: a clean build has the rule, the cached rebuild does not),
    // so the Rentals map column stopped sticking in production. The cache saves ~14s of a ~35s compile.
    if (!dev) config.cache = false;
    return config;
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Apartment seed images (SAN-718 live data)
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
};

export default nextConfig;
