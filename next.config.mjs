/** @type {import('next').NextConfig} */
const nextConfig = {
  // Evita que o firebase-admin seja bundled no lado client
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin', '@google-cloud/firestore', '@opentelemetry/api'],
  },
}

export default nextConfig
