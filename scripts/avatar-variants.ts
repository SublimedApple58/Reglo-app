/**
 * REG-639 giro Road — copie avatar 512 px per le foto profilo GIÀ caricate.
 *
 * Le foto profilo restano ORIGINALI (non si toccano mai: né sovrascritte né
 * cancellate). Per ognuna lo script salva accanto la copia
 * `<image>.avatar-512.jpg` (JPEG quadrato 512 px, Cache-Control immutabile) e
 * la registra su `User.imageAvatar`. L'endpoint degli avatar
 * (`getUserPhotoUrls`) la usa solo se deriva dall'`image` attuale.
 *
 * Idempotente: salta chi ha già la copia giusta. Reversibile: `--revert`
 * azzera `imageAvatar` e cancella SOLO le copie `*.avatar-512.jpg`.
 *
 * Uso (dal worktree, con l'env dell'ambiente):
 *   DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
 *     npx tsx scripts/avatar-variants.ts              # prova: elenca, non scrive
 *   ... npx tsx scripts/avatar-variants.ts --apply      # crea le copie
 *   ... npx tsx scripts/avatar-variants.ts --revert     # torna a prima
 *   (opzionale) --limit N   per fare solo i primi N utenti
 *   Su prod serve anche `--prod` (solo con l'ok di Tiziano).
 */
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

import {
  AVATAR_CACHE_CONTROL,
  avatarVariantKey,
  buildAvatarJpeg,
  canHaveAvatarVariant,
} from "../lib/images/avatar-variant";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const REVERT = args.includes("--revert");
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : undefined;

const prisma = new PrismaClient();

function r2() {
  const bucket = process.env.R2_BUCKET_NAME ?? process.env.R2_BUCKET;
  const endpointRaw = process.env.R2_ENDPOINT;
  if (!bucket || !endpointRaw || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("Variabili R2 mancanti (R2_BUCKET_NAME, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
  }
  const trimmed = endpointRaw.replace(/\/+$/, "");
  const endpoint = trimmed.endsWith(`/${bucket}`) ? trimmed.slice(0, -(bucket.length + 1)) : trimmed;
  const client = new S3Client({
    region: process.env.R2_REGION ?? "auto",
    endpoint,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    forcePathStyle: true,
  });
  return { client, bucket };
}

async function main() {
  if (/prod/i.test(process.env.DOTENV_CONFIG_PATH ?? "") && !args.includes("--prod")) {
    throw new Error("avatar-variants: su prod serve anche --prod.");
  }
  const env = process.env.APP_ENV ?? "(APP_ENV non impostato)";
  const mode = REVERT ? "REVERT" : APPLY ? "APPLY" : "PROVA (nessuna scrittura)";
  console.log(`avatar-variants · ambiente ${env} · ${mode}`);
  const { client, bucket } = r2();

  if (REVERT) {
    const users = await prisma.user.findMany({
      where: { imageAvatar: { not: null } },
      select: { id: true, imageAvatar: true },
      take: LIMIT,
    });
    console.log(`${users.length} utenti con copia avatar`);
    for (const u of users) {
      const key = u.imageAvatar!;
      // Si cancella solo una nostra copia, mai un originale.
      if (key.endsWith(".avatar-512.jpg")) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch((e) => {
          console.warn(`  ! ${u.id}: copia non cancellata (${String(e)})`);
        });
      }
      await prisma.user.update({ where: { id: u.id }, data: { imageAvatar: null } });
      console.log(`  - ${u.id} azzerata`);
    }
    return;
  }

  const users = await prisma.user.findMany({
    where: { image: { not: null } },
    select: { id: true, image: true, imageAvatar: true },
    orderBy: { id: "asc" },
    take: LIMIT,
  });
  const todo = users.filter((u) => canHaveAvatarVariant(u.image) && u.imageAvatar !== avatarVariantKey(u.image!));
  const external = users.filter((u) => !canHaveAvatarVariant(u.image)).length;
  console.log(
    `${users.length} utenti con foto · ${users.length - todo.length - external} già a posto · ${external} esterne (saltate) · ${todo.length} da fare`,
  );

  let done = 0;
  let failed = 0;
  let before = 0;
  let after = 0;
  for (const u of todo) {
    const image = u.image!;
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: image }));
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) throw new Error("oggetto vuoto");
      const jpeg = await buildAvatarJpeg(Buffer.from(bytes));
      before += bytes.length;
      after += jpeg.length;
      const key = avatarVariantKey(image);
      if (APPLY) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: jpeg,
            ContentType: "image/jpeg",
            CacheControl: AVATAR_CACHE_CONTROL,
          }),
        );
        // Solo se nel frattempo la foto non è cambiata.
        await prisma.user.updateMany({ where: { id: u.id, image }, data: { imageAvatar: key } });
      }
      done += 1;
      console.log(`  ${APPLY ? "+" : "·"} ${u.id} ${Math.round(bytes.length / 1024)} KB → ${Math.round(jpeg.length / 1024)} KB`);
    } catch (e) {
      failed += 1;
      console.warn(`  ! ${u.id} ${image}: ${String(e)} (resta l'originale)`);
    }
  }
  console.log(
    `${APPLY ? "Fatte" : "Da fare"}: ${done} · non riuscite: ${failed} · ${Math.round(before / 1024 / 1024)} MB → ${Math.round(after / 1024)} KB`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
