import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleAvailabilityRequest } from "./lib/availability.mjs";

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function serveStatic(response, pathname) {
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = path.resolve(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    response.writeHead(403);
    return response.end("Forbidden");
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      return response.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
    response.writeHead(200, {
      "content-type": TYPES[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(contents);
  });
}

export const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/availability") {
    try {
      const result = await handleAvailabilityRequest(url);
      response.writeHead(result.status, result.headers);
      return response.end(JSON.stringify(result.body));
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      return response.end(JSON.stringify({ error: "Availability request failed.", detail: error.message }));
    }
  }
  serveStatic(response, url.pathname);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`Court Radar ready at http://localhost:${PORT}`));
}
