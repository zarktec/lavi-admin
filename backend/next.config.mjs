/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      // Verificación de Universal Links (iOS) y App Links (Android)
      { source: "/.well-known/apple-app-site-association", destination: "/api-wk/aasa" },
      { source: "/.well-known/assetlinks.json", destination: "/api-wk/assetlinks" },
    ];
  },
};
export default nextConfig;
