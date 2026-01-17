# Analytics Setup Guide

## Option 1: Vercel Analytics (Recommended if deployed on Vercel)

### Installation
```bash
npm install @vercel/analytics
```

### Setup
1. Add to `app/layout.tsx`:
```tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

2. Enable in Vercel Dashboard:
   - Go to your project settings
   - Enable "Web Analytics"
   - No code changes needed if you add the component above

**Pros:** Free, privacy-friendly, automatic, no configuration needed
**Cons:** Only works if deployed on Vercel

---

## Option 2: Google Analytics 4

### Installation
```bash
npm install @next/third-parties
```

### Setup
1. Get your GA4 Measurement ID (format: `G-XXXXXXXXXX`) from [Google Analytics](https://analytics.google.com/)

2. Add to `next.config.js`:
```js
const nextConfig = {
  experimental: {
    optimizePackageImports: ['@next/third-parties'],
  },
}

module.exports = nextConfig
```

3. Add to `app/layout.tsx`:
```tsx
import { GoogleAnalytics } from '@next/third-parties/google'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <GoogleAnalytics gaId="G-XXXXXXXXXX" />
      </body>
    </html>
  )
}
```

4. Add to `.env.local`:
```
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

**Pros:** Most comprehensive, free, industry standard
**Cons:** Requires Google account, privacy concerns for some users

---

## Option 3: Plausible Analytics (Privacy-Focused)

### Installation
```bash
npm install plausible-tracker
```

### Setup
1. Sign up at [plausible.io](https://plausible.io) and get your domain

2. Add to `app/layout.tsx`:
```tsx
import PlausibleProvider from 'next-plausible'

export default function RootLayout({ children }) {
  return (
    <PlausibleProvider domain="yourdomain.com">
      <html>
        <body>{children}</body>
      </html>
    </PlausibleProvider>
  )
}
```

**Pros:** Privacy-focused, GDPR compliant, lightweight
**Cons:** Paid service (though very affordable)

---

## Option 4: Simple Custom Tracking

Create a simple API endpoint to track page views:

1. Create `app/api/analytics/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const data = await request.json()
  
  // Log to console, database, or external service
  console.log('Page view:', {
    path: data.path,
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get('user-agent'),
  })
  
  // Optional: Save to database or send to external service
  
  return NextResponse.json({ success: true })
}
```

2. Add tracking component `components/Analytics.tsx`:
```tsx
'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function Analytics() {
  const pathname = usePathname()

  useEffect(() => {
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {}) // Silently fail
  }, [pathname])

  return null
}
```

3. Add to `app/layout.tsx`:
```tsx
import { Analytics } from '@/components/Analytics'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

**Pros:** Full control, no external dependencies
**Cons:** Need to build dashboard yourself, store data somewhere

---

## Recommendation

- **If on Vercel:** Use Vercel Analytics (easiest, free)
- **If need detailed insights:** Use Google Analytics 4
- **If privacy-focused:** Use Plausible Analytics
- **If want full control:** Use custom tracking
