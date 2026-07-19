import './globals.css';
import type { Metadata } from 'next';
import { Sarabun, Noto_Serif_Thai, IBM_Plex_Mono } from 'next/font/google';
import { MapPin } from 'lucide-react';

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '700', '800'],
  variable: '--font-sarabun',
});

const notoSerifThai = Noto_Serif_Thai({
  subsets: ['thai', 'latin'],
  weight: ['500', '600'],
  variable: '--font-serif',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'GPO Xchange Portal',
  description: 'ระบบรับคืนและแลกเปลี่ยนสินค้าองค์การเภสัชกรรม',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="th"
      className={`${sarabun.variable} ${notoSerifThai.variable} ${ibmPlexMono.variable}`}
    >
      <body className="font-sans antialiased text-gray-900 bg-slate-50">

        {/* ── Sticky Glass Header ── */}
        <header className="fixed top-0 left-0 w-full bg-white/90 backdrop-blur-lg z-50">
          <div className="max-w-[1200px] mx-auto h-[56px] px-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center bg-gradient-to-br from-teal-800 to-teal-600 text-white font-black text-xs w-9 h-9 rounded-xl shadow-md shadow-teal-900/20 ring-1 ring-white/40">
                GPO
              </span>
              <span className="text-teal-950 font-black text-[13px] sm:text-sm">
                องค์การเภสัชกรรม
              </span>
            </div>

            <span className="flex items-center gap-1.5 text-teal-700 font-bold text-[13px] sm:text-sm whitespace-nowrap">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" strokeWidth={2.5} />
              สาขาภาคใต้
            </span>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-teal-200 to-transparent" />
        </header>

        <main className="pt-[56px] min-h-screen">{children}</main>

      </body>
    </html>
  );
}