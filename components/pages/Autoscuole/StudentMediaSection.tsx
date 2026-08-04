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
 * Sezione "Foto e firma" del dettaglio allievo, in stile Anagrafica:
 * niente box fantasma — la foto vive nell'avatar in testa al drawer
 * (via onLoaded), qui restano stato + download Originale / Portale.
 */
export function StudentMediaSection({
  studentUserId,
  onLoaded,
}: {
  studentUserId: string;
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
  }, [studentUserId]);

  const downloadBase = `/api/students/${studentUserId}/media`;

  const downloads = (kind: 'photo' | 'signature') => (
    <div className="flex items-center gap-2.5">
      <a className={linkClass} href={`${downloadBase}/${kind}?variant=original`} download>
        Originale
      </a>
      <span className="text-[11px] text-[#dddddd]">·</span>
      <a className={linkClass} href={`${downloadBase}/${kind}?variant=portale`} download>
        Portale automobilista
      </a>
    </div>
  );

  const emptyValue = (
    <p className="text-sm font-medium text-[#c1c1c1]">
      {state.loading ? 'Caricamento…' : 'In attesa dell’allievo'}
    </p>
  );

  return (
    <section className="border-b border-[#f2f2f2] py-7">
      <p className="mb-4 text-[12px] font-semibold text-[#929292]">Foto e firma</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
        <div>
          <p className="mb-0.5 text-[12px] font-medium text-[#929292]">Foto profilo</p>
          {state.photoUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.photoUrl}
                alt="Foto profilo allievo"
                className="size-9 shrink-0 rounded-full border border-[#f2f2f2] object-cover"
              />
              {downloads('photo')}
            </div>
          ) : (
            emptyValue
          )}
        </div>
        <div>
          <p className="mb-0.5 text-[12px] font-medium text-[#929292]">Firma</p>
          {state.signatureUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.signatureUrl}
                alt="Firma allievo"
                className="h-9 max-w-[110px] shrink-0 object-contain"
              />
              {downloads('signature')}
            </div>
          ) : (
            emptyValue
          )}
        </div>
      </div>
    </section>
  );
}
