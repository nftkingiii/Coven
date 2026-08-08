import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(appDirectory, "dist");
const port = Number(process.env.PORT ?? 4173);
const revision =
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  process.env.COVEN_REVISION ??
  "local";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".wasm", "application/wasm"],
]);

function setSecurityHeaders(response) {
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

async function existingFile(candidate) {
  try {
    await access(candidate);
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  if (requestUrl.pathname === "/health") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ ok: true, service: "coven-web", revision }));
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  const relativePath = pathname.replace(/^\/+/, "");
  const requestedFile = path.resolve(distDirectory, relativePath);
  const insideDist =
    requestedFile === distDirectory || requestedFile.startsWith(`${distDirectory}${path.sep}`);
  if (!insideDist) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const requestedFileExists = relativePath && (await existingFile(requestedFile));
  if (!requestedFileExists && path.extname(relativePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = requestedFileExists
    ? requestedFile
    : path.join(distDirectory, "index.html");
  if (!(await existingFile(filePath))) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Coven web build is unavailable");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
  response.writeHead(200, {
    "Cache-Control": immutable
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "Content-Type": contentTypes.get(extension) ?? "application/octet-stream",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Coven web listening on ${port}`);
});

function shutDown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
