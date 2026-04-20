/** @type {import('next').NextConfig} */
const nextConfig = {
  // Evita que o firebase-admin seja bundled no lado client
  serverExternalPackages: ['firebase-admin'],
}

export default nextConfig
