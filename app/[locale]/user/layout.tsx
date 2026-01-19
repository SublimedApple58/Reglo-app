import SideBarWrapper from '@/components/Layout/SideBarWrapper';
import { requireUserAndCompany } from '@/lib/auth-guard';

export default async function UserLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  await requireUserAndCompany(locale);

  return (
    <>
      {/* <div className='flex flex-col'>
        <div className='border-b container mx-auto'>
          <div className='flex items-center h-16 px-4'>
            <Link href='/' className='w-22'>
              <Image
                src='/images/logo.svg'
                height={48}
                width={48}
                alt={APP_NAME}
              />
            </Link>
            <MainNav className='mx-6' />
            <div className='ml-auto items-center flex space-x-4'>
              <Menu />
            </div>
          </div>
        </div>

        <div className='flex-1 space-y-4 p-8 pt-6 container mx-auto'>
          {children}
        </div>
      </div> */}
      <SideBarWrapper>{children}</SideBarWrapper>
    </>
  );
}
