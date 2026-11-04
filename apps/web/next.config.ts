import type { NextConfig } from 'next';

const LOCAL_API_BASE_URL = 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@bookleaf/shared'],
  // Stops `next dev` writing its own AGENTS.md into this folder.
  agentRules: false,
  // The browser talks only to this origin. /api/* is proxied to Express (ADR-0003).
  // Rewrites are fixed at build time, so on Vercel API_BASE_URL must be set before building.
  async rewrites() {
    const apiBaseUrl = process.env.API_BASE_URL || (process.env.VERCEL ? '' : LOCAL_API_BASE_URL);
    if (!apiBaseUrl) {
      throw new Error('API_BASE_URL must be set in the Vercel project before building.');
    }
    const base = apiBaseUrl.replace(/\/$/, '');
    return [
      { source: '/api/:path*', destination: `${base}/api/:path*` },
      { source: '/docs/:path*', destination: `${base}/docs/:path*` },
    ];
  },
};

export default nextConfig;
