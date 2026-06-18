const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
}

// Source map upload only matters for builds that actually get deployed —
// skip it for local builds so `npm run build` stays fast. CI/VERCEL are set
// automatically by Vercel and most CI providers.
const isDeployBuild = Boolean(process.env.CI || process.env.VERCEL)

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !isDeployBuild,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
})
