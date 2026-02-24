import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";
import type { ServerResponse } from "http";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    {
      name: "charset-utf8",
      configureServer(server) {
        server.middlewares.use((_req, res: ServerResponse, next) => {
          const origSetHeader = res.setHeader.bind(res);
          res.setHeader = (name: string, value: string | number | readonly string[]) => {
            if (
              name.toLowerCase() === "content-type" &&
              typeof value === "string" &&
              /^text\/|application\/javascript/i.test(value) &&
              !value.includes("charset")
            ) {
              return origSetHeader(name, `${value}; charset=utf-8`);
            }
            return origSetHeader(name, value);
          };
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
