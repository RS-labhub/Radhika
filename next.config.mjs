/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {},
  images: {
    unoptimized: true,
  },
  webpack(config) {
    config.devtool = false
    return config
  },
}

export default nextConfig
