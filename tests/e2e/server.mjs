// Servidor estático mínimo para probar la exportación (out/) como lo sirve Vercel.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = new URL("../../out/", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain", ".ico": "image/x-icon", ".woff2": "font/woff2" };

export function startServer(port = 4173) {
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(ROOT, p);
    try {
      const s = await stat(file);
      if (s.isDirectory()) file = join(file, "index.html");
    } catch {
      if (!extname(file)) file = join(ROOT, p, "index.html");
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

if (process.argv[1] === new URL(import.meta.url).pathname) startServer(Number(process.env.PORT) || 4173).then(() => console.log("http://localhost:4173"));
