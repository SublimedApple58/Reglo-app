import { PageWrapper } from '@/components/Layout/PageWrapper';
import { getCompanyUsers } from '@/lib/actions/user.actions';
import { Metadata } from 'next';
import { AdminUsersPage } from '@/components/pages/AdminUsers/AdminUsersPage';

export const metadata: Metadata = {
  title: 'Utenti',
};

type AdminUsersSearchParams = {
  page?: string | string[];
  query?: string | string[];
  role?: string | string[];
};

const AUTOSCUOLA_ROLE_VALUES = [
  'OWNER',
  'INSTRUCTOR_OWNER',
  'INSTRUCTOR',
  'STUDENT',
] as const;
type AutoscuolaRole = (typeof AUTOSCUOLA_ROLE_VALUES)[number];

const AdminUserPage = async ({
  searchParams,
  params: _params,
}: {
  searchParams?: Promise<AdminUsersSearchParams>;
  params: Promise<{ locale: string }>;
}) => {
  await _params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const single = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] : value;

  const currentPage = Number(single(resolvedSearchParams.page)) || 1;
  const searchText = single(resolvedSearchParams.query)?.trim();
  const roleParam = single(resolvedSearchParams.role);
  const roleFilter = AUTOSCUOLA_ROLE_VALUES.includes(roleParam as AutoscuolaRole)
    ? (roleParam as AutoscuolaRole)
    : null;

  const users = await getCompanyUsers({
    page: currentPage,
    query: searchText ?? '',
    role: roleFilter ?? undefined,
  });

  const rows = users.data.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    autoscuolaRole: user.autoscuolaRole ?? undefined,
    status: user.status,
  }));

  return (
    <PageWrapper title='Utenti' hideHero>
      <AdminUsersPage
        users={rows}
        page={currentPage}
        totalPages={users.totalPages}
        total={users.total ?? rows.length}
        initialQuery={searchText ?? ''}
        roleFilter={roleFilter}
      />
    </PageWrapper>
  );
};

export default AdminUserPage;
