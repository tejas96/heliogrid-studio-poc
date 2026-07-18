import type { Metadata } from 'next';
import '@/features/solar-studio/theme.css';

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
