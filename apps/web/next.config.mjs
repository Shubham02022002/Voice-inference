const gateway = process.env.VOICEFORGE_API_URL ?? "http://127.0.0.1:3001";

export default {
  async rewrites() {
    return [{ source: "/v1/:path*", destination: `${gateway}/v1/:path*` }];
  },
};
