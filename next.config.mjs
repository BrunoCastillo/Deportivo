/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exportación estática: todas las pantallas son HTML precacheable => la app funciona sin internet.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
