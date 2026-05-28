/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Externalize pdfjs-dist (via pdf-to-img) so Next.js loads it via Node's
  // CommonJS require at runtime instead of bundling its ESM through
  // Webpack. The bundled ESM crashes Webpack's RSC `__webpack_require__.r`
  // with "Object.defineProperty called on non-object", which 500s every
  // Vision-PDF request even when the import is lazy. In Next 14 this key
  // lives under `experimental` (renamed to top-level
  // `serverExternalPackages` in Next 15).
  experimental: {
    serverComponentsExternalPackages: ['pdf-to-img', 'pdfjs-dist'],
  },
}

export default nextConfig
