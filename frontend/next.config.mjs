/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing the shared and backend workspace packages directly as TypeScript source.
  transpilePackages: ['@worksignal/shared', '@worksignal/backend'],
  webpack: (config) => {
    // The backend workspace uses ESM-style `.js` extensions in imports (e.g.
    // `import './foo.js'`) which actually resolve to `.ts` source files.
    // Next.js webpack needs to be told to try `.ts`/`.tsx` before `.js` so
    // that transpilePackages can process them from source.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
