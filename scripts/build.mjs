import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });

await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  target: ["es2020"],
  outfile: "dist/assets/app.js",
  minify: true,
  sourcemap: false,
});

const styles = await readFile("styles.css", "utf8");
await writeFile("dist/assets/styles.css", styles);

let html = await readFile("index.html", "utf8");
html = html.replace('<link rel="stylesheet" href="./styles.css" />', '<link rel="stylesheet" href="/assets/styles.css" />');
html = html.replace('<script type="module" src="./src/main.js"></script>', '<script defer src="/assets/app.js?v=iife-4"></script>');
await writeFile("dist/index.html", html);
