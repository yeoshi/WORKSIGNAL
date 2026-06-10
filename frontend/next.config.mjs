/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,
  experimental: {
    // Keep native/CJS packages out of the webpack bundle for API routes.
    serverComponentsExternalPackages: ['next-auth', '@auth/core', 'pdf-parse'],
  },
  webpack: (config, { isServer, webpack: Webpack }) => {
    if (!isServer) {
      // Local AWS helpers use node: protocol imports in some code paths.
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
