import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['three'],
  // /Volumes mounts don't get fsevents — poll so dev edits actually recompile.
  watchOptions: {
    pollIntervalMs: 1000,
  },
};

export default nextConfig;
