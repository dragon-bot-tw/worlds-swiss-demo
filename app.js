import { pathOdds, project } from "./engine.js";

const COLUMNS = [
  { records: ["0-0"] },
  { records: ["1-0", "0-1"] },
  { records: ["2-0", "1-1", "0-2"], elims: ["0-3"] },
  { advances: ["3-0"], records: ["2-1", "1-2"], elims: ["1-3"] },
  { advances: ["3-1", "3-2"], records: ["2-2"], elims: ["2-3"] },
];

const ADVANCE_LABEL = {
  "3-0": { label: "1ST/2ND", slots: 2 },
  "3-1": { label: "3RD/4TH/5TH", slots: 3 },
  "3-2": { label: "6TH/7TH/8TH", slots: 3 },
};

const ELIM_SLOTS = { "0-3": 2, "1-3": 3, "2-3": 3 };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const snapshot = await fetch("/data/swiss-2026.json").then((response) => {
  if (!response.ok) throw new Error("無法讀取快照");
  return response.json();
});

const teams = new Map(snapshot.teams.map((team) => [team.code, team]));
let actions = [];
let panelTeam = null;
let swapMode = false;
let swapPicks = [];

const bracket = document.querySelector("#bracket");
const panel = document.querySelector("#panel");
const fetched = document.querySelector("#fetched");
const trialCount = document.querySelector("#trial-count");
const bannerRound = document.querySelector("#banner-round");
const swapButton = document.querySelector("#swap");
const swapHint = document.querySelector("#swap-hint");

document.querySelector("#clear").addEventListener("click", () => {
  swapMode = false;
  swapPicks = [];
  dispatch({ type: "clear" });
});

swapButton.addEventListener("click", () => {
  if (swapButton.disabled) return;
  swapMode = !swapMode;
  swapPicks = [];
  if (swapMode) panelTeam = null;
  render();
});

bracket.addEventListener("click", (event) => {
  const side = event.target.closest("[data-team]");
  if (!side) return;
  const team = side.dataset.team;
  if (swapMode) {
    chooseSwap(team);
    return;
  }
  panelTeam = team;
  render();
});

panel.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.action === "close") {
    panelTeam = null;
    render();
    return;
  }
  if (button.dataset.action === "cancel-path") {
    dispatch({ type: "cancel-path", team: button.dataset.team });
    return;
  }
  if (button.dataset.action === "path") {
    dispatch({
      type: "path",
      team: button.dataset.team,
      steps: button.dataset.steps.split("").filter(Boolean),
    });
    return;
  }
  if (button.dataset.action === "pick") {
    dispatch({
      type: "pick",
      team: button.dataset.team,
      matchId: button.dataset.match,
      winner: button.dataset.winner,
    });
    return;
  }
  if (button.dataset.action === "undo") {
    dispatch({
      type: "undo-trial",
      team: button.dataset.team,
      matchId: button.dataset.match,
    });
  }
});

function dispatch(action) {
  actions = actions.concat(action);
  render();
}

function chooseSwap(team) {
  const state = project(snapshot, actions);
  const match = state.matches.find((item) => item.generated && (item.a === team || item.b === team));
  if (!match) return;
  if (swapPicks[0] === team) {
    swapPicks = [];
    render();
    return;
  }
  if (!swapPicks.length) {
    swapPicks = [team];
    render();
    return;
  }
  const first = swapPicks[0];
  const firstMatch = state.matches.find((item) => item.generated && (item.a === first || item.b === first));
  if (!firstMatch || firstMatch.entry !== match.entry || firstMatch.id === match.id) return;
  swapPicks = [];
  swapMode = false;
  dispatch({ type: "swap", a: first, b: team });
}

function render() {
  const state = project(snapshot, actions);
  fetched.textContent = `資料更新：${formatTime(state.fetchedAt)}`;
  trialCount.textContent = `真實剩 ${remainingMatches(state)} 場，點未打比賽的隊伍即可判勝`;
  bannerRound.textContent = `ROUND ${state.officialRound}`;
  const generated = state.matches.some((match) => match.generated);
  swapButton.disabled = !generated;
  swapButton.classList.toggle("active", swapMode);
  swapHint.hidden = !swapMode;
  bracket.replaceChildren(renderBracket(state));
  panel.hidden = !panelTeam;
  document.body.classList.toggle("panel-open", Boolean(panelTeam));
  if (!panelTeam) {
    panel.replaceChildren();
    return;
  }
  panel.replaceChildren(renderPanel(state, panelTeam));
}

function renderBracket(state) {
  const funnel = document.createElement("div");
  funnel.className = "funnel";
  for (const columnSpec of COLUMNS) {
    const column = document.createElement("section");
    column.className = "col";
    column.dataset.col = columnSpec.records.join(" ");
    for (const key of columnSpec.advances || []) {
      const advance = renderAdvance(state, key);
      if (advance) column.append(advance);
    }
    for (const record of columnSpec.records) {
      const matches = ordered(record, state.matches.filter((item) => item.entry === record));
      if (!matches.length && record === "2-2") column.append(renderUndrawn(state));
      else if (matches.length) column.append(renderGroup(state, record, matches));
    }
    for (const key of columnSpec.elims || []) {
      const eliminated = renderElim(state, key);
      if (eliminated) column.append(eliminated);
    }
    const unpaired = state.unpaired.find((pool) => columnSpec.records.includes(pool.record) && pool.record !== "2-2");
    if (unpaired) {
      const note = document.createElement("p");
      note.className = "unpaired";
      note.textContent = "無法配對";
      column.append(note);
    }
    if (columnSpec.records.includes("2-2") && state.matches.some((match) => match.generated)) {
      column.classList.add("generated");
    }
    funnel.append(column);
  }
  return funnel;
}

function renderGroup(state, record, matches) {
  const group = document.createElement("div");
  group.className = "group";
  group.dataset.record = record;
  if (matches.some((match) => match.generated)) group.classList.add("generated");
  const bo = ["2-0", "0-2", "2-1", "1-2", "2-2"].includes(record) ? "BO3" : "BO1";
  const dated = record === "2-1" || record === "1-2"
    ? state.matches.filter((match) => match.entry === "2-1" || match.entry === "1-2")
    : matches;
  group.append(renderHead(`${dateLabel(dated)} - ${bo}`, `(${record})`));
  for (const match of matches) group.append(renderMatch(state, match));
  return group;
}

function renderUndrawn(state) {
  const wrap = document.createElement("div");
  const group = document.createElement("div");
  group.className = "group";
  group.dataset.record = "2-2";
  group.append(renderHead("TBD - BO3", "(2-2)"));
  for (let index = 0; index < 3; index += 1) {
    const row = document.createElement("div");
    row.className = "ghost";
    const vs = document.createElement("div");
    vs.className = "vs";
    vs.textContent = "VS";
    row.append(vs);
    group.append(row);
  }
  wrap.append(group);
  const pending = state.matches.filter((match) => !match.winner && match.entry !== "2-2").length;
  const odd = state.unpaired.find((pool) => pool.record === "2-2");
  const note = document.createElement("p");
  note.className = "unpaired";
  note.textContent = odd ? "無法配對" : `前面還有 ${pending} 場未決定，無法抽籤`;
  wrap.append(note);
  return wrap;
}

function renderHead(left, right) {
  const head = document.createElement("div");
  head.className = "group-head";
  const title = document.createElement("span");
  title.textContent = left;
  const record = document.createElement("span");
  record.textContent = right;
  head.append(title, record);
  return head;
}

function renderMatch(state, match) {
  const row = document.createElement("div");
  row.className = "match";
  row.dataset.matchId = match.id;
  row.dataset.winner = match.winner || "";
  row.dataset.source = match.source || "";
  row.dataset.generated = match.generated ? "1" : "0";
  row.append(renderSide(state, match, match.a, "left"), renderVs(), renderSide(state, match, match.b, "right"));
  return row;
}

function renderSide(state, match, code, align) {
  const team = teams.get(code);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `side ${align}`;
  button.dataset.team = code;
  if (swapPicks.includes(code)) button.classList.add("swap-selected");
  if (match.winner) {
    const trial = match.source === "trial";
    button.classList.add(match.winner === code
      ? (trial ? "is-trial-win" : "is-official-win")
      : (trial ? "is-trial-loss" : "is-official-loss"));
  }
  const seed = document.createElement("span");
  seed.className = "seed";
  seed.textContent = `${team.region} #${team.seed}`;
  const name = document.createElement("span");
  name.className = "code";
  name.textContent = code;
  button.append(seed, name);
  return button;
}

function renderVs() {
  const vs = document.createElement("div");
  vs.className = "vs";
  vs.textContent = "VS";
  return vs;
}

function renderAdvance(state, key) {
  const spec = ADVANCE_LABEL[key];
  const [wins, losses] = key.split("-").map(Number);
  const names = snapshot.teams
    .filter((team) => state.records[team.code].wins === wins && state.records[team.code].losses === losses)
    .map((team) => team.code);
  if (!names.length && key === "3-2") return null;
  const slot = document.createElement("div");
  slot.className = "slot advance";
  slot.dataset.label = spec.label;
  const label = document.createElement("div");
  label.className = "slot-label";
  const caption = document.createElement("span");
  caption.textContent = "ADVANCES";
  const place = document.createElement("span");
  place.textContent = spec.label;
  label.append(caption, place);
  slot.append(label, renderSlots(names, spec.slots, "advanced"));
  return slot;
}

function renderElim(state, key) {
  const [wins, losses] = key.split("-").map(Number);
  const names = snapshot.teams
    .filter((team) => state.records[team.code].wins === wins && state.records[team.code].losses === losses)
    .map((team) => team.code);
  if (!names.length && key === "2-3") return null;
  const slot = document.createElement("div");
  slot.className = "slot elim";
  const label = document.createElement("div");
  label.className = "elim-label";
  const caption = document.createElement("span");
  caption.textContent = "ELIMINATED";
  const place = document.createElement("span");
  place.textContent = key;
  label.append(caption, place);
  slot.append(label, renderSlots(names, ELIM_SLOTS[key], "eliminated"));
  return slot;
}

function renderSlots(names, slots, dataset) {
  const row = document.createElement("div");
  row.className = "slot-teams";
  for (let index = 0; index < slots; index += 1) {
    if (index) {
      const slash = document.createElement("span");
      slash.className = "slash";
      slash.textContent = "/";
      row.append(slash);
    }
    const chip = document.createElement("span");
    if (names[index]) {
      chip.dataset[dataset] = names[index];
      chip.textContent = names[index];
    }
    row.append(chip);
  }
  return row;
}

function dateLabel(matches) {
  const days = [...new Set(matches.map((match) => pacificDay(match.startTime)))].sort();
  const part = (day) => {
    const [, month, date] = day.split("-").map(Number);
    return `${MONTHS[month - 1]}. ${date}`;
  };
  if (days.length === 1) return part(days[0]);
  const [, monthA, dateA] = days[0].split("-").map(Number);
  const [, monthB, dateB] = days[days.length - 1].split("-").map(Number);
  if (monthA === monthB && days.length === 2) return `${MONTHS[monthA - 1]}. ${dateA} & ${dateB}`;
  if (monthA === monthB) return `${MONTHS[monthA - 1]}. ${dateA}-${dateB}`;
  return `${part(days[0])}-${part(days[days.length - 1])}`;
}

function byStart(a, b) {
  return a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id);
}

function ordered(record, matches) {
  const list = [...matches].sort(byStart);
  const shown = (match) => {
    const pair = [match.a, match.b].sort().join("-");
    const keepOrder = pair === "MKOI-T1" || pair === "LOS-TLAW";
    if ((record === "2-1" || record === "1-2") && !keepOrder) {
      return { ...match, a: match.b, b: match.a };
    }
    return match;
  };
  if (record === "2-1") return list.reverse().map(shown);
  if (record === "1-2") return list.map(shown);
  return list;
}

function pacificDay(iso) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function remainingMatches(state) {
  const open = state.matches.filter((match) => !match.winner).length;
  const fifth = state.matches.some((match) => match.entry === "2-2");
  return fifth ? open : open + 3;
}

function renderPanel(state, code) {
  const team = teams.get(code);
  const standing = state.records[code];
  const root = document.createElement("div");
  const head = document.createElement("div");
  head.className = "panel-head";
  const title = document.createElement("h2");
  title.textContent = code;
  const close = document.createElement("button");
  close.type = "button";
  close.dataset.action = "close";
  close.textContent = "關閉";
  head.append(title, close);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `${team.name} · ${team.region} ${team.seed} · ${standing.wins} 勝 ${standing.losses} 敗`;

  const distance = document.createElement("p");
  distance.className = "distance";
  if (standing.advanced) {
    distance.textContent = "已晉級";
    distance.classList.add("advanced");
  } else if (standing.eliminated) {
    distance.textContent = "已淘汰";
    distance.classList.add("eliminated");
  } else {
    distance.textContent = `再贏 ${3 - standing.wins} 場晉級、再輸 ${3 - standing.losses} 場淘汰`;
  }

  root.append(head, meta, distance);
  if (state.overridden.includes(code)) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "此走向已被較晚的試算蓋過";
    root.append(note);
  }
  if (state.queues[code]?.length) {
    const queued = document.createElement("p");
    queued.className = "note";
    queued.textContent = `待走：${state.queues[code].map((step) => (step === "W" ? "勝" : "敗")).join("再")}`;
    root.append(queued);
  }

  const history = document.createElement("ul");
  history.className = "history";
  const mine = state.matches.filter((match) => match.a === code || match.b === code);
  const undecided = mine.find((match) => !match.winner && match.source !== "official");
  for (const match of mine) {
    const item = document.createElement("li");
    const opponent = match.a === code ? match.b : match.a;
    const line = document.createElement("div");
    line.textContent = `vs ${opponent} · ${resultLabel(match, code)}`;
    item.append(line);
    if (match.source !== "official" && (match === undecided || match.source === "trial")) {
      item.append(renderWinnerButtons(state, match, code));
    }
    history.append(item);
  }
  root.append(history, renderPaths(state, code, standing));
  return root;
}

function renderWinnerButtons(state, match, code) {
  const row = document.createElement("div");
  row.className = "winner-row";
  for (const side of [match.a, match.b]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pick-btn";
    button.textContent = `${side} 勝`;
    const selected = match.winner === side && match.source === "trial";
    if (selected) button.classList.add("selected");
    if (selected && match.cause?.team === code) {
      button.dataset.action = "undo";
      button.dataset.team = code;
      button.dataset.match = match.id;
    } else {
      button.dataset.action = "pick";
      button.dataset.team = code;
      button.dataset.match = match.id;
      button.dataset.winner = side;
    }
    row.append(button);
  }
  return row;
}

function renderPaths(state, code, standing) {
  const wrap = document.createElement("div");
  wrap.className = "paths";
  const active = state.paths[code] || null;
  const activeKey = active ? active.join("") : "";
  const odds = pathOdds(standing.wins, standing.losses);
  const shown = new Set(odds.map((item) => item.steps.join("")));
  if (active && !shown.has(activeKey)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "path-btn active";
    button.dataset.action = "cancel-path";
    button.dataset.team = code;
    button.textContent = `已套用 ${active.map((step) => (step === "W" ? "勝" : "敗")).join("再")}`;
    wrap.append(button);
  }
  for (const item of odds) {
    const key = item.steps.join("");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "path-btn";
    if (key === activeKey) button.classList.add("active");
    button.dataset.team = code;
    if (key === activeKey) button.dataset.action = "cancel-path";
    else {
      button.dataset.action = "path";
      button.dataset.steps = key;
    }
    button.textContent = pathLabel(item);
    wrap.append(button);
  }
  return wrap;
}

function pathLabel(item) {
  const chain = item.steps.map((step) => (step === "W" ? "勝" : "敗")).join("再");
  const end = item.result === "advance" ? "晉級" : "淘汰";
  return `${chain} ${Math.round(item.p * 100)}% ${end}`;
}

function resultLabel(match, code) {
  if (!match.winner) return "未定";
  const outcome = match.winner === code ? "勝" : "敗";
  const via = match.source === "official" ? "官方" : "試算";
  return `${outcome} · ${via}`;
}

function formatTime(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

render();
