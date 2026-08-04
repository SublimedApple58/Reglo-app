'use client';

import * as React from 'react';
import { IconDownload } from '@tabler/icons-react';
import { getStudentMediaOverview } from '@/lib/actions/student-media.actions';

const downloadButtonClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-[#e2e2e6] bg-white px-2.5 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/40 disabled:opacity-50';

type MediaState = {
  loading: boolean;
  photoUrl: string | null;
  signatureUrl: string | null;
};

/**
 * Sezione "Foto e firma" del dettaglio allievo: anteprima di foto profilo e
 * firma caricate dall'allievo via app, con download Originale / Portale
 * dell'automobilista (variante generata al volo dal backend).
 */
export function StudentMediaSection({
  studentUserId,
}: {
  studentUserId: string;
}) {
  const [state, setState] = React.useState<MediaState>({
    loading: true,
    photoUrl: null,
    signatureUrl: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    setState({ loading: true, photoUrl: null, signatureUrl: null });
    void getStudentMediaOverview(studentUserId).then((res) => {
      if (cancelled) return;
      setState({
        loading: false,
        photoUrl: res.success ? res.data.photoUrl : null,
        signatureUrl: res.success ? res.data.signatureUrl : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [studentUserId]);

  const downloadBase = `/api/students/${studentUserId}/media`;

  const renderDownloads = (kind: 'photo' | 'signature', available: boolean) =>
    available ? (
      <div className="mt-2.5 flex flex-wrap gap-2">
        <a
          className={downloadButtonClass}
          href={`${downloadBase}/${kind}?variant=original`}
          download
        >
          <IconDownload size={14} stroke={1.8} />
          Originale
        </a>
        <a
          className={downloadButtonClass}
          href={`${downloadBase}/${kind}?variant=portale`}
          download
        >
          <IconDownload size={14} stroke={1.8} />
          Portale automobilista
        </a>
      </div>
    ) : (
      <p className="mt-2 text-[12px] font-medium text-[#c1c1c1]">
        {state.loading ? 'Caricamento…' : 'Non ancora caricata dall’allievo'}
      </p>
    );

  return (
    <section className="border-b border-[#f2f2f2] py-7">
      <p className="mb-4 text-[12px] font-semibold text-[#929292]">
        Foto e firma
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-[#929292]">
            Foto profilo
          </p>
          <div className="flex h-[96px] w-[80px] items-center justify-center overflow-hidden rounded-[10px] border border-[#f2f2f2] bg-[#f8f8f8]">
            {state.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.photoUrl}
                alt="Foto profilo allievo"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[11px] font-medium text-[#c1c1c1]">
                {state.loading ? '…' : 'Nessuna'}
              </span>
            )}
          </div>
          {renderDownloads('photo', Boolean(state.photoUrl))}
        </div>
        <div>
          <p className="mb-1.5 text-[12px] font-medium text-[#929292]">Firma</p>
          <div className="flex h-[64px] w-full max-w-[220px] items-center justify-center overflow-hidden rounded-[10px] border border-[#f2f2f2] bg-white px-3">
            {state.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.signatureUrl}
                alt="Firma allievo"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-[11px] font-medium text-[#c1c1c1]">
                {state.loading ? '…' : 'Nessuna'}
              </span>
            )}
          </div>
          {renderDownloads('signature', Boolean(state.signatureUrl))}
        </div>
      </div>
    </section>
  );
}
