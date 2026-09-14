import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(artifactDir, "../..");
const outputDir = path.join(artifactDir, "dist", "public");
const exportDir = path.join(artifactDir, ".expo-web-export");

rmSync(exportDir, { recursive: true, force: true });
rmSync(path.join(artifactDir, "dist"), { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const domain =
  process.env.REPLIT_INTERNAL_APP_DOMAIN ||
  process.env.REPLIT_DEV_DOMAIN ||
  "localhost";

execFileSync(
  "pnpm",
  [
    "--filter",
    "@workspace/edu-mobile",
    "exec",
    "expo",
    "export",
    "--platform",
    "web",
    "--output-dir",
    exportDir,
  ],
  {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      EXPO_PUBLIC_DOMAIN: domain,
      EXPO_PUBLIC_REPL_ID: process.env.REPL_ID || "",
    },
  },
);

// Expo keeps the JavaScript bundle and all hashed assets under `_expo/` and
// `assets/`. Copy the full export tree; copying only index.html makes the
// static server fall back to HTML for the bundle URL and leaves a blank app.
cpSync(exportDir, outputDir, { recursive: true });

for (const filename of [
  "manifest.webmanifest",
  "sw.js",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
]) {
  const source = path.join(artifactDir, "public", filename);
  if (existsSync(source)) cpSync(source, path.join(outputDir, filename));
}

const indexPath = path.join(outputDir, "index.html");
let index = readFileSync(indexPath, "utf8");
index = index
  .replace("<html>", '<html lang="vi">')
  .replace("</head>", [
    '    <meta name="theme-color" content="#173f3d" />',
    '    <link rel="manifest" type="application/manifest+json" href="./manifest.webmanifest" />',
    '    <link rel="icon" type="image/svg+xml" href="./icon.svg" />',
    "</head>",
  ].join("\n"))
  .replace("</body>", [
    "  <script>",
    "    if ('serviceWorker' in navigator) {",
    "      window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));",
    "    }",
    "  </script>",
    "</body>",
  ].join("\n"));
writeFileSync(indexPath, index);

console.log(`Expo Web PWA exported to ${outputDir}`);