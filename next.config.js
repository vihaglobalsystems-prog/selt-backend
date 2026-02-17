/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow your Netlify frontend to call these API routes
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.CLIENT_URL || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, x-user-id, x-cron-secret' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
