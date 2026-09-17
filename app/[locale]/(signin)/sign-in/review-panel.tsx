'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pannello destro del login: foto a tutta altezza + card recensioni che ruota
 * ogni 6s. Riproduce il design del sito marketing (reglo-landing, vista Login):
 * card esterna semitrasparente con blur, header scuro con avatar/nome/stelle e
 * corpo bianco con la citazione.
 */

type Review = {
  name: string;
  role: string;
  photo: string;
  text: string;
};

const REVIEWS: Review[] = [
  {
    name: 'Paolo',
    role: 'Titolare di autoscuola',
    photo: '/images/auth/review-paolo.png',
    text: 'I crediti guida sul quaderno erano discussioni continue. Adesso allievo e segreteria vedono lo stesso numero, aggiornato a ogni guida. Non se ne parla più, letteralmente.',
  },
  {
    name: 'Francesca',
    role: 'Segreteria',
    photo: '/images/auth/review-francesca.png',
    text: "Il telefono squillava tutto il giorno, quasi sempre per spostare o disdire una guida. Ora quel giro passa dall'app, e la Segretaria AI risponde quando siamo chiuse. Io mi occupo delle pratiche, non del centralino.",
  },
  {
    name: 'Martina',
    role: 'Istruttrice',
    photo: '/images/auth/review-martina.png',
    text: 'Mi sono ammalata un lunedì con dodici guide in settimana. Ho premuto «Sostituiscimi» e le guide sono passate ai colleghi, con gli allievi avvisati in automatico. Nessuna telefonata dal letto.',
  },
];

const ROTATE_MS = 6000;
const FADE_MS = 280;

const Star = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#f5a623" aria-hidden="true">
    <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8-6.1-3.6-6.1 3.6 1.5-6.8L2.2 9l6.9-.7L12 2z" />
  </svg>
);

const ReviewPanel = () => {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const pausedRef = useRef(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((next: number) => {
    setFading(true);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      setIndex(next);
      setFading(false);
    }, FADE_MS);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (pausedRef.current) return;
      setIndex((current) => {
        goTo((current + 1) % REVIEWS.length);
        return current;
      });
    }, ROTATE_MS);

    return () => {
      clearInterval(timer);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [goTo]);

  const review = REVIEWS[index];
  const fadeStyle = {
    opacity: fading ? 0 : 1,
    transition: `opacity ${FADE_MS}ms ease`,
  };

  return (
    <div className="relative flex-1 overflow-hidden rounded-[30px] bg-[#14142b]">
      <Image
        src="/images/auth/login-hero.jpg"
        alt="Il team di un'autoscuola al lavoro con Reglo"
        fill
        priority
        sizes="(max-width: 1023px) 0px, 52vw"
        className="object-cover"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(10,10,25,0.32) 0%, rgba(10,10,25,0) 24%, rgba(10,10,25,0) 55%, rgba(10,10,25,0.4) 100%)',
        }}
      />

      <div
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
        onClick={() => goTo((index + 1) % REVIEWS.length)}
        className="absolute bottom-[30px] left-1/2 flex w-[460px] max-w-[calc(100%-60px)] -translate-x-1/2 cursor-pointer flex-col gap-2 rounded-[30px] p-[9px] backdrop-blur-[6px]"
        style={{
          background: 'rgba(110,110,120,0.45)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
        }}
      >
        <div
          className="mb-2 flex items-center gap-[14px] rounded-[22px] px-[18px] py-[14px] backdrop-blur-[8px]"
          style={{ background: 'rgba(10,10,15,0.88)' }}
        >
          <div
            className="size-[52px] shrink-0 rounded-[14px] bg-cover bg-center"
            style={{ backgroundImage: `url("${review.photo}")`, ...fadeStyle }}
          />
          <div className="min-w-0 flex-1" style={fadeStyle}>
            <div className="truncate text-[19px] font-semibold text-white">{review.name}</div>
            <div className="mt-0.5 truncate text-[13px] font-medium text-[#b8b8c2]">
              {review.role}
            </div>
          </div>
          <div className="mt-1 flex shrink-0 gap-[3px] self-start">
            <Star />
            <Star />
            <Star />
            <Star />
            <Star />
          </div>
        </div>

        <div className="flex min-h-[190px] flex-col rounded-[22px] bg-white px-6 pb-5 pt-[22px]">
          <svg
            width="30"
            height="22"
            viewBox="0 0 30 22"
            fill="#c9c9d4"
            aria-hidden="true"
            className="mb-3"
          >
            <path
              d="M0 22V13.6C0 5.9 4.4 1.1 12 0l1.3 3.2C8.5 4.6 6.2 7 6 10h6v12H0zM17 22V13.6C17 5.9 21.4 1.1 29 0l1 3.2c-4.8 1.4-7.1 3.8-7.3 6.8H29v12H17z"
              transform="scale(-1,1) translate(-30,0)"
            />
          </svg>
          <p
            className="flex-1 text-[15px] font-medium leading-[1.65] text-[#333333]"
            style={fadeStyle}
          >
            {review.text}
          </p>
          <div className="mt-4 flex justify-center gap-1.5">
            {REVIEWS.map((item, i) => (
              <button
                key={item.name}
                type="button"
                aria-label={`Recensione di ${item.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  goTo(i);
                }}
                className="h-[7px] cursor-pointer rounded-[4px] transition-all duration-[250ms]"
                style={{
                  width: i === index ? '20px' : '7px',
                  background: i === index ? '#1c1c1c' : '#d5d5de',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewPanel;
