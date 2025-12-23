import { Metadata } from 'next';
import { auth } from '@/auth';
import { SessionProvider } from 'next-auth/react';
import ProfileForm from './profile-form';
import ClientPageWrapper from '@/components/Layout/ClientPageWrapper';

export const metadata: Metadata = {
  title: 'Customer Profile',
};

const Profile = async () => {
  const session = await auth();

  return (
    <ClientPageWrapper title='Profile'>
      <SessionProvider session={session}>
        <div className='max-w-md mx-auto space-y-4'>
          <ProfileForm />
        </div>
      </SessionProvider>
    </ClientPageWrapper>
  );
};

export default Profile;
