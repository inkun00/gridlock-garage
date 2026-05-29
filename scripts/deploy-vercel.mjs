import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_TEAM_ID;
const projectName = process.env.VERCEL_PROJECT || "gridlock-garage";
const root = process.cwd();

if (!token) {
  throw new Error("VERCEL_TOKEN is required.");
}

const ignored = new Set([".git", ".vercel", "node_modules"]);

async function collectFiles(dir = root) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolute));
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(absolute);
    if (info.size > 4_500_000) {
      throw new Error(`${absolute} is too large for inline deployment upload.`);
    }
    const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
    const data = await readFile(absolute);
    files.push({
      file: relative,
      data: data.toString("base64"),
      encoding: "base64",
    });
  }

  return files;
}

const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
const response = await fetch(`https://api.vercel.com/v13/deployments${query}`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: projectName,
    target: "production",
    files: await collectFiles(),
    projectSettings: {
      framework: null,
      buildCommand: null,
      devCommand: null,
      installCommand: null,
      outputDirectory: null,
    },
  }),
});

const payload = await response.json();

if (!response.ok) {
  throw new Error(JSON.stringify(payload, null, 2));
}

console.log(`Deployment created: https://${payload.url}`);
console.log(`Deployment id: ${payload.id}`);
