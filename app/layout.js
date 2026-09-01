import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'

export const metadata = {
  title: 'رحّال — نظام محاسبة مكاتب السفريات',
  description: 'Rahaal Travel Office ERP & Multi-Currency Accounting',
}

// Next.js 15 — viewport must be its own export (was inside metadata → console warning)
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      {/* suppressHydrationWarning (attribute-level, this element only): browser extensions
          (translators, password managers, the Rahaal parser extension, etc.) inject
          attributes into <body> BEFORE React hydrates, producing the noisy
          "server rendered HTML didn't match" console warning. App content is unaffected. */}
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
        <Toaster position="top-center" richColors closeButton dir="rtl" />
      </body>
    </html>
  )
}
