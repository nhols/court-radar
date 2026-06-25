const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const availabilityModule = import("./lib/availability.mjs");

function sendJson(response, status, data) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function serveStatic(response, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
    response.writeHead(403);
    return response.end("Forbidden");
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      return response.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
    const extension = path.extname(filePath);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    response.writeHead(200, {
      "content-type": types[extension] || "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(contents);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/availability") {
    try {
      const { getAvailability } = await availabilityModule;
      const result = await getAvailability(url.searchParams.get("date"), {
        skipAllStar: url.searchParams.get("skip") === "allstar"
      });
      return sendJson(response, result.status, result.data);
    } catch (error) {
      return sendJson(response, 500, { error: "Availability request failed.", detail: error.message });
    }
  }
  serveStatic(response, url.pathname);
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Court radar ready at http://localhost:${PORT}`));
}

module.exports = { server };
