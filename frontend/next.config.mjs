/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing the shared and backend workspace packages directly as TypeScript source.
  transpilePackages: ['@worksignal/shared', '@worksignal/backend'],
  webpack: (config, { isServer }) => {
    // The backend workspace uses ESM-style `.js` extensions in imports (e.g.
    // `import './foo.js'`) which actually resolve to `.ts` source files.
    // Next.js webpack needs to be told to try `.ts`/`.tsx` before `.js` so
    // that transpilePackages can process them from source.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };

    // The shared package uses node:crypto for token encryption utilities.
    // These are only needed server-side. Stub them out for client bundles.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        'node:crypto': false,
      };
    }

    return config;
  },
};

export default nextConfig;
