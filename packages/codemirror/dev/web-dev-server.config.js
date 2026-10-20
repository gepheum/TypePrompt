import { importMapsPlugin } from "@web/dev-server-import-maps";

const mode = process.env.MODE || "dev";
if (!["dev", "prod"].includes(mode)) {
  throw new Error(`MODE must be "dev" or "prod", was "${mode}"`);
}

export default {
  port: 8080,
  rootDir: ".",
  appIndex: "dev/index.html",
  nodeResolve: { exportConditions: mode === "dev" ? ["development"] : [] },
  preserveSymlinks: true,
  middleware: [
    async (ctx, next) => {
      if (ctx.url === "/" || ctx.url === "/index.html") {
        ctx.url = "/dev/index.html";
      }
      await next();
    },
  ],
  plugins: [
    importMapsPlugin({
      inject: {
        importMap: {
          imports: {},
        },
      },
    }),
  ],
};
