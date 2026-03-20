import { Metadata } from 'next';
import { getMyOrders } from '@/lib/actions/order.actions';
import { formatCurrency, formatDateTime, formatId } from '@/lib/utils';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Pagination from '@/components/shared/pagination';
import ClientPageWrapper from '@/components/Layout/ClientPageWrapper';

export const metadata: Metadata = {
  title: 'My Orders',
};

const OrdersPage = async (props: {
  searchParams: Promise<{ page: string }>;
}) => {
  const { page } = await props.searchParams;

  const orders = await getMyOrders({
    page: Number(page) || 1,
  });

  return (
    <ClientPageWrapper
      title='Ordini'
      subTitle='Storico ordini e stato pagamenti/consegne.'
    >
      <div className='glass-panel glass-strong p-4'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Totale</TableHead>
              <TableHead>Pagato</TableHead>
              <TableHead>Consegnato</TableHead>
              <TableHead>Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.data.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{formatId(order.id)}</TableCell>
                <TableCell>
                  {formatDateTime(order.createdAt).dateTime}
                </TableCell>
                <TableCell>{formatCurrency(order.totalPrice)}</TableCell>
                <TableCell>
                  {order.isPaid && order.paidAt
                    ? formatDateTime(order.paidAt).dateTime
                    : 'Non pagato'}
                </TableCell>
                <TableCell>
                  {order.isDelivered && order.deliveredAt
                    ? formatDateTime(order.deliveredAt).dateTime
                    : 'Non consegnato'}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/order/${order.id}`}
                    className='text-sm font-semibold text-primary hover:underline'
                  >
                    Dettagli
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {orders.totalPages > 1 && (
        <Pagination
          page={Number(page) || 1}
          totalPages={orders?.totalPages}
        />
      )}
    </ClientPageWrapper>
  );
};

export default OrdersPage;
