import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  process.env.STATIC_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "dist/public"),
);
const port = Number(process.env.PORT || 3000);
const version = process.env.APP_VERSION || "dev";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-cache",
    ...headers,
  });
  res.end(body);
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function serveFile(req, res, filePath) {
  const body = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const headers = {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
  };

  if (extension === ".js" || extension === ".css" || extension === ".ttf" ||
      extension === ".woff" || extension === ".woff2") {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  }

  res.writeHead(200, headers);
  if (req.method !== "HEAD") res.write(body);
  res.end();
}

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method Not Allowed\n", { Allow: "GET, HEAD" });
  }

  if (req.url === "/healthz") {
    return send(
      res,
      200,
      JSON.stringify({ status: "ok", version }),
      { "Content-Type": "application/json; charset=utf-8" },
    );
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad Request\n");
  }

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const candidate = path.resolve(root, `.${requestedPath}`);

  // Prevent URL traversal outside the exported static directory.
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return send(res, 403, "Forbidden\n");
  }

  if (await fileExists(candidate)) {
    return serveFile(req, res, candidate);
  }

  // Expo Router needs SPA fallback for client-side routes, but missing assets
  // should remain 404s instead of returning HTML.
  const acceptsHtml = String(req.headers.accept || "").includes("text/html");
  if (acceptsHtml && await fileExists(path.join(root, "index.html"))) {
    return serveFile(req, res, path.join(root, "index.html"));
  }

  return send(res, 404, "Not Found\n");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`appeduv2pwa listening on :${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
