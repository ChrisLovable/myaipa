import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: true,
  register: false,
  skipWaiting: false,
  buildExcludes: [/app-build-manifest\.json$/],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth', 'pdfkit', 'docx'],
  },
}

export default withPWA(nextConfig)
