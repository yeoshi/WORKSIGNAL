import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel often runs `next build` directly (not `npm run build`), so stage agent
// sources here as well — required for Run Agent on serverless.
const isProductionBuild =
  process.env.VERCEL === '1' || process.argv.includes('build');
if (isProductionBuild) {
  execSync('node scripts/stage-agent-backend.mjs', {
    cwd: __dirname,
    stdio: 'inherit',
  });
} else if (
  !existsSync(
    path.join(__dirname, '.worksignal/backend/src/discovery/opportunityScanner.ts'),
  )
) {
  try {
    execSync('node scripts/stage-agent-backend.mjs', {
      cwd: __dirname,
      stdio: 'inherit',
    });
  } catch (error) {
    console.warn(
      '[next.config] Agent backend staging skipped (local monorepo fallback still works):',
      error instanceof Error ? error.message : error,
    );
  }
}

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
