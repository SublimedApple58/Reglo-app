import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const resolveRemotePattern = (
  value?: string
): { protocol: 'http' | 'https'; hostname: string; port?: string } | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    const protocol = url.protocol.replace(':', '');
    if (protocol !== 'http' && protocol !== 'https') {
      return null;
    }
    return {
      protocol,
      hostname: url.hostname,
      port: url.port ?? '',
    };
  } catch {
    return null;
  }
};

const remotePatterns: Array<{
  protocol: 'http' | 'https';
  hostname: string;
  port?: string;
}> = [
  {
    protocol: 'https',
    hostname: 'utfs.io',
    port: '',
  },
];

const r2PublicPattern = resolveRemotePattern(process.env.R2_PUBLIC_BASE_URL);
const r2EndpointPattern = resolveRemotePattern(process.env.R2_ENDPOINT);

if (r2PublicPattern) {
  remotePatterns.push(r2PublicPattern);
}

if (r2EndpointPattern) {
  remotePatterns.push(r2EndpointPattern);
}

const nextConfig: NextConfig = {
  devIndicators: false,
  webpack: (config) => {
    config.module.rules.push({
      test: /\.pdf$/,
      type: "asset/resource",
    });
    return config;
  },
  images: {
    remotePatterns,
  },
};

export default withNextIntl(nextConfig);
