'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

import { LoadingDots } from '@/components/ui/loading-dots';

/**
 * Pezzi condivisi dai form delle pagine di accesso (login e recupero
 * password). Valori presi dal design del sito marketing, non dai token
 * `PROTO_*`: è un'eccezione voluta e circoscritta a queste pagine.
 */

export const LINK_CLASS =
  'text-[14px] font-semibold text-[#222222] underline decoration-1 underline-offset-2 transition-opacity hover:opacity-70';

export const INPUT_CLASS =
  'w-full rounded-[12px] border-[1.5px] border-[#dddddd] bg-white px-4 py-[14px] text-[15px] font-medium text-[#222222] outline-none transition-colors placeholder:font-medium placeholder:text-[#b0b0b0] hover:border-[#bbbbbb] focus:border-[#222222]';

export const LABEL_CLASS = 'mb-[7px] block text-[13.5px] font-semibold text-[#444444]';

const BUTTON_CLASS =
  'flex w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] bg-black py-[15px] text-[15.5px] font-semibold text-white transition-colors hover:bg-[#1a1a1a] disabled:cursor-default disabled:opacity-70';

const EyeIcon = ({ crossed }: { crossed: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    {crossed && (
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    )}
  </svg>
);

/**
 * Campo password con l'occhio mostra/nascondi.
 *
 * L'aria-label del toggle **non contiene la parola "password"** di proposito:
 * `getByLabel()` di Playwright fa match per sottostringa, e i test e2e di login
 * usano `getByLabel("Password")` — con "Mostra la password" il locator ne
 * troverebbe due e il test si romperebbe in strict mode.
 */
export const PasswordField = ({
  id,
  name,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name ?? id}
          type={visible ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${INPUT_CLASS} pr-[46px] tracking-[2px]`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Nascondi i caratteri' : 'Mostra i caratteri'}
          className="absolute right-[14px] top-1/2 flex -translate-y-1/2 cursor-pointer items-center text-[#b0b0b0] transition-colors hover:text-[#777777]"
        >
          <EyeIcon crossed={visible} />
        </button>
      </div>
    </>
  );
};

/** Bottone nero a tutta larghezza; in attesa mostra i tre puntini. */
export const SubmitButton = ({
  children,
  pending,
}: {
  children: React.ReactNode;
  pending?: boolean;
}) => {
  // Dentro un <form action={...}> lo stato arriva da React; fuori lo passa il
  // chiamante (useTransition).
  const status = useFormStatus();
  const busy = pending ?? status.pending;

  return (
    <button type="submit" disabled={busy} className={BUTTON_CLASS}>
      {busy ? <LoadingDots /> : children}
    </button>
  );
};

/** Riquadro rosso degli errori, stesso stile su tutte le pagine di accesso. */
export const FormError = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-4 rounded-[12px] border border-[#f0c9c0] bg-[#fdf3f1] px-4 py-3 text-sm font-medium text-[#c13515]">
    {children}
  </div>
);

/** Riquadro verde delle conferme (es. "codice inviato"). */
export const FormNotice = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-4 rounded-[12px] border border-[#cfe3d4] bg-[#f2f8f4] px-4 py-3 text-sm font-medium text-[#1f7a45]">
    {children}
  </div>
);
