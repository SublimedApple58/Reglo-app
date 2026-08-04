'use client';

import * as React from 'react';
import { getUserPhotoUrls } from '@/lib/actions/user-photos.actions';

/**
 * Cache client delle foto profilo per gli avatar.
 * Le richieste dei singoli avatar vengono accumulate e risolte in un'unica
 * chiamata batched (getUserPhotoUrls) ogni ~50ms. Cache a livello di modulo:
 * vive per la durata della pagina.
 */

type Key = `u:${string}` | `i:${string}`;

const cache = new Map<Key, string | null>();
const queued = new Set<Key>();
const inflight = new Set<Key>();
const listeners = new Set<() => void>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const notify = () => listeners.forEach((fn) => fn());

async function flush() {
  flushTimer = null;
  const batch = [...queued];
  queued.clear();
  batch.forEach((key) => inflight.add(key));

  const userIds = batch.filter((k) => k.startsWith('u:')).map((k) => k.slice(2));
  const instructorIds = batch.filter((k) => k.startsWith('i:')).map((k) => k.slice(2));

  try {
    const res = await getUserPhotoUrls({ userIds, instructorIds });
    batch.forEach((key) => {
      const id = key.slice(2);
      const value = res.success
        ? (key.startsWith('u:') ? res.data.users[id] : res.data.instructors[id]) ?? null
        : null;
      cache.set(key, value);
    });
  } catch {
    batch.forEach((key) => cache.set(key, null));
  } finally {
    batch.forEach((key) => inflight.delete(key));
    notify();
  }
}

function requestKey(key: Key) {
  if (cache.has(key) || inflight.has(key) || queued.has(key)) return;
  queued.add(key);
  if (!flushTimer) flushTimer = setTimeout(() => void flush(), 50);
}

/** Invalida la foto di un utente (es. dopo un upload): al prossimo render viene rifetchata. */
export function invalidateUserPhoto(userId: string) {
  cache.delete(`u:${userId}` as Key);
  notify();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function usePhotoByKey(key: Key | null) {
  const url = React.useSyncExternalStore(
    subscribe,
    () => (key ? (cache.get(key) ?? null) : null),
    () => null
  );
  React.useEffect(() => {
    if (key) requestKey(key);
  }, [key]);
  return url;
}

/** URL foto profilo per uno userId (null finché non risolta o assente). */
export function useUserPhotoUrl(userId?: string | null) {
  return usePhotoByKey(userId ? (`u:${userId}` as Key) : null);
}

/** URL foto profilo per un AutoscuolaInstructor.id. */
export function useInstructorPhotoUrl(instructorId?: string | null) {
  return usePhotoByKey(instructorId ? (`i:${instructorId}` as Key) : null);
}

/**
 * Avatar con foto se disponibile, altrimenti il fallback esistente (children).
 * Wrappa il markup a iniziali senza cambiarlo: se la foto c'è la mostra
 * al suo posto, con la stessa taglia.
 */
export function UserPhotoCircle({
  userId,
  instructorId,
  size,
  className,
  alt = 'Foto profilo',
  children,
}: {
  userId?: string | null;
  instructorId?: string | null;
  size: number;
  className?: string;
  alt?: string;
  children: React.ReactNode;
}) {
  const url = usePhotoByKey(
    userId ? (`u:${userId}` as Key) : instructorId ? (`i:${instructorId}` as Key) : null
  );
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        className={`shrink-0 rounded-full object-cover ${className ?? ''}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <>{children}</>;
}
