import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

test("靜態伺服器只送本地檔，不連官方賽程", async () => {
  const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.equal(source.includes("esports-api"), false);
  assert.equal(source.includes("express"), false);

  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(logs || "server did not start")), 5000);
    child.stdout.on("data", () => {
      const found = logs.match(/listening (\d+)/);
      if (!found) return;
      clearTimeout(timer);
      resolve(found[1]);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}: ${logs}`));
    });
  });

  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    const html = await page.text();
    const style = await fetch(`http://127.0.0.1:${port}/styles.css`);
    const script = await fetch(`http://127.0.0.1:${port}/app.js`);
    const data = await fetch(`http://127.0.0.1:${port}/data/swiss-2026.json`);
    assert.equal(page.status, 200);
    assert.match(html, /WORLDS 2026/);
    assert.match(html, /清除試算/);
    assert.equal(style.status, 200);
    assert.equal(script.status, 200);
    assert.equal(data.status, 200);
    const snapshot = await data.json();
    assert.equal(snapshot.matches.length, 30);
    assert.equal(JSON.stringify(snapshot).includes("TBD"), false);

    const remotes = socketRemotes(child.pid);
    for (const remote of remotes) {
      const host = remote.split(":")[0];
      assert.ok(
        host === "00000000" ||
          host === "0100007F" ||
          host === "00000000000000000000000000000000" ||
          host === "0000000000000000FFFF00000100007F",
        remote,
      );
    }
  } finally {
    child.kill();
    await once(child, "exit");
  }
});

function socketRemotes(pid) {
  const inodes = new Set();
  for (const fd of readdirSync(`/proc/${pid}/fd`)) {
    try {
      const link = readlinkSync(`/proc/${pid}/fd/${fd}`);
      const match = link.match(/^socket:\[(\d+)\]$/);
      if (match) inodes.add(match[1]);
    } catch {
      // fd 可能在讀取當下關閉
    }
  }
  const tables = ["/proc/net/tcp", "/proc/net/tcp6"].map((path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return "";
    }
  });
  const remotes = [];
  for (const table of tables) {
    for (const line of table.split("\n").slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10 || !inodes.has(parts[9])) continue;
      remotes.push(parts[2]);
    }
  }
  return remotes;
}
