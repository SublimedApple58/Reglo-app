import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ClientPageWrapper from '@/components/Layout/ClientPageWrapper';
import { getUserById } from '@/lib/actions/user.actions';
import UpdateUserForm from './update-user-form';
import { requireRole } from '@/lib/auth-guard';
import { UserRole } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Update User',
};

const AdminUserUpdatePage = async (props: {
  params: Promise<{
    id: string;
    locale?: string;
  }>;
}) => {
  await requireRole(UserRole.ADMIN);

  const { id, locale } = await props.params;
  const backHref = locale ? `/${locale}/admin/users` : "/admin/users";

  const user = await getUserById(id);

  if (!user) notFound();

  return (
    <ClientPageWrapper
      title="Update user"
      parentTitle="Users"
      enableBackNavigation
      backHref={backHref}
    >
      <div className='max-w-lg space-y-6'>
        <UpdateUserForm user={user} />
      </div>
    </ClientPageWrapper>
  );
};

export default AdminUserUpdatePage;
