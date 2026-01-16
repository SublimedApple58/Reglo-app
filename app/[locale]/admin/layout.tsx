import SideBarWrapper from '@/components/Layout/SideBarWrapper';

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <SideBarWrapper>{children}</SideBarWrapper>
    </>
  );
}
