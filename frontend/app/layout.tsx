import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WORKSIGNAL',
  description:
    'AI-powered multi-agent job search platform for early-career Singaporeans',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
