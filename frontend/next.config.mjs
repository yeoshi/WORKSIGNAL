/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep next-auth as a server-only external so webpack never tries to bundle
  // it (and its node: protocol imports like node:crypto) into client chunks.
  serverExternalPackages: ['next-auth', '@auth/core'],
  // Allow importing the shared and backend workspace packages directly as TypeScript source.
  transpilePackages: ['@worksignal/shared', '@worksignal/backend'],
  webpack: (config, { isServer, webpack: Webpack }) => {
    // The backend workspace uses ESM-style `.js` extensions in imports (e.g.
    // `import './foo.js'`) which actually resolve to `.ts` source files.
    // Next.js webpack needs to be told to try `.ts`/`.tsx` before `.js` so
    // that transpilePackages can process them from source.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };

    if (!isServer) {
      // @worksignal/shared exports crypto.ts which uses node: protocol imports
      // (node:crypto etc). Webpack 5 treats node: as a custom scheme and can't
      // resolve it for client bundles. Strip the prefix so the bare module name
      // falls through to resolve.fallback, which returns an empty module.
      config.plugins.push(
        new Webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        }),
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
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
