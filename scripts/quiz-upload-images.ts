import 'dotenv/config';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const IMAGES_DIR = join(__dirname, '../data/quiz-raw/avalla/public/images');
const R2_PREFIX = 'quiz/images/';

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
};

async function main() {
  const bucket = process.env.R2_BUCKET_NAME ?? process.env.R2_BUCKET;
  if (!bucket) throw new Error('Missing R2_BUCKET_NAME');

  const endpoint = requiredEnv('R2_ENDPOINT').replace(/\/+$/, '');
  const normalizedEndpoint = endpoint.endsWith(`/${bucket}`)
    ? endpoint.slice(0, -(bucket.length + 1))
    : endpoint;

  const client = new S3Client({
    region: process.env.R2_REGION ?? 'auto',
    endpoint: normalizedEndpoint,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
  });

  const files = (await readdir(IMAGES_DIR)).filter((f) => f.endsWith('.gif'));
  console.log(`Found ${files.length} images to upload`);

  let uploaded = 0;
  for (const file of files) {
    const body = await readFile(join(IMAGES_DIR, file));
    const key = `${R2_PREFIX}${file}`;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'image/gif',
      }),
    );

    uploaded++;
    if (uploaded % 50 === 0) {
      console.log(`Uploaded ${uploaded}/${files.length}`);
    }
  }

  console.log(`Done. Uploaded ${uploaded} images.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
