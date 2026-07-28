import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const provingHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Noir's wasm-bindgen modules resolve their WASM relative to import.meta.url.
    // Pre-bundling moves the JS into .vite/deps without moving the WASM beside it.
    exclude: [
      "@noir-lang/noir_js",
      "@noir-lang/acvm_js",
      "@noir-lang/noirc_abi",
    ],
  },
  server: {
    headers: provingHeaders,
  },
  preview: {
    headers: provingHeaders,
  },
  worker: {
    format: "es",
  },
});
