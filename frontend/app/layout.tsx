import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'P Trade',
  description: 'PTS trading workflow frontend',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
