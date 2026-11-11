import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
// Wrangler requires an asset directory even when Vite serves development assets.
if (!existsSync("dist/index.html")) {
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/index.html", "<!doctype html><title>FLAYR API</title>");
}
const processes = [
  spawn(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", "dev", "--port", "8787"],
    { stdio: "inherit" },
  ),
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort",
    ],
    { stdio: "inherit" },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of processes) p.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const p of processes) {
  p.on("error", () => stop(1));
  p.on("exit", (code) => stop(code || 0));
}
