/** @type {import('next').NextConfig} */
const BUILD_TIME = Date.now().toString()

const nextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
  },
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        // Fuerza revalidación del HTML en cada apertura (fix PWA caché en Mac)
        source: '/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
    ]
  },
};

export default nextConfig;
