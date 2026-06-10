import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '..'),
  experimental: {
    outputFileTracingIncludes: {
      '/api/agent/run': ['.worksignal/**/*'],
    },
    serverComponentsExternalPackages: [
      'next-auth',
      '@auth/core',
      'pdf-parse',
      '@aws-sdk/client-bedrock-runtime',
      'tsx',
    ],
  },
  webpack: (config, { isServer, webpack: Webpack }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), 'tsx', 'tsx/esm/api'];
    }

    if (!isServer) {
      config.plugins.push(
        new Webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        'node:crypto': false,
        buffer: false,
        stream: false,
        util: false,
        path: false,
        fs: false,
      };
    }

    return config;
  },
};

export default nextConfig;
