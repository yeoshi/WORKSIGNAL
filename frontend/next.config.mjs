/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing the shared workspace package directly as TypeScript source.
  transpilePackages: ['@worksignal/shared'],
};

export default nextConfig;
