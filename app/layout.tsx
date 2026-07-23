import type { Metadata, Viewport } from 'next'
import { Marcellus, Hanken_Grotesk } from 'next/font/google'
import './globals.css'

const marcellus = Marcellus({ subsets: ['latin'], weight: '400', variable: '--font-marcellus', display: 'swap' })
const hanken = Hanken_Grotesk({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700', '800', '900'], variable: '--font-hanken', display: 'swap' })

export const metadata: Metadata = {
  title: 'WOS 3.0 — Wallest',
  description: 'Wallest Operating System',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#F2ECE0',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${marcellus.variable} ${hanken.variable}`}>
      <body>
        {children}
        {/* Fix PWA Mac: detecta build nuevo y recarga — cubre bfcache + session restore de Chrome */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var CURRENT = '${process.env.NEXT_PUBLIC_BUILD_TIME}';
            function check() {
              fetch('/api/ping', { cache: 'no-store' })
                .then(function(r) { return r.json(); })
                .then(function(d) {
                  var stored = localStorage.getItem('_wos_build');
                  if (stored && stored !== d.build) {
                    localStorage.setItem('_wos_build', d.build);
                    window.location.reload(true);
                  } else {
                    localStorage.setItem('_wos_build', d.build);
                  }
                }).catch(function(){});
            }
            check();
            window.addEventListener('pageshow', function(e) {
              if (e.persisted) { window.location.reload(true); } else { check(); }
            });
          })();
        `}} />
      </body>
    </html>
  )
}
