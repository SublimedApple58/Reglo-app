import ClientPageWrapper from '@/components/Layout/ClientPageWrapper';
import Pagination from '@/components/shared/pagination';
import { getCompanyUsers } from '@/lib/actions/user.actions';
import { PAGE_SIZE } from '@/lib/constants';
import { Metadata } from 'next';
import { AdminUsersToolbar } from '@/components/pages/AdminUsers/AdminUsersToolbar';
import { AdminUsersTable } from '@/components/pages/AdminUsers/AdminUsersTable';

export const metadata: Metadata = {
  title: 'Admin Users',
};

type AdminUsersSearchParams = {
  page?: string | string[];
  query?: string | string[];
};

const AdminUserPage = async ({
  searchParams,
  params: _params,
}: {
  searchParams?: Promise<AdminUsersSearchParams>;
  params: Promise<{ locale: string }>;
}) => {
  await _params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const pageParam = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page;
  const queryParam = Array.isArray(resolvedSearchParams.query)
    ? resolvedSearchParams.query[0]
    : resolvedSearchParams.query;

  const currentPage = Number(pageParam) || 1;
  const searchText = queryParam?.trim();

  const users = await getCompanyUsers({
    page: currentPage,
    query: searchText ?? '',
  });
  const totalRows = users.totalPages * PAGE_SIZE;
  const tableUsers = users.data.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    autoscuolaRole: user.autoscuolaRole,
    status: user.status,
  }));

  return (
    <ClientPageWrapper
      title='Users'
      subTitle='Qui puoi vedere la tua directory completa di utenti'
    >
      <AdminUsersToolbar totalRows={totalRows} initialQuery={searchText ?? ''} />
      <AdminUsersTable users={tableUsers} />
      {users.totalPages > 1 && (
        <Pagination page={currentPage} totalPages={users?.totalPages} />
      )}
    </ClientPageWrapper>
  );
};

export default AdminUserPage;
