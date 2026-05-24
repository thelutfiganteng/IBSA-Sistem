import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// We set cloudflare: false to allow hosting on Vercel.
// We remove the custom "server" entry redirect so TanStack Start falls back to its 
// standard, Vercel-native default server entry.
export default defineConfig({
  cloudflare: false,
});
