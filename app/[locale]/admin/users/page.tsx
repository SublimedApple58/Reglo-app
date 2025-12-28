import ClientPageWrapper from '@/components/Layout/ClientPageWrapper';
import DeleteDialog from '@/components/shared/delete-dialog';
import Pagination from '@/components/shared/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { deleteUser, getAllUsers } from '@/lib/actions/user.actions';
import { requireRole } from '@/lib/auth-guard';
import { UserRole } from '@/lib/constants';
import { formatId } from '@/lib/utils';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Admin Users',
};

type AdminUsersSearchParams = {
  page?: string | string[];
  query?: string | string[];
};

const AdminUserPage = async ({
  searchParams,
}: {
  searchParams?: Promise<AdminUsersSearchParams>;
}) => {
  await requireRole(UserRole.ADMIN);

  const resolvedSearchParams = searchParams ? await searchParams : {};

  const pageParam = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page;
  const queryParam = Array.isArray(resolvedSearchParams.query)
    ? resolvedSearchParams.query[0]
    : resolvedSearchParams.query;

  const currentPage = Number(pageParam) || 1;
  const searchText = queryParam?.trim();

  const users = await getAllUsers({
    page: currentPage,
    query: searchText ?? '',
  });

  return (
    <ClientPageWrapper title='Users' subTitle='Qui puoi vedere la tua directory completa di utenti'>
      <div className='space-y-2'>
        <div className='flex items-center gap-3'>
          {searchText && (
            <div>
              Filtered by <i>&quot;{searchText}&quot;</i>{' '}
              <Link href='/admin/users'>
                <Button variant='outline' size='sm'>
                  Remove Filter
                </Button>
              </Link>
            </div>
          )}
        </div>
        <div className='overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>NAME</TableHead>
                <TableHead>EMAIL</TableHead>
                <TableHead>ROLE</TableHead>
                <TableHead>ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{formatId(user.id)}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {user.role === 'user' ? (
                      <Badge variant='secondary'>User</Badge>
                    ) : (
                      <Badge variant='default'>Admin</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant='outline' size='sm'>
                      <Link href={`/admin/users/${user.id}`}>Edit</Link>
                    </Button>
                    <DeleteDialog id={user.id} action={deleteUser} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users.totalPages > 1 && (
            <Pagination
              page={currentPage}
              totalPages={users?.totalPages}
            />
          )}
        </div>
      </div>
    </ClientPageWrapper>
  );
};

export default AdminUserPage;
