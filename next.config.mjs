/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.SPOKLET_BUILD_DIR || '.next',
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' }
    ] }];
  }
};
export default nextConfig;
