import type { Metadata } from 'next';
import { Lato } from 'next/font/google';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './globals.css';

const lato = Lato({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: { default: 'BookLeaf Author Support', template: '%s · BookLeaf Author Support' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans', lato.variable)}>
      <body>{children}</body>
    </html>
  );
}
