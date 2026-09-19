import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["@copilotkit/runtime"],
  // SAN-1330 — type errors must fail the production build, not ship past it.
  //
  // This used to be `ignoreBuildErrors: true` with the note "@mastra/memory beta
  // packages have unstable types that break strict checking". That is no longer
  // true: with the flag removed the production build runs "Running TypeScript …
  // Finished TypeScript in 9.5s" and exits 0. Vercel only ran `npm run build`, so
  // the flag meant a type regression could reach production while Floor (which
  // runs `typecheck` separately) stayed green.
  typescript: {
    ignoreBuildErrors: false,
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
