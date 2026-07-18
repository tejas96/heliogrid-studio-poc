import StudioClientLayout from './StudioClientLayout';

export const dynamic = 'force-dynamic';

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StudioClientLayout>{children}</StudioClientLayout>;
}
