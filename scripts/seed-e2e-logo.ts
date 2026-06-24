/**
 * Upload the Reglo logo to R2 and set it as the "Reglo E2E" company profile logo.
 * Idempotent: overwrites the same key + re-points logoKey. DEV only.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --compiler-options '{"module":"commonjs"}' scripts/seed-e2e-logo.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();

const requireEnv = (v: string | undefined, name: string): string => {
  if (!v) throw new Error(`${name} mancante in .env.dev`);
  return v;
};

const normalizeEndpoint = (value: string, bucket: string) => {
  const trimmed = value.replace(/\/+$/, '');
  return trimmed.endsWith(`/${bucket}`) ? trimmed.slice(0, -(bucket.length + 1)) : trimmed;
};

async function main() {
  const company = await prisma.company.findFirst({ where: { name: 'Reglo E2E' } });
  if (!company) throw new Error('Company "Reglo E2E" non trovata — esegui prima seed-e2e.ts');

  const logoPath = path.resolve(process.cwd(), 'assets/reglo_new_logo.png');
  const body = fs.readFileSync(logoPath);

  const bucket = requireEnv(process.env.R2_BUCKET_NAME ?? process.env.R2_BUCKET, 'R2_BUCKET_NAME');
  const endpoint = normalizeEndpoint(requireEnv(process.env.R2_ENDPOINT, 'R2_ENDPOINT'), bucket);
  const client = new S3Client({
    region: process.env.R2_REGION ?? 'auto',
    endpoint,
    credentials: {
      accessKeyId: requireEnv(process.env.R2_ACCESS_KEY_ID, 'R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv(process.env.R2_SECRET_ACCESS_KEY, 'R2_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
  });

  // Same key convention enforced by saveCompanyLogo: companies/<companyId>/...
  const key = `companies/${company.id}/logo.png`;
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'image/png' }),
  );
  await prisma.company.update({ where: { id: company.id }, data: { logoKey: key } });

  console.log('✓ Logo caricato e impostato');
  console.log(`  Company: ${company.name} (${company.id})`);
  console.log(`  logoKey: ${key}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
