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
  experimental: {
    // playwright-core tenta puxar dependências opcionais (chromium-bidi,
    // kerberos) que não existem no projeto — sem isso o webpack falha
    // tentando empacotar o pacote inteiro em vez de só usar em runtime.
    serverComponentsExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  },
}
module.exports = nextConfig
