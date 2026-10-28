import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { project } from "../engine.js";

const root = fileURLToPath(new URL("..", import.meta.url));

test("頁面試算與引擎一致，且不呼叫官方 API", async () => {
  const server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port = await readPort(server);
  const profile = mkdtempSync(join(tmpdir(), "swiss-chrome-"));
  const chrome = spawn("google-chrome", [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=9341`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profile}`,
    "--window-size=1440,900",
    "about:blank",
  ], { stdio: "ignore" });

  const requests = [];
  const errors = [];
  let ws;
  try {
    await waitForHttp("http://127.0.0.1:9341/json/version");
    const targets = await fetch("http://127.0.0.1:9341/json/list").then((response) => response.json());
    const page = targets.find((target) => target.type === "page");
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await once(ws, "open");
    const session = new Cdp(ws, (message) => {
      if (message.method === "Network.requestWillBeSent") requests.push(message.params.request.url);
      if (message.method === "Runtime.exceptionThrown") {
        errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      }
    });
    await session.send("Network.enable");
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await session.send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    await waitFor(session, "document.querySelectorAll('.match').length === 30");

    const layout = await evaluate(session, `(() => {
      const wordmark = document.querySelector("#wordmark");
      const banner = document.querySelector("#banner");
      const match = document.querySelector(".match");
      const code = document.querySelector(".code");
      const seed = document.querySelector(".seed");
      const vs = document.querySelector(".vs");
      const cols = [...document.querySelectorAll(".col")].map((el) => {
        const box = el.getBoundingClientRect();
        return box.top + box.height / 2;
      });
      const style = getComputedStyle(banner);
      return {
        wordmark: wordmark.textContent,
        wordmarkHeight: wordmark.getBoundingClientRect().height,
        wordmarkCenter: wordmark.getBoundingClientRect().left + wordmark.getBoundingClientRect().width / 2,
        banner: banner.textContent,
        bannerColor: style.backgroundColor,
        bannerImage: style.backgroundImage,
        columns: document.querySelectorAll(".col").length,
        columnCenters: cols,
        matchHeight: match.getBoundingClientRect().height,
        codeSize: getComputedStyle(code).fontSize,
        codeFamily: getComputedStyle(code).fontFamily,
        seedSize: getComputedStyle(seed).fontSize,
        vsSize: getComputedStyle(vs).fontSize,
        vsWidth: vs.getBoundingClientRect().width,
        labels: [...document.querySelectorAll(".slot-label")].map((el) => el.textContent),
        advanceColor: getComputedStyle(document.querySelector(".slot.advance")).color,
        elimColor: getComputedStyle(document.querySelector(".slot.elim")).color,
        images: document.images.length,
        text: document.body.innerText,
        background: getComputedStyle(document.body).backgroundColor,
        officialWin: getComputedStyle(document.querySelector(".is-official-win .code")).color,
        officialLoss: getComputedStyle(document.querySelector(".is-official-loss")).opacity,
      };
    })()`);

    assert.match(layout.wordmark, /◆/);
    assert.match(layout.wordmark, /WORLDS 2026/);
    assert.ok(Math.abs(layout.wordmarkHeight - 152) <= 2, `wordmark ${layout.wordmarkHeight}`);
    assert.ok(Math.abs(layout.wordmarkCenter - 720) < 40, `center ${layout.wordmarkCenter}`);
    assert.match(layout.banner, /SWISS STAGE/);
    assert.match(layout.banner, /ROUND 4/);
    assert.match(layout.bannerImage, /linear-gradient/);
    assert.equal(layout.columns, 5);
    const centerSpread = Math.max(...layout.columnCenters) - Math.min(...layout.columnCenters);
    assert.ok(centerSpread < 2, `columns ${centerSpread}`);
    assert.equal(layout.text.includes("每 60 秒自動同步"), false);
    assert.ok(layout.matchHeight >= 54, `row ${layout.matchHeight}`);
    assert.equal(layout.codeSize, "24px");
    assert.match(layout.codeFamily, /Impact/);
    assert.equal(layout.seedSize, "11px");
    assert.equal(layout.vsSize, "20px");
    assert.ok(Math.abs(layout.vsWidth - 40) < 1, `vs ${layout.vsWidth}`);
    const places = layout.labels.join(" ");
    assert.match(places, /1ST\/2ND/);
    assert.match(places, /3RD\/4TH\/5TH/);
    assert.equal(layout.advanceColor, "rgb(25, 184, 240)");
    assert.equal(layout.elimColor, "rgb(224, 86, 107)");
    assert.equal(layout.images, 0);
    assert.equal(layout.text.includes("Round 1"), false);
    assert.equal(layout.text.includes("第 1 輪"), false);
    assert.equal(layout.text.includes("圖例"), false);
    assert.equal(layout.officialWin, "rgb(255, 255, 255)");
    assert.ok(Number(layout.officialLoss) < 0.5);
    assert.equal(layout.background, "rgb(7, 19, 56)");

    const initial = await domState(session);
    const snapshot = await evaluate(session, "fetch('/data/swiss-2026.json').then((response) => response.json())");
    assertView(initial, project(snapshot, []), snapshot);
    const winnersBefore = initial.matches.map((match) => match.winner);

    await evaluate(session, `document.querySelector('[data-team="T1"]').click()`);
    const opened = await domState(session);
    assert.deepEqual(opened.matches.map((match) => match.winner), winnersBefore);
    assert.equal(opened.panelHidden, false);
    const panelText = await evaluate(session, `document.querySelector("#panel").innerText`);
    assert.match(panelText, /再贏 1 場晉級、再輸 2 場淘汰/);
    assert.match(panelText, /勝 50% 晉級/);
    assert.match(panelText, /敗再勝 25% 晉級/);
    assert.match(panelText, /敗再敗 25% 淘汰/);
    assert.match(panelText, /官方/);
    assert.equal(documentPanels(panelText), 1);

    const clearHit = await evaluate(session, `(() => {
      const button = document.querySelector("#clear");
      button.scrollIntoView({ block: "center", inline: "center" });
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const panel = document.querySelector("#panel").getBoundingClientRect();
      return { id: hit && hit.id, buttonRight: box.right, panelLeft: panel.left };
    })()`);
    assert.equal(clearHit.id, "clear");
    assert.ok(clearHit.buttonRight <= clearHit.panelLeft, `clear ${clearHit.buttonRight} panel ${clearHit.panelLeft}`);

    await evaluate(session, `[...document.querySelectorAll(".path-btn")].find((button) => button.textContent.includes("敗再勝")).click()`);
    const applied = await domState(session);
    const actions = [{ type: "path", team: "T1", steps: ["L", "W"] }];
    assertView(applied, project(snapshot, actions), snapshot);
    assert.match(applied.trial, /真實剩 8 場/);
    assert.match(applied.round, /ROUND 4/);

    await evaluate(session, `document.querySelector('[data-action="cancel-path"]').click()`);
    const cancelled = await domState(session);
    assertView(cancelled, project(snapshot, [...actions, { type: "cancel-path", team: "T1" }]), snapshot);
    assert.match(cancelled.trial, /真實剩 9 場/);

    await evaluate(session, `[...document.querySelectorAll(".path-btn")].find((button) => button.textContent.includes("敗再勝")).click()`);
    const picks = await evaluate(session, `(() => {
      const rows = [...document.querySelectorAll(".match")].filter((row) => row.dataset.generated !== "1" && !row.dataset.winner);
      const chosen = rows.map((row) => ({
        id: row.dataset.matchId,
        winner: row.querySelector("[data-team]").dataset.team,
      }));
      for (const item of chosen) {
        document.querySelector('[data-match-id="' + item.id + '"] [data-team="' + item.winner + '"]').click();
        document.querySelector('.pick-btn[data-match="' + item.id + '"][data-winner="' + item.winner + '"]').click();
      }
      return chosen;
    })()`);
    const filledActions = [
      { type: "path", team: "T1", steps: ["L", "W"] },
      ...picks.map((pick) => ({
        type: "pick",
        team: pick.winner,
        matchId: pick.id,
        winner: pick.winner,
      })),
    ];
    const filled = await domState(session);
    assertView(filled, project(snapshot, filledActions), snapshot);
    assert.equal(filled.matches.some((match) => match.generated), true);
    assert.match(filled.round, /ROUND 4/);
    const t1 = filled.matches.find((match) => match.generated && match.teams.includes("T1"));
    assert.equal(t1.winner, "T1");
    const gold = await evaluate(session, `getComputedStyle(document.querySelector('[data-match-id="${t1.id}"] .is-trial-win .code')).color`);
    assert.equal(gold, "rgb(245, 192, 74)");
    const dashed = await evaluate(session, `(() => {
      const style = getComputedStyle(document.querySelector(".group.generated"));
      return { style: style.borderTopStyle, color: style.borderTopColor };
    })()`);
    assert.equal(dashed.style, "dashed");
    assert.equal(dashed.color, "rgb(245, 192, 74)");

    const swapTarget = filled.matches.find((match) => match.generated && !match.teams.includes("T1")).teams[0];
    await evaluate(session, `document.querySelector("#swap").click()`);
    const during = await evaluate(session, `(() => {
      document.querySelector('.match[data-generated="1"] [data-team="T1"]').click();
      const afterFirst = document.querySelector("#panel").hidden;
      document.querySelector('.match[data-generated="1"] [data-team="${swapTarget}"]').click();
      return { afterFirst, afterSecond: document.querySelector("#panel").hidden };
    })()`);
    assert.equal(during.afterFirst, true);
    assert.equal(during.afterSecond, true);
    const swappedActions = [...filledActions, { type: "swap", a: "T1", b: swapTarget }];
    const swapped = await domState(session);
    assertView(swapped, project(snapshot, swappedActions), snapshot);
    assert.notEqual(
      swapped.matches.find((match) => match.generated && match.teams.includes("T1")).id,
      t1.id,
    );

    await evaluate(session, `document.querySelector("#clear").click()`);
    const cleared = await domState(session);
    assertView(cleared, project(snapshot, [...swappedActions, { type: "clear" }]), snapshot);
    assert.equal(cleared.matches.some((match) => match.generated), false);
    assert.ok(cleared.advanced.includes("DK") && cleared.advanced.includes("GEN"));
    assert.ok(cleared.eliminated.includes("AL") && cleared.eliminated.includes("TSW"));
    assert.equal(errors.length, 0, errors.join("\n"));
    assert.equal(requests.some((url) => url.includes("esports-api") || url.includes("lolesports.com")), false);
  } finally {
    ws?.close();
    chrome.kill();
    server.kill();
    await Promise.allSettled([once(chrome, "exit"), once(server, "exit")]);
  }
});

function assertView(dom, view, snapshot) {
  const byId = new Map(view.matches.map((match) => [match.id, match]));
  assert.equal(dom.matches.length, view.matches.length);
  for (const match of dom.matches) {
    const expected = byId.get(match.id);
    assert.ok(expected, match.id);
    assert.equal(match.winner, expected.winner);
    assert.equal(match.source, expected.source);
    assert.equal(match.generated, expected.generated);
    assert.deepEqual([...match.teams].sort(), [expected.a, expected.b].sort());
  }
  const advanced = snapshot.teams.filter((team) => view.records[team.code].advanced).map((team) => team.code).sort();
  const eliminated = snapshot.teams.filter((team) => view.records[team.code].eliminated).map((team) => team.code).sort();
  assert.deepEqual([...dom.advanced].sort(), advanced);
  assert.deepEqual([...dom.eliminated].sort(), eliminated);
  assert.equal(dom.round, `ROUND ${view.officialRound}`);
  assert.match(dom.trial, /真實剩 \d+ 場/);
}

function documentPanels(text) {
  return text.includes("再贏 1 場晉級") ? 1 : 0;
}

async function domState(session) {
  return evaluate(session, `(() => ({
    round: document.querySelector("#banner-round").textContent,
    trial: document.querySelector("#trial-count").textContent.trim(),
    panelHidden: document.querySelector("#panel").hidden,
    advanced: [...document.querySelectorAll("[data-advanced]")].map((el) => el.dataset.advanced),
    eliminated: [...document.querySelectorAll("[data-eliminated]")].map((el) => el.dataset.eliminated),
    matches: [...document.querySelectorAll(".match")].map((row) => ({
      id: row.dataset.matchId,
      winner: row.dataset.winner || null,
      source: row.dataset.source || null,
      generated: row.dataset.generated === "1",
      teams: [...row.querySelectorAll("[data-team]")].map((button) => button.dataset.team),
    })),
  }))()`);
}

async function evaluate(session, expression) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(session, expression) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ready = await evaluate(session, expression);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`逾時：${expression}`);
}

async function waitForHttp(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Chrome 尚未開 debug port
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`無法連上 ${url}`);
}

function readPort(server) {
  let logs = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(logs || "伺服器沒有啟動")), 5000);
    server.stdout.on("data", (chunk) => {
      logs += chunk;
      const found = logs.match(/listening (\d+)/);
      if (!found) return;
      clearTimeout(timer);
      resolve(found[1]);
    });
    server.stderr.on("data", (chunk) => {
      logs += chunk;
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`伺服器結束 ${code}: ${logs}`));
    });
  });
}

class Cdp {
  constructor(ws, onEvent) {
    this.ws = ws;
    this.onEvent = onEvent;
    this.pending = new Map();
    this.nextId = 0;
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)(message);
        this.pending.delete(message.id);
        return;
      }
      this.onEvent(message);
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (message) => {
        if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
        else resolve(message.result);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}
