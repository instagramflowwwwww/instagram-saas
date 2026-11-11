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
  // instaflowapp.com.br e www.instaflowapp.com.br respondiam os dois direto,
  // sem redirecionar um pro outro — isso fazia o cookie de sessão (preso no
  // host onde o login foi feito) parecer "perdido" quando a pessoa entrava
  // pelo outro host depois. Com esse redirect só existe um host de verdade.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.instaflowapp.com.br" }],
        destination: "https://instaflowapp.com.br/:path*",
        permanent: true,
      },
    ]
  },
}
module.exports = nextConfig
