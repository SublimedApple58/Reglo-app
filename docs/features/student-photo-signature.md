# Foto profilo + Firma allievo (con export Portale dell'automobilista)

**Stato:** implementato su branch `feature/foto-firma-allievo` (2026-08-04, per demo prospect). Controparte mobile: `reglo-mobile/docs/features/student-photo-signature.md`.

## Cosa fa

- L'allievo carica dall'app mobile la **foto profilo** (fotocamera/libreria) e appone la **firma** su un pad touch. Gli originali sono salvati **così come caricati/disegnati** (nessun adattamento in upload).
- Nel dettaglio allievo web (drawer di `AutoscuoleStudentsPage`, tab Riepilogo, sezione "Foto e firma") lo staff vede le anteprime e scarica ciascun asset in due varianti: **Originale** e **Adattata per Portale dell'automobilista** (crop/resize/compress al volo).

## Modello dati

- `User.image` (esistente, chiave R2): riusato come foto profilo — la foto caricata dall'allievo È l'avatar.
- `User.signatureKey` (nuovo, chiave R2): PNG trasparente della firma. Migrazione `20260804090000_add_user_signature_key` (additiva).

## Specifiche portale (costanti modificabili)

`lib/portal-image-specs.ts` — UNICA fonte: mm, dpi, formato, KB target (valori raccolti a voce dal cliente, potenzialmente da ritoccare). Px derivati da mm×dpi. Foto: 33×40mm @200dpi → 260×315 JPEG ≤~27KB. Firma: 30×6mm @200dpi → 236×47 JPEG ≤~35KB. `SIGNATURE_ORIGINAL_SCALE` = scala di rasterizzazione dell'originale firma.

## File

| File | Ruolo |
|------|-------|
| `lib/portal-image-specs.ts` | Costanti specifiche portale |
| `lib/images/portal.ts` | Pipeline sharp: `photoToPortalVariant` (crop cover + loop qualità JPEG), `signatureToPortalVariant` (trim + flatten bianco + contain), `rasterizeSignature` (tratti vettoriali → SVG → PNG trasparente) |
| `app/api/mobile/profile/photo/route.ts` | POST multipart (Bearer mobile) → R2 `users/{userId}/photo-*`, aggiorna `User.image` |
| `app/api/mobile/profile/signature/route.ts` | POST JSON `{strokes,width,height,strokeWidth}` (Bearer mobile) → rasterizza server-side → R2 `users/{userId}/signature-*.png`, aggiorna `User.signatureKey` |
| `app/api/mobile/me/route.ts` | Esteso: `user.photoUrl` + `user.signatureUrl` (signed URL) |
| `app/api/students/[studentUserId]/media/[kind]/route.ts` | GET download web: `kind=photo\|signature`, `?variant=original\|portale`; auth sessione + staff della company attiva + allievo membro della stessa company; `Content-Disposition: attachment` |
| `lib/actions/student-media.actions.ts` | `getStudentMediaOverview(studentUserId)` → signed URL anteprime (stessa auth del download) |
| `components/pages/Autoscuole/StudentMediaSection.tsx` | Sezione "Firma" del drawer (anteprima + link Originale/Portale); passa gli URL al parent via onLoaded |
| `components/pages/Autoscuole/AutoscuoleStudentsPage.tsx` | Header drawer: avatar 96px + pill "Modifica" (upload staff) + pill download foto con menu Originale/Portale; monta `StudentMediaSection` nel Riepilogo |

## Note

- `sharp` e `server-only` ora dipendenze dirette in `package.json`.
- La firma NON viene inviata come immagine dal telefono: arrivano i tratti vettoriali e il server li rasterizza 1:1 (nessun modulo nativo mobile per lo screenshot del canvas).
- La variante portale è generata **on-the-fly a ogni download** (nessuna cache R2): specs ritoccabili senza rigenerare nulla.
- Il loop qualità JPEG sceglie la qualità più alta sotto `targetMaxKb`; il target è indicativo, non un hard limit.

## Foto negli avatar OVUNQUE (estensione 2026-08-04)

Ogni avatar a iniziali mostra la foto profilo se presente, via **risoluzione batched client-side** (nessun serializer di lista toccato):

- `lib/actions/user-photos.actions.ts` — `getUserPhotoUrls({userIds, instructorIds})`: company-scoped, funziona da web (sessione) e mobile (Bearer, via `getActiveCompanyContext`).
- `app/api/autoscuole/user-photos/route.ts` — GET per il mobile (`ids`/`instructorIds` CSV).
- `components/ui/user-photo.tsx` — cache modulo + batching 50ms; hook `useUserPhotoUrl`/`useInstructorPhotoUrl`, wrapper `UserPhotoCircle` (foto se c'è, children=iniziali altrimenti), `invalidateUserPhoto`.
- Siti patchati web: `AutoscuoleStudentsPage` (StudentAvatar: lista+drawer), `AutoscuoleAgendaPage` (allievi esame ×3, istruttori week/day), `InstructorsTab`, `GroupLessonManageDialog`/`CreateDialog`, `AdminUsersPage`, `AutoscuoleVoicePage`.
- Upload web staff: pill "Modifica" sull'avatar del drawer → `POST /api/students/[id]/media/photo`.
- **Esclusi (fallback iniziali, eventuale follow-up)**: `OwnerNotificationsBell` (payload senza userId), `components/shared/header/user-button.tsx` (header legacy), picker mobile label-only.

## Connessioni

- **Avatar web esistente** (`app/api/uploads/avatar`, `lib/actions/storage.actions.ts`): stesso campo `User.image` — un upload dall'app sostituisce l'avatar mostrato ovunque (voluto).
- **Storage R2**: `lib/storage/r2.ts` condiviso con avatar/logo/company-documents.
- **Mobile**: tipi `UserPublic.photoUrl/signatureUrl`, `UploadMediaPayload`, `UploadSignatureInput` in `reglo-mobile/src/types/regloApi.ts`.
