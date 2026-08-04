'use client';

import * as React from 'react';
import { getStudentMediaOverview } from '@/lib/actions/student-media.actions';

const linkClass =
  'cursor-pointer text-[12px] font-medium text-[#428bff] hover:underline';

export type StudentMediaOverview = {
  photoUrl: string | null;
  signatureUrl: string | null;
};

type MediaState = { loading: boolean } & StudentMediaOverview;

/**
 * Sezione "Firma" del dettaglio allievo. La FOTO non vive più qui: sta
 * nell'avatar in testa al drawer (con pill Modifica + menu download), che
 * riceve l'URL via onLoaded. Qui restano anteprima e download della firma.
 */
export function StudentMediaSection({
  studentUserId,
  refreshKey = 0,
  onLoaded,
}: {
  studentUserId: string;
  /** Bump per rifetchare (es. dopo upload foto dallo staff) */
  refreshKey?: number;
  onLoaded?: (media: StudentMediaOverview) => void;
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

  const downloadBase = `/api/students/${studentUserId}/media/signature`;

  return (
    <section className="border-b border-[#f2f2f2] py-7">
      <p className="mb-4 text-[12px] font-semibold text-[#929292]">Firma</p>
      {state.signatureUrl ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex h-10 max-w-[180px] items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.signatureUrl}
              alt="Firma allievo"
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <a className={linkClass} href={`${downloadBase}?variant=original`} download>
              Originale
            </a>
            <span className="text-[11px] text-[#dddddd]">·</span>
            <a className={linkClass} href={`${downloadBase}?variant=portale`} download>
              Portale automobilista
            </a>
          </div>
        </div>
      ) : (
        <p className="text-sm font-medium text-[#c1c1c1]">
          {state.loading ? 'Caricamento…' : 'In attesa dell’allievo'}
        </p>
      )}
    </section>
  );
}
