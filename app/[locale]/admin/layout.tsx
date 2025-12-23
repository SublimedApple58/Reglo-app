import { APP_NAME } from '@/lib/constants';
import Image from 'next/image';
import Link from 'next/link';
import Menu from '@/components/shared/header/menu';
import MainNav from './main-nav';
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
