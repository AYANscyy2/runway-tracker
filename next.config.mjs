/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Keep type errors loud during build instead of silently passing.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
