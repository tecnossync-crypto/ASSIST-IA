import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build de producción autocontenido (necesario para el Dockerfile: copia
  // solo lo mínimo para correr, sin depender de node_modules completo).
  output: "standalone",
};

export default nextConfig;
