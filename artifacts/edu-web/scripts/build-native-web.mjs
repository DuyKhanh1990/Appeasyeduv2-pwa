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
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
]) {
  const source = path.join(artifactDir, "public", filename);
  if (existsSync(source)) cpSync(source, path.join(outputDir, filename));
}

const indexPath = path.join(outputDir, "index.html");
let index = readFileSync(indexPath, "utf8");
const bundleVersion =
  index.match(/_expo\/static\/js\/web\/entry-([a-z0-9]+)\.js/i)?.[1] ||
  "unknown";
index = index
  .replace("<html>", '<html lang="vi">')
  .replace(
    'content="width=device-width, initial-scale=1, shrink-to-fit=no"',
    'content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"',
  )
  .replace("</head>", [
    '    <meta name="theme-color" content="#173f3d" />',
    '    <link rel="manifest" type="application/manifest+json" href="./manifest.webmanifest" />',
    '    <link rel="icon" type="image/png" href="./icon-192.png" />',
    '    <style id="easyedu-ios-viewport-lock">',
    "      html, body, #root {",
    "        width: 100%;",
    "        max-width: 100%;",
    "        overscroll-behavior: none;",
    "      }",
    "      html, body {",
    "        margin: 0;",
    "        overflow: hidden;",
    "      }",
    "      body {",
    "        position: fixed;",
    "        inset: 0;",
    "      }",
    "      #root {",
    "        min-height: 0;",
    "        overflow: hidden;",
    "      }",
    "    </style>",
    "</head>",
  ].join("\n"))
  .replace("</body>", [
    "  <script>",
    "    if ('serviceWorker' in navigator) {",
    "      window.addEventListener('load', () => navigator.serviceWorker.register('./sw-v4.js', { updateViaCache: 'none' }).catch(() => {}));",
    "    }",
    "  </script>",
    "</body>",
  ].join("\n"));
writeFileSync(indexPath, index);

const serviceWorkerPath = path.join(outputDir, "sw.js");
if (existsSync(serviceWorkerPath)) {
  const serviceWorker = readFileSync(serviceWorkerPath, "utf8").replaceAll(
    "__EASYEDU_BUILD_VERSION__",
    bundleVersion,
  );
  writeFileSync(serviceWorkerPath, serviceWorker);
  writeFileSync(path.join(outputDir, "sw-v4.js"), serviceWorker);
}

console.log(`Expo Web PWA exported to ${outputDir}`);