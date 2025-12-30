import ClientPageWrapper from '@/components/Layout/ClientPageWrapper';
import DeleteDialog from '@/components/shared/delete-dialog';
import Pagination from '@/components/shared/pagination';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/card';
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
    <ClientPageWrapper
      title='Users'
      subTitle='Qui puoi vedere la tua directory completa di utenti'
    >
      <div className='space-y-4'>
        <Card>
          {/* <CardHeader className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            {searchText && (
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <span>
                  Filtrato per <i>&quot;{searchText}&quot;</i>
                </span>
                <Link href='/admin/users'>
                  <Button variant='outline' size='sm'>
                    Rimuovi filtro
                  </Button>
                </Link>
              </div>
            )}
          </CardHeader> */}
          <CardContent className='space-y-4'>
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow className='bg-muted/30'>
                    <TableHead className='w-[120px] text-xs uppercase tracking-[0.18em]'>
                      ID
                    </TableHead>
                    <TableHead className='text-xs uppercase tracking-[0.18em]'>
                      Nome
                    </TableHead>
                    <TableHead className='text-xs uppercase tracking-[0.18em]'>
                      Email
                    </TableHead>
                    <TableHead className='text-xs uppercase tracking-[0.18em]'>
                      Ruolo
                    </TableHead>
                    <TableHead className='text-right text-xs uppercase tracking-[0.18em]'>
                      Azioni
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.data.map((user) => {
                    const initials = user.name
                      ? user.name
                          .split(' ')
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')
                          .toUpperCase()
                      : 'U';
                    return (
                      <TableRow key={user.id} className='hover:bg-muted/40'>
                        <TableCell className='font-mono text-xs text-muted-foreground'>
                          {formatId(user.id)}
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center gap-3'>
                            <Avatar className='h-8 w-8'>
                              <AvatarFallback className='text-xs font-semibold'>
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div className='flex flex-col'>
                              <span className='font-medium text-foreground'>
                                {user.name}
                              </span>
                              <span className='text-xs text-muted-foreground'>
                                {user.role === 'user' ? 'Member' : 'Admin'}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className='text-muted-foreground'>
                          {user.email}
                        </TableCell>
                        <TableCell>
                          {user.role === 'user' ? (
                            <Badge variant='secondary'>User</Badge>
                          ) : (
                            <Badge variant='default'>Admin</Badge>
                          )}
                        </TableCell>
                        <TableCell className='text-right'>
                          <div className='inline-flex items-center gap-2'>
                            <Button asChild variant='outline' size='sm'>
                              <Link href={`/admin/users/${user.id}`}>Edit</Link>
                            </Button>
                            <DeleteDialog id={user.id} action={deleteUser} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {users.totalPages > 1 && (
              <Pagination page={currentPage} totalPages={users?.totalPages} />
            )}
          </CardContent>
        </Card>
      </div>
    </ClientPageWrapper>
  );
};

export default AdminUserPage;
