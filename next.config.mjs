/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Every page is statically generated (SSG); data is read at build time.
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: false,
};

export default nextConfig;
