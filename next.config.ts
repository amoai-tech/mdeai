import type { NextConfig } from "next";

// The Supabase project host that serves restaurant and listing photos. NEXT_PUBLIC_* is
// inlined at build time, so this follows whichever project the build targets. Without it,
// every next/image pointing at Supabase Storage throws "hostname is not configured" and the
// page fails to render — restaurant photos are stored exactly there.
const supabaseStorageHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : undefined;
  } catch {
    return undefined;
  }
})();

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
      // Supabase Storage (restaurant and listing photos).
      ...(supabaseStorageHost
        ? [{ protocol: "https" as const, hostname: supabaseStorageHost, pathname: "/storage/v1/object/public/**" }]
        : []),
    ],
  },
};

export default nextConfig;
