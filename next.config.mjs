/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 自架部署用 standalone：docker build 時只複製 .next/standalone
  output: "standalone",
  // LIFF 內嵌需要這些 header 不能 block iframe
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" }
        ]
      }
    ];
  }
};

export default nextConfig;
