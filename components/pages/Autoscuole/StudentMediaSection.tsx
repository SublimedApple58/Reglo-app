'use client';

import * as React from 'react';
import { Download } from 'lucide-react';

import { getStudentMediaOverview } from '@/lib/actions/student-media.actions';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DetailRow, DetailRows, DetailSection } from './student-detail-sheet';

export type StudentMediaOverview = {
  photoUrl: string | null;
  signatureUrl: string | null;
};

type MediaState = { loading: boolean } & StudentMediaOverview;

/** «Scarica ▾» con le due versioni: originale e formato Portale dell'automobilista. */
function DownloadMenu({ base, label }: { base: string; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label={label}>
          <Download strokeWidth={1.8} />
          Scarica
        </Button>
      </DropdownMenuTrigger>
      {/* Il DetailPanel è z-[200]: il default z-50 del menu finirebbe dietro */}
      <DropdownMenuContent align="end" className="z-[300] min-w-[210px]">
        <DropdownMenuItem asChild>
          <a href={`${base}?variant=original`} download>
            Originale
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`${base}?variant=portale`} download>
            Portale dell&apos;automobilista
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Sezione «Documenti» del dettaglio allievo (REG-775): firma e foto profilo,
 * da scaricare in originale o nel formato del Portale dell'automobilista.
 * La foto si CAMBIA dall'avatar in testa al drawer, che riceve l'URL via
 * onLoaded; `photoUrl` è quello che il drawer tiene aggiornato dopo un upload.
 */
export function StudentMediaSection({
  studentUserId,
  refreshKey = 0,
  onLoaded,
  photoUrl,
}: {
  studentUserId: string;
  /** Bump per rifetchare (es. dopo upload foto dallo staff) */
  refreshKey?: number;
  onLoaded?: (media: StudentMediaOverview) => void;
  /** Foto attuale secondo il drawer (dopo un caricamento è già quella nuova). */
  photoUrl?: string | null;
}) {
  const [state, setState] = React.useState<MediaState>({
    loading: true,
    photoUrl: null,
    signatureUrl: null,
  });
  const onLoadedRef = React.useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  React.useEffect(() => {
    let cancelled = false;
    setState({ loading: true, photoUrl: null, signatureUrl: null });
    void getStudentMediaOverview(studentUserId).then((res) => {
      if (cancelled) return;
      const media = {
        photoUrl: res.success ? res.data.photoUrl : null,
        signatureUrl: res.success ? res.data.signatureUrl : null,
      };
      setState({ loading: false, ...media });
      onLoadedRef.current?.(media);
    });
    return () => {
      cancelled = true;
    };
  }, [studentUserId, refreshKey]);

  const hasPhoto = Boolean(photoUrl ?? state.photoUrl);
  const loadingValue = <Skeleton className="h-4 w-24" />;

  return (
    <DetailSection title="Documenti" testId="student-documents">
      <DetailRows>
        <DetailRow
          label="Firma"
          value={state.loading ? loadingValue : state.signatureUrl ? undefined : 'In attesa dell’allievo'}
          right={
            state.signatureUrl ? (
              <>
                <span className="flex h-9 w-[120px] shrink-0 items-center justify-end">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={state.signatureUrl}
                    alt="Firma allievo"
                    className="max-h-full max-w-full object-contain"
                  />
                </span>
                <DownloadMenu base={`/api/students/${studentUserId}/media/signature`} label="Scarica la firma" />
              </>
            ) : null
          }
        />
        <DetailRow
          label="Foto profilo"
          description={hasPhoto ? 'Originale o formato Portale dell’automobilista' : undefined}
          value={state.loading && !hasPhoto ? loadingValue : hasPhoto ? undefined : 'Nessuna foto'}
          right={
            hasPhoto ? (
              <DownloadMenu base={`/api/students/${studentUserId}/media/photo`} label="Scarica la foto profilo" />
            ) : null
          }
        />
      </DetailRows>
    </DetailSection>
  );
}
