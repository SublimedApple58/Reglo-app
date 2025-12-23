import Header from '@/components/shared/header';
import Footer from '@/components/footer';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
