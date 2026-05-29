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
  // Externalise native-binary and ESM-quirky packages so Next.js loads
  // them at runtime via Node's CommonJS require instead of bundling them
  // through Webpack.
  //   - pdfjs-dist (via pdf-to-img): bundled ESM crashes Webpack's RSC
  //     `__webpack_require__.r` with "Object.defineProperty called on
  //     non-object", 500-ing every PDF-Vision request.
  //   - @napi-rs/canvas: ships per-platform `.node` binaries (Linux
  //     x64-gnu/musl, etc.) that Webpack has no loader for; the build
  //     fails with "Module parse failed: Unexpected character".
  // PDF export now renders via the Browserless.io REST API, so no local
  // browser binary needs externalising or file-tracing for that route.
  // In Next 14 this key lives under `experimental` (renamed to top-level
  // `serverExternalPackages` in Next 15).
  experimental: {
    serverComponentsExternalPackages: [
      'pdf-to-img',
      'pdfjs-dist',
      '@napi-rs/canvas',
    ],
    // Externalising tells Webpack "don't bundle", but Vercel's output
    // file tracer also won't follow `require.resolve(...)` strings or
    // platform-specific subpackages, so the deployed function ends up
    // missing the externalised modules' files. Listing them here forces
    // Vercel to include the entire package tree in each function's
    // bundle that needs it.
    outputFileTracingIncludes: {
      '/api/questions/import': [
        './node_modules/pdfjs-dist/**/*',
        './node_modules/pdf-to-img/**/*',
        './node_modules/@napi-rs/canvas/**/*',
        './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
        './node_modules/@napi-rs/canvas-linux-x64-musl/**/*',
      ],
    },
  },
}

export default nextConfig
