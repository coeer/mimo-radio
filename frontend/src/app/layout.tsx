import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, JetBrains_Mono, VT323 } from 'next/font/google'
import './globals.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

const vt323 = VT323({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-pixel-loaded',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'MiMo - AI 电台',
  description: 'MiMo 为你打造的个性化 AI 电台',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MiMo',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${vt323.variable}`}>
      <head>
        <meta name="theme-color" content="#06060a" id="theme-color-meta" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('mimo-theme');var c=t==='light'?'#f5f3ef':'#06060a';document.getElementById('theme-color-meta').setAttribute('content',c);document.documentElement.setAttribute('data-theme',t||'dark')}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased min-h-screen">
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  )
}
