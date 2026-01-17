import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ExplainItBack',
  description: 'Transform your project description into clear technical explanations, resume bullets, and interview pitches',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  )
}
