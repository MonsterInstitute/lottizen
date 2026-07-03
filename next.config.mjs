/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: not using `output: "export"` — a pure static export can't run Edge
  // Middleware (needed for geo-routing). Every page still uses generateStaticParams
  // + dynamicParams=false, so they are prerendered as static HTML (SSG); Vercel
  // serves them statically and only runs middleware on `/`.
  images: {
    unoptimized: true,
  },
  trailingSlash: false,
};

export default nextConfig;
