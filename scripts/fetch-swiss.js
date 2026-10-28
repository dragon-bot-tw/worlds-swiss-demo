import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KEY_ENV = "LOL_ESPORTS_API_KEY";
const ENDPOINT =
  "https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=zh-TW&leagueId=98767975604431411";

const REGIONS = [
  ["LCK", ["GEN", "HLE", "T1", "DK"]],
  ["LPL", ["AL", "BLG", "TES", "IG"]],
  ["LEC", ["G2", "MKOI", "KC"]],
  ["LCS", ["TLAW", "LYON"]],
  ["LCP", ["TSW", "CFO"]],
  ["CBLOL", ["LOS"]],
];

const root = fileURLToPath(new URL("..", import.meta.url));
const outPath = join(root, "data", "swiss-2026.json");

const known = new Map();
for (const [region, codes] of REGIONS) {
  codes.forEach((code, index) => {
    known.set(code, { region, seed: index + 1 });
  });
}

const key = process.env[KEY_ENV];
if (!key) {
  console.error(`缺少環境變數 ${KEY_ENV}`);
  process.exit(1);
}

const response = await fetch(ENDPOINT, { headers: { "x-api-key": key } });
if (!response.ok) {
  console.error(`賽程請求失敗：HTTP ${response.status}`);
  process.exit(1);
}

const body = await response.json();
const events = body?.data?.schedule?.events;
if (!Array.isArray(events)) {
  console.error("賽程回應缺少 events");
  process.exit(1);
}

const names = new Map();
const matches = [];

for (const event of events) {
  if (event.blockName !== "瑞士制循環賽") continue;
  if (!String(event.startTime || "").startsWith("2026")) continue;
  const sides = event.match?.teams ?? [];
  if (sides.length !== 2) continue;
  const codes = sides.map((side) => side.code);
  const [left, right] = codes;
  if (!known.has(left) || !known.has(right)) {
    const unknown = codes.filter((code) => code !== "TBD" && !known.has(code));
    if (unknown.length) {
      console.error(`未知隊伍代碼：${unknown.join(", ")}`);
      process.exit(1);
    }
    continue;
  }
  for (const side of sides) names.set(side.code, side.name);
  const winnerSide = sides.find((side) => side.result?.outcome === "win");
  matches.push({
    id: String(event.match.id),
    startTime: event.startTime,
    teams: [left, right],
    winner: winnerSide ? winnerSide.code : null,
  });
}

matches.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));

const teams = [];
for (const [region, codes] of REGIONS) {
  for (const code of codes) {
    teams.push({
      code,
      name: names.get(code) || code,
      region,
      seed: known.get(code).seed,
    });
  }
}

const snapshot = {
  fetchedAt: new Date().toISOString(),
  teams,
  matches,
};

const text = `${JSON.stringify(snapshot, null, 2)}\n`;
if (text.includes(key)) {
  console.error("快照含有 API key，已中止寫入");
  process.exit(1);
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, text);
console.log(`已寫入 ${matches.length} 場至 data/swiss-2026.json`);
