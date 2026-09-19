'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';

import {
  completePasswordReset,
  sendPasswordResetCode,
  verifyPasswordResetCode,
} from '@/lib/actions/password-reset.actions';

import {
  FormError,
  FormNotice,
  INPUT_CLASS,
  LABEL_CLASS,
  LINK_CLASS,
  PasswordField,
  SubmitButton,
} from '../auth-form-ui';

/**
 * Recupero password in tre passi: email → codice a 6 cifre → nuova password.
 *
 * Gli stessi tre passi del mobile, e lo stesso backend. Email e codice restano
 * nello stato del componente perché ogni passo li ripresenta al server, che
 * ricontrolla tutto da capo: il client qui non è una fonte di verità, solo un
 * modo di non far ridigitare le cose.
 */

type Step = 'email' | 'code' | 'password';

/** Secondi di attesa prima di poter richiedere un altro codice (lato server è 60s). */
const RESEND_COOLDOWN_S = 60;

const ResetPasswordForm = ({
  locale,
  callbackUrl,
  initialEmail,
}: {
  locale: string;
  callbackUrl?: string;
  initialEmail?: string;
}) => {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  const codeInputRef = useRef<HTMLInputElement>(null);

  // Countdown del "Invia di nuovo": il server rifiuta comunque prima dei 60s,
  // tanto vale dirlo invece di far premere a vuoto.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus();
  }, [step]);

  const requestCode = (nextStep: Step) =>
    startTransition(async () => {
      setError('');
      const result = await sendPasswordResetCode(email);

      if (!result.success) {
        setError(result.message);
        return;
      }

      setNotice(result.message);
      setCooldown(RESEND_COOLDOWN_S);
      setStep(nextStep);
    });

  const submitEmail = (event: React.FormEvent) => {
    event.preventDefault();
    requestCode('code');
  };

  const submitCode = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError('');
      setNotice('');
      const result = await verifyPasswordResetCode(email, code);

      if (!result.success) {
        setError(result.message);
        return;
      }

      setStep('password');
    });
  };

  const submitPassword = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      setError('');
      // In caso di successo questa chiamata non torna: fa il login e redirige.
      const result = await completePasswordReset({
        email,
        code,
        password,
        confirmPassword,
        callbackUrl,
      });

      if (!result.success) {
        setError(result.message);
        return;
      }

      // Password cambiata ma login automatico non riuscito: lo diciamo e
      // rimandiamo all'accesso.
      setNotice(result.message);
    });
  };

  // ── Passo 1: email ─────────────────────────────────────────────────────────
  if (step === 'email') {
    return (
      <form onSubmit={submitEmail} className="w-full">
        <label htmlFor="email" className={LABEL_CLASS}>
          Email
        </label>
        <div className="mb-[26px]">
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="info@scuolaguidamontreal.it"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>

        {error && <FormError>{error}</FormError>}

        <SubmitButton pending={pending}>Invia il codice</SubmitButton>

        <p className="mt-[22px] text-center text-[14px] font-medium text-[#555555]">
          <Link href={`/${locale}/sign-in`} className={LINK_CLASS}>
            Torna all&apos;accesso
          </Link>
        </p>
      </form>
    );
  }

  // ── Passo 2: codice ────────────────────────────────────────────────────────
  if (step === 'code') {
    return (
      <form onSubmit={submitCode} className="w-full">
        {notice && <FormNotice>{notice}</FormNotice>}

        <label htmlFor="code" className={LABEL_CLASS}>
          Codice ricevuto via email
        </label>
        <div className="mb-3">
          <input
            ref={codeInputRef}
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="000000"
            value={code}
            // Niente maxLength: taglierebbe la stringa PRIMA che le non-cifre
            // vengano tolte, e un codice incollato con uno spazio dentro
            // ("123 456") arriverebbe mutilato.
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
            }
            className={`${INPUT_CLASS} text-center text-[22px] tracking-[10px]`}
          />
        </div>

        <p className="mb-[26px] text-[13px] font-medium text-[#8a8a8a]">
          Sei cifre, valide 15 minuti. Controlla anche la posta indesiderata.
        </p>

        {error && <FormError>{error}</FormError>}

        <SubmitButton pending={pending}>Continua</SubmitButton>

        <p className="mt-[22px] text-center text-[14px] font-medium text-[#555555]">
          Non è arrivato?{' '}
          {cooldown > 0 ? (
            <span className="text-[14px] font-semibold text-[#9a9a9a]">
              Puoi richiederlo tra {cooldown}s
            </span>
          ) : (
            <button
              type="button"
              onClick={() => requestCode('code')}
              disabled={pending}
              className={`${LINK_CLASS} cursor-pointer disabled:opacity-50`}
            >
              Invia di nuovo
            </button>
          )}
        </p>
        <p className="mt-2 text-center text-[14px] font-medium text-[#555555]">
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setCode('');
              setError('');
              setNotice('');
            }}
            className={`${LINK_CLASS} cursor-pointer`}
          >
            Cambia email
          </button>
        </p>
      </form>
    );
  }

  // ── Passo 3: nuova password ────────────────────────────────────────────────
  return (
    <form onSubmit={submitPassword} className="w-full">
      {notice && (
        <FormNotice>
          {notice}{' '}
          <Link href={`/${locale}/sign-in`} className="underline underline-offset-2">
            Vai all&apos;accesso
          </Link>
        </FormNotice>
      )}

      {/* Le due etichette non devono essere una la sottostringa dell'altra:
          getByLabel() dei test fa match per sottostringa e ne troverebbe due. */}
      <div className="mb-[18px]">
        <PasswordField
          id="new-password"
          label="Nuova password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
      </div>

      <div className="mb-3">
        <PasswordField
          id="confirm-password"
          label="Ripeti la password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
        />
      </div>

      <p className="mb-[26px] text-[13px] font-medium text-[#8a8a8a]">
        Almeno 6 caratteri. Cambiandola, esci da tutti i dispositivi dove eri
        già entrato.
      </p>

      {error && <FormError>{error}</FormError>}

      <SubmitButton pending={pending}>Salva ed entra</SubmitButton>
    </form>
  );
};

export default ResetPasswordForm;
