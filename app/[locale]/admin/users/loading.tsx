import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading per la sezione Utenti: replica la struttura reale
 * (header, toolbar, righe lista) con skeleton shimmer, così la navigazione
 * non mostra mai una pagina bianca.
 */

const ROW_WIDTHS = [
  { name: 'w-[55%]', email: 'w-[68%]' },
  { name: 'w-[42%]', email: 'w-[74%]' },
  { name: 'w-[60%]', email: 'w-[58%]' },
  { name: 'w-[48%]', email: 'w-[70%]' },
  { name: 'w-[52%]', email: 'w-[62%]' },
  { name: 'w-[38%]', email: 'w-[72%]' },
  { name: 'w-[58%]', email: 'w-[64%]' },
  { name: 'w-[45%]', email: 'w-[66%]' },
];

export default function AdminUsersLoading() {
  return (
    <div className='w-full'>
      <div className='mx-auto max-w-7xl space-y-5'>
        <PageHeader
          title='Utenti'
          subtitle={<Skeleton className='h-[13px] w-72 max-w-full rounded-md' />}
        />

        {/* Toolbar: paginazione a sinistra, filtri/azioni/search a destra */}
        <div className='flex min-h-[42px] flex-nowrap items-center gap-2.5'>
          <div className='flex shrink-0 items-center gap-2'>
            <Skeleton className='size-4 rounded-md' />
            <Skeleton className='h-[13px] w-12 rounded-md' />
            <Skeleton className='size-4 rounded-md' />
          </div>
          <div className='flex-1' />
          <Skeleton className='h-[34px] w-[70px] rounded-lg' />
          <Skeleton className='h-9 w-9 rounded-lg' />
          <Skeleton className='h-9 w-9 rounded-lg' />
          <Skeleton className='h-9 w-9 rounded-lg' />
        </div>

        {/* Righe lista */}
        <div className='border-t border-[#f0f0f0]'>
          {ROW_WIDTHS.map((row, i) => (
            <div
              key={i}
              className='grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_150px_100px_100px] items-center gap-3 border-b border-[#f0f0f0] py-3.5 max-lg:grid-cols-[minmax(0,1.5fr)_110px_100px]'
            >
              <div className='flex min-w-0 items-center gap-3'>
                <Skeleton className='h-9 w-9 shrink-0 rounded-full' />
                <div className='min-w-0 flex-1 space-y-1.5'>
                  <Skeleton className={`h-3.5 max-w-[190px] rounded-md ${row.name}`} />
                  <Skeleton className={`h-3 max-w-[230px] rounded-md lg:hidden ${row.email}`} />
                </div>
              </div>
              <div className='pr-3 max-lg:hidden'>
                <Skeleton className={`h-3.5 max-w-[250px] rounded-md ${row.email}`} />
              </div>
              <div className='flex items-center'>
                <Skeleton className='h-[24px] w-[78px] rounded-[20px]' />
              </div>
              <div className='flex items-center'>
                <Skeleton className='h-[24px] w-[62px] rounded-[20px]' />
              </div>
              <div className='flex justify-end'>
                <Skeleton className='h-[33px] w-[84px] rounded-[8px]' />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
