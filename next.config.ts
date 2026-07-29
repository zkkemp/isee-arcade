import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/play/platformer2',
        destination: '/play/platformer',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
