import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";

export default {
  input: "dist/app.js",
  output: {
    file: "dist/prompt-viewer-standalone.js",
    format: "iife",
    name: "PromptViewer",
    sourcemap: true,
  },
  plugins: [
    replace({
      "process.env.NODE_ENV": JSON.stringify("production"),
      preventAssignment: true,
    }),
    nodeResolve({
      browser: true,
      preferBuiltins: false,
    }),
    terser({
      compress: {
        drop_console: false,
        drop_debugger: true,
      },
    }),
  ],
};
