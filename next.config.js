/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ["graph.instagram.com", "scontent.cdninstagram.com"],
  },
}
module.exports = nextConfig
