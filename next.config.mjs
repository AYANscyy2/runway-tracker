/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Keep type errors loud during build instead of silently passing.
    ignoreBuildErrors: false,
  },
  images: {
    // Google serves profile pictures from numbered lh* subdomains, so match
    // the whole family rather than pinning one that will eventually change.
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
