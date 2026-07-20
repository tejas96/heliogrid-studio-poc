import type { Metadata } from 'next';
// Single stylesheet entry. It pulls in the legacy Solar Studio CSS as a named
// cascade layer so Tailwind utilities can win — see the comment in index.css.
import '@/design/index.css';

export const metadata: Metadata = {
  title: 'Solar App',
  description: 'Solar design and proposal platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
