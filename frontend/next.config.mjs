import withPWA from '@ducanh2912/next-pwa'

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8001'
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiBase}/api/v1/:path*`,
      },
      // 后端静态资源（TTS 合成音频 / 歌曲封面等）：前端用相对路径访问，需代理到后端
      {
        source: '/static/:path*',
        destination: `${apiBase}/static/:path*`,
      },
    ]
  },
}

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})(nextConfig)
