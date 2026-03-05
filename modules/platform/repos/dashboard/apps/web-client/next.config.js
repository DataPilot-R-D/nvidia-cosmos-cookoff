/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@workspace/shared-types'],
  experimental: {
    // Enable Server Actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Keep native sqlite driver out of server bundling.
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  // WebSocket connections use direct URL from NEXT_PUBLIC_WS_URL
  // No rewrite needed - client connects directly via Socket.IO
}

module.exports = nextConfig
