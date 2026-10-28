import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const snapshot = JSON.parse(readFileSync(new URL("../data/swiss-2026.json", import.meta.url), "utf8"));
const script = readFileSync(new URL("../scripts/fetch-swiss.js", import.meta.url), "utf8");

test("抓取腳本只從環境變數讀 API key", () => {
  assert.match(script, /LOL_ESPORTS_API_KEY/);
  assert.match(script, /process\.env\[KEY_ENV\]/);
  assert.equal(script.includes("x-api-key: \""), false);
  assert.equal(script.includes("x-api-key: '"), false);
});

test("快照只留 2026 瑞士輪實際對戰", () => {
  assert.ok(snapshot.fetchedAt);
  assert.equal(snapshot.teams.length, 16);
  assert.equal(JSON.stringify(snapshot).includes("\"record\""), false);
  assert.equal(JSON.stringify(snapshot).includes("TBD"), false);
  for (const team of snapshot.teams) {
    assert.ok(team.code && team.name && team.region && team.seed);
  }
  assert.ok(snapshot.matches.length > 0);
  for (const match of snapshot.matches) {
    assert.equal(match.startTime.startsWith("2026"), true);
    assert.equal(match.teams.length, 2);
    assert.equal(match.teams.includes("TBD"), false);
    assert.ok(match.id);
    if (match.winner) assert.equal(match.teams.includes(match.winner), true);
  }
  assert.equal(snapshot.matches.filter((match) => !match.winner).length, 6);
});
