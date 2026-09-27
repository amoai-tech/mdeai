import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["@copilotkit/runtime"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Apartment seed images (SAN-718 live data)
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
};

export default nextConfig;
