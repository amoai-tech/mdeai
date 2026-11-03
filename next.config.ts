import type { NextConfig } from "next";
import { remoteImageRules } from "./src/lib/images/remote-image-hosts";

// The allowed remote image hosts live in src/lib/images/remote-image-hosts so that components
// rendering a database-supplied URL check the same list this config declares. NEXT_PUBLIC_* is
// inlined at build time, so the Supabase host follows whichever project the build targets.
// Without it, every next/image pointing at Supabase Storage throws "hostname is not configured"
// and the page fails to render — restaurant photos are stored exactly there.

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Reduce peak Webpack compilation memory in dev and build; may slightly increase compile time.
    webpackMemoryOptimizations: true,
  },
  turbopack: {
    root: __dirname,
  },
  // Google Places uses protobufjs dynamic requires; keep its Node runtime native
  // instead of asking Webpack to statically resolve that optional import.
  serverExternalPackages: ["@copilotkit/runtime", "@googlemaps/places"],
  webpack: (config, { dev }) => {
    // Production builds must not reuse webpack's persistent cache. With it, Tailwind v4's CSS came
    // back stale: a utility class added to a file the previous build had already compiled never
    // reached the stylesheet (reproduced: a clean build has the rule, the cached rebuild does not),
    // so the Rentals map column stopped sticking in production. The cache saves ~14s of a ~35s compile.
    if (!dev) config.cache = false;
    return config;
  },
  images: {
    remotePatterns: remoteImageRules().map((rule) =>
      rule.pathPrefix
        ? { protocol: rule.protocol, hostname: rule.hostname, pathname: rule.pathPrefix + "**" }
        : { protocol: rule.protocol, hostname: rule.hostname },
    ),
  },
};

export default nextConfig;
