import { createServer } from "node:http";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);

const allowed = new Set([
  "/index.html",
  "/styles.css",
  "/app.js",
  "/engine.js",
  "/data/swiss-2026.json",
]);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  if (!allowed.has(pathname)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("找不到檔案");
    return;
  }
  try {
    const body = await readFile(join(root, pathname));
    response.writeHead(200, {
      "content-type": types[extname(pathname)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("找不到檔案");
  }
});

const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  server.listen(port, "127.0.0.1", () => {
    console.log(`listening ${server.address().port}`);
  });
}

export { server };
