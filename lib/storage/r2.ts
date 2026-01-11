import 'server-only';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type R2Config = {
  client: S3Client;
  bucket: string;
};

let cachedConfig: R2Config | null = null;

export const getR2Client = () => getConfig().client;
export const getR2Bucket = () => getConfig().bucket;
export const getSignedAssetUrl = async (
  key: string,
  expiresInSeconds = 3600
) => {
  if (key.startsWith('http')) {
    return key;
  }

  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
    }),
    { expiresIn: expiresInSeconds }
  );
};

const requiredEnv = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const getConfig = () => {
  if (cachedConfig) {
    return cachedConfig;
  }

  const bucketName = requiredEnv(process.env.R2_BUCKET_NAME, 'R2_BUCKET_NAME');
  const endpoint = normalizeEndpoint(
    requiredEnv(process.env.R2_ENDPOINT, 'R2_ENDPOINT'),
    bucketName
  );

  cachedConfig = {
    bucket: bucketName,
    client: new S3Client({
      region: process.env.R2_REGION ?? 'auto',
      endpoint,
      credentials: {
        accessKeyId: requiredEnv(
          process.env.R2_ACCESS_KEY_ID,
          'R2_ACCESS_KEY_ID'
        ),
        secretAccessKey: requiredEnv(
          process.env.R2_SECRET_ACCESS_KEY,
          'R2_SECRET_ACCESS_KEY'
        ),
      },
      forcePathStyle: true,
    }),
  };

  return cachedConfig;
};

function normalizeEndpoint(value: string, bucket: string) {
  const trimmed = value.replace(/\/+$/, '');
  if (trimmed.endsWith(`/${bucket}`)) {
    return trimmed.slice(0, -(bucket.length + 1));
  }
  return trimmed;
}
