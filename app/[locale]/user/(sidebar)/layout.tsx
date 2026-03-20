import SideBarWrapper from '@/components/Layout/SideBarWrapper';

export default function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SideBarWrapper>{children}</SideBarWrapper>;
}
