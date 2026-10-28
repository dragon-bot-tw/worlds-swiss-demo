import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pairPool, pathOdds, project } from "../engine.js";

const snapshot = JSON.parse(readFileSync(new URL("../data/swiss-2026.json", import.meta.url), "utf8"));

const expected = {
  DK: [3, 0],
  GEN: [3, 0],
  AL: [0, 3],
  TSW: [0, 3],
  MKOI: [2, 1],
  LYON: [2, 1],
  IG: [2, 1],
  TES: [2, 1],
  T1: [2, 1],
  BLG: [2, 1],
  HLE: [1, 2],
  G2: [1, 2],
  CFO: [1, 2],
  KC: [1, 2],
  LOS: [1, 2],
  TLAW: [1, 2],
};

function pairOf(match) {
  const left = match.a || match.teams[0];
  const right = match.b || match.teams[1];
  return [left, right].sort().join("|");
}

function openRound(actions = []) {
  return snapshot.matches.filter((match) => !match.winner);
}

test("快照戰績：DK、GEN 晉級，AL、TSW 淘汰", () => {
  const view = project(snapshot, []);
  for (const [code, [wins, losses]] of Object.entries(expected)) {
    assert.deepEqual([view.records[code].wins, view.records[code].losses], [wins, losses], code);
  }
  assert.equal(view.records.DK.advanced, true);
  assert.equal(view.records.GEN.advanced, true);
  assert.equal(view.records.AL.eliminated, true);
  assert.equal(view.records.TSW.eliminated, true);
  assert.equal(view.officialRound, 4);
  assert.equal(view.trialCount, 0);
});

test("Bo3 的 2 比 1 只記一場系列賽", () => {
  const mini = {
    fetchedAt: "2026-10-28T00:00:00Z",
    teams: [
      { code: "A", name: "A", region: "LCK", seed: 1 },
      { code: "B", name: "B", region: "LPL", seed: 1 },
    ],
    matches: [{
      id: "bo3",
      startTime: "2026-10-25T19:00:00Z",
      teams: ["A", "B"],
      winner: "A",
      gameWins: [2, 1],
    }],
  };
  const view = project(mini, []);
  assert.deepEqual([view.records.A.wins, view.records.A.losses], [1, 0]);
  assert.deepEqual([view.records.B.wins, view.records.B.losses], [0, 1]);
  assert.equal(view.records.A.advanced, false);
});

test("同池配對可重現，且先少重賽再少同賽區", () => {
  const regions = new Map([
    ["A", "LCK"],
    ["B", "LCK"],
    ["C", "LPL"],
    ["D", "LPL"],
  ]);
  const forced = new Set(["A|C", "A|D", "B|C", "B|D"]);
  const first = pairPool(["D", "B", "C", "A"], { rematches: forced, regions });
  const second = pairPool(["A", "B", "C", "D"], { rematches: forced, regions });
  assert.deepEqual(first, second);
  assert.deepEqual(first.pairs, [["A", "B"], ["C", "D"]]);

  const spread = new Map([["A", "1"], ["B", "2"], ["C", "3"], ["D", "4"]]);
  const lexical = pairPool(["D", "A", "C", "B"], { rematches: new Set(), regions: spread });
  assert.deepEqual(lexical.pairs, [["A", "B"], ["C", "D"]]);
  assert.deepEqual(pairPool(["A", "B", "C"], { rematches: new Set(), regions: spread }), {
    pairs: [],
    unpaired: true,
  });
});

test("奇數池不配對", () => {
  const mini = {
    fetchedAt: "2026-10-28T00:00:00Z",
    teams: ["A", "B", "C"].map((code, index) => ({
      code,
      name: code,
      region: ["LCK", "LPL", "LEC"][index],
      seed: 1,
    })),
    matches: [],
  };
  const view = project(mini, []);
  assert.equal(view.matches.length, 0);
  assert.equal(view.unpaired.length, 1);
  assert.equal(view.unpaired[0].record, "0-0");
});

test("第四輪官方對戰不被重配", () => {
  const actions = openRound().map((match) => ({
    type: "pick",
    team: match.teams[0],
    matchId: match.id,
    winner: match.teams[0],
  }));
  const once = project(snapshot, actions);
  const twice = project(snapshot, actions);
  assert.equal(JSON.stringify(once), JSON.stringify(twice));
  const official = new Set(snapshot.matches.map(pairOf));
  const kept = once.matches.filter((match) => !match.generated);
  assert.equal(kept.length, snapshot.matches.length);
  assert.deepEqual(new Set(kept.map(pairOf)), official);
  assert.ok(once.matches.some((match) => match.generated && match.entry === "2-2"));
  assert.equal(once.officialRound, 4);
});

test("T1 敗再勝只先寫第四輪，第五輪配出後自動寫入", () => {
  const round = openRound();
  const current = round.find((match) => match.teams.includes("T1"));
  const opponent = current.teams.find((code) => code !== "T1");
  const only = project(snapshot, [{ type: "path", team: "T1", steps: ["L", "W"] }]);
  const trials = only.matches.filter((match) => match.source === "trial");
  assert.equal(trials.length, 1);
  assert.equal(trials[0].id, current.id);
  assert.equal(trials[0].winner, opponent);
  assert.equal(only.matches.some((match) => match.generated), false);
  assert.deepEqual(only.queues.T1, ["W"]);
  assert.equal(only.trialCount, 1);
  assert.equal(pathOdds(only.records.T1.wins, only.records.T1.losses).length, 2);

  const actions = [{ type: "path", team: "T1", steps: ["L", "W"] }];
  for (const match of round) {
    if (match.id === current.id) continue;
    actions.push({ type: "pick", team: match.teams[0], matchId: match.id, winner: match.teams[0] });
  }
  const next = project(snapshot, actions);
  const fifth = next.matches.find((match) => match.generated && (match.a === "T1" || match.b === "T1"));
  assert.ok(fifth);
  assert.equal(fifth.winner, "T1");
  const others = next.matches.filter((match) => match.generated && match !== fifth);
  assert.ok(others.length >= 1);
  assert.ok(others.every((match) => !match.winner));
  assert.equal(next.officialRound, 4);
  assert.deepEqual(pathOdds(2, 1).map((item) => [item.steps.join(""), item.p, item.result]), [
    ["W", 0.5, "advance"],
    ["LW", 0.25, "advance"],
    ["LL", 0.25, "eliminate"],
  ]);
});

test("較晚走向蓋過較早佇列", () => {
  const mini = {
    fetchedAt: "2026-10-28T00:00:00Z",
    teams: [
      { code: "A", name: "A", region: "LCK", seed: 1 },
      { code: "B", name: "B", region: "LPL", seed: 1 },
    ],
    matches: [],
  };
  const view = project(mini, [
    { type: "path", team: "A", steps: ["W", "W"] },
    { type: "path", team: "B", steps: ["W", "W"] },
  ]);
  assert.equal(view.matches.length, 1);
  assert.equal(view.matches[0].winner, "B");
  assert.deepEqual(view.overridden, ["A"]);
  assert.equal(view.queues.A, undefined);
  assert.deepEqual(view.queues.B, ["W"]);
});

test("手動判勝清掉剩餘步驟，對調跟著隊伍，清除只留快照", () => {
  const round = openRound();
  const current = round.find((match) => match.teams.includes("T1"));
  const opponent = current.teams.find((code) => code !== "T1");
  const base = [{ type: "path", team: "T1", steps: ["L", "W"] }];
  for (const match of round) {
    if (match.id === current.id) continue;
    base.push({ type: "pick", team: match.teams[0], matchId: match.id, winner: match.teams[1] });
  }
  const picked = project(snapshot, [
    ...base.slice(0, 1),
    { type: "pick", team: "T1", matchId: current.id, winner: opponent },
    ...base.slice(1),
  ]);
  const fifth = picked.matches.find((match) => match.generated && (match.a === "T1" || match.b === "T1"));
  assert.ok(fifth);
  assert.equal(fifth.winner, null);
  assert.equal(picked.queues.T1, undefined);
  assert.equal(picked.matches.find((match) => match.id === current.id).winner, opponent);

  const filled = project(snapshot, base);
  const t1match = filled.matches.find((match) => match.generated && (match.a === "T1" || match.b === "T1"));
  assert.equal(t1match.winner, "T1");
  const pool = filled.matches.filter((match) => match.generated && match.entry === t1match.entry);
  const other = pool.find((match) => match !== t1match);
  const swapTeam = other.a;
  const swapped = project(snapshot, [...base, { type: "swap", a: "T1", b: swapTeam }]);
  const moved = swapped.matches.find((match) => match.generated && (match.a === "T1" || match.b === "T1"));
  assert.equal(moved.winner, "T1");
  assert.notEqual(pairOf(moved), pairOf(t1match));

  const cleared = project(snapshot, [...base, { type: "swap", a: "T1", b: swapTeam }, { type: "clear" }]);
  const fresh = project(snapshot, []);
  assert.equal(JSON.stringify(cleared), JSON.stringify(fresh));
  assert.equal(cleared.records.DK.advanced, true);
  assert.equal(cleared.records.GEN.advanced, true);
  assert.equal(cleared.records.AL.eliminated, true);
  assert.equal(cleared.records.TSW.eliminated, true);
  assert.ok(cleared.matches.filter((match) => !match.winner).length >= 6);
  assert.equal(cleared.matches.some((match) => match.generated), false);
});

test("取消試算不會把剩餘步驟寫回", () => {
  const current = openRound().find((match) => match.teams.includes("T1"));
  const undone = project(snapshot, [
    { type: "path", team: "T1", steps: ["L", "W"] },
    { type: "undo-trial", team: "T1", matchId: current.id },
  ]);
  assert.equal(undone.matches.find((match) => match.id === current.id).winner, null);
  assert.equal(undone.trialCount, 0);
  assert.equal(undone.queues.T1, undefined);
  assert.equal(undone.matches.some((match) => match.generated), false);

  const again = project(snapshot, [
    { type: "path", team: "T1", steps: ["L", "W"] },
    { type: "undo-trial", team: "T1", matchId: current.id },
  ]);
  assert.equal(JSON.stringify(undone), JSON.stringify(again));
});

test("已完成場次不能改寫勝者", () => {
  const done = snapshot.matches.find((match) => match.winner === "DK");
  const view = project(snapshot, [{
    type: "pick",
    team: "DK",
    matchId: done.id,
    winner: done.teams.find((code) => code !== "DK"),
  }]);
  assert.equal(view.matches.find((match) => match.id === done.id).winner, "DK");
  assert.equal(view.matches.find((match) => match.id === done.id).source, "official");
});
