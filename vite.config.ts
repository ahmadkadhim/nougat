import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    viteReact()
  ]
});
