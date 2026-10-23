import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve, extname, sep } from "node:path";
import { homedir } from "node:os";

// Local QA only: serve the installed Paseo client without touching its daemon.
const root = "C:/Program Files/Paseo/resources/app-dist";
const home = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
const keys = JSON.parse(
  await readFile(join(home, "daemon-keypair.json"), "utf8"),
);
const serverId = (await readFile(join(home, "server-id"), "utf8")).trim();
const hosts = [
  {
    serverId,
    label: "mzm",
    connections: [
      {
        id: "relay:qa",
        type: "relay",
        relayEndpoint: "relay.paseo.sh:443",
        useTls: true,
        daemonPublicKeyB64: keys.publicKeyB64,
      },
    ],
  },
];
const seed = `<script>localStorage.setItem('@paseo:daemon-registry',${JSON.stringify(JSON.stringify(hosts))});</script>`;
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const requested = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (
      !requested.startsWith(resolve(root) + sep) &&
      requested !== resolve(root)
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    let path = requested;
    if (!extname(path)) path = join(root, "index.html");
    let bytes: Buffer | string = await readFile(path);
    if (extname(path) === ".html")
      bytes = bytes.toString("utf8").replace("<head>", `<head>${seed}`);
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(4175, "127.0.0.1", () =>
  console.log("QA client: http://127.0.0.1:4175"),
);
