// A plain HTTP file server with an intentional subpath, for Pages acceptance only.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
};
http
  .createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith("/poolrooms/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    const relative = pathname.slice("/poolrooms/".length) || "index.html";
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const bytes = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(4174, "127.0.0.1", () =>
    console.log("Static Pages check: http://127.0.0.1:4174/poolrooms/"),
  );
