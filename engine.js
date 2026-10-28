export function project(snapshot, actions = []) {
  let intents = emptyIntents();
  for (const action of actions) {
    const current = decorate(snapshot, intents, settle(snapshot, intents));
    intents = reduce(intents, action, current);
  }
  return decorate(snapshot, intents, settle(snapshot, intents));
}

export function pathOdds(wins, losses) {
  if (wins >= 3 || losses >= 3) return [];
  const paths = [];
  const walk = (w, l, steps, probability) => {
    if (w >= 3) {
      paths.push({ steps: [...steps], p: probability, result: "advance" });
      return;
    }
    if (l >= 3) {
      paths.push({ steps: [...steps], p: probability, result: "eliminate" });
      return;
    }
    walk(w + 1, l, [...steps, "W"], probability * 0.5);
    walk(w, l + 1, [...steps, "L"], probability * 0.5);
  };
  walk(wins, losses, [], 1);
  return paths;
}

export function pairPool(teamCodes, { rematches, regions }) {
  const teams = [...teamCodes].sort();
  if (teams.length === 0) return { pairs: [], unpaired: false };
  if (teams.length % 2 === 1) return { pairs: [], unpaired: true };

  let best = null;
  for (const pairs of enumerate(teams)) {
    let rematch = 0;
    let same = 0;
    for (const [a, b] of pairs) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (rematches.has(key)) rematch += 1;
      if (regions.get(a) && regions.get(a) === regions.get(b)) same += 1;
    }
    const candidate = {
      rematch,
      same,
      key: pairs.map((pair) => pair.join("|")).join(","),
      pairs,
    };
    if (!best || compareMatching(candidate, best) < 0) best = candidate;
  }
  return { pairs: best.pairs, unpaired: false };
}

function compareMatching(candidate, best) {
  if (candidate.rematch !== best.rematch) return candidate.rematch - best.rematch;
  if (candidate.same !== best.same) return candidate.same - best.same;
  if (candidate.key < best.key) return -1;
  if (candidate.key > best.key) return 1;
  return 0;
}

function enumerate(teams) {
  if (teams.length === 0) return [[]];
  const [first, ...rest] = teams;
  const matchings = [];
  for (let index = 0; index < rest.length; index += 1) {
    const partner = rest[index];
    const remaining = rest.filter((_, item) => item !== index);
    const pair = first < partner ? [first, partner] : [partner, first];
    for (const tail of enumerate(remaining)) {
      matchings.push(
        [pair, ...tail].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
      );
    }
  }
  return matchings;
}

function emptyIntents() {
  return { seq: 0, paths: new Map(), picks: new Map(), swaps: [] };
}

function cloneIntents(intents) {
  return {
    seq: intents.seq,
    paths: new Map(
      [...intents.paths].map(([team, path]) => [team, { steps: [...path.steps], seq: path.seq }]),
    ),
    picks: new Map([...intents.picks].map(([id, pick]) => [id, { ...pick }])),
    swaps: intents.swaps.map((swap) => ({ ...swap })),
  };
}

function reduce(intents, action, view) {
  if (!action || action.type === "clear") return emptyIntents();
  const next = cloneIntents(intents);
  next.seq += 1;

  if (action.type === "path") {
    const steps = (action.steps || []).filter((step) => step === "W" || step === "L");
    if (steps.length) next.paths.set(action.team, { steps, seq: next.seq });
    else next.paths.delete(action.team);
    for (const [id, pick] of next.picks) {
      if (pick.team === action.team) next.picks.delete(id);
    }
    return next;
  }

  if (action.type === "cancel-path") {
    next.paths.delete(action.team);
    return next;
  }

  if (action.type === "pick") {
    const match = view.matches.find((item) => item.id === action.matchId);
    if (!match || match.source === "official") return intents;
    if (action.winner !== match.a && action.winner !== match.b) return intents;
    const path = next.paths.get(action.team);
    if (path) {
      const keep = stepsToKeep(view, action.team, match);
      if (keep > 0) next.paths.set(action.team, { steps: path.steps.slice(0, keep), seq: path.seq });
      else next.paths.delete(action.team);
    }
    next.picks.set(action.matchId, {
      winner: action.winner,
      team: action.team,
      seq: next.seq,
    });
    return next;
  }

  if (action.type === "undo-trial") {
    const match = view.matches.find((item) => item.id === action.matchId);
    if (!match || match.source !== "trial" || match.cause?.team !== action.team) return intents;
    if (match.cause.kind === "path") {
      const path = next.paths.get(action.team);
      const kept = path ? path.steps.slice(0, match.cause.stepIndex) : [];
      if (kept.length) next.paths.set(action.team, { steps: kept, seq: path.seq });
      else next.paths.delete(action.team);
      return next;
    }
    if (match.cause.kind === "pick") {
      next.picks.delete(action.matchId);
      return next;
    }
    return intents;
  }

  if (action.type === "swap") {
    if (!action.a || !action.b || action.a === action.b) return intents;
    next.swaps.push({ a: action.a, b: action.b, seq: next.seq });
    return next;
  }

  return intents;
}

function stepsToKeep(view, team, match) {
  if (match.cause?.kind === "path" && match.cause.team === team) return match.cause.stepIndex;
  return view.matches.filter((item) => item.cause?.kind === "path" && item.cause.team === team).length;
}

function settle(snapshot, intents) {
  const queues = new Map();
  for (const [team, path] of intents.paths) {
    queues.set(team, path.steps.map((step) => ({ step, seq: path.seq })));
  }
  const overridden = new Set();
  const matches = snapshot.matches.map((match) => ({
    id: String(match.id),
    a: match.teams[0],
    b: match.teams[1],
    startTime: match.startTime,
    winner: match.winner || null,
    source: match.winner ? "official" : null,
    generated: false,
    pool: null,
    cause: null,
  }));

  for (let guard = 0; guard < 12; guard += 1) {
    let changed = false;
    const open = matches.filter((match) => !match.winner).sort(byTime);
    for (const match of open) {
      const decision = decide(match, queues, intents.picks, intents.paths, overridden);
      if (!decision) continue;
      match.winner = decision.winner;
      match.source = "trial";
      match.cause = decision.cause;
      changed = true;
    }
    if (addGenerated(matches, snapshot, intents.swaps)) changed = true;
    if (!changed) break;
  }

  const queuesLeft = {};
  for (const [team, queue] of queues) {
    if (queue.length) queuesLeft[team] = queue.map((item) => item.step);
  }

  return {
    matches,
    queues: queuesLeft,
    overridden: [...overridden].sort(),
    unpaired: findUnpaired(matches, snapshot),
  };
}

function decide(match, queues, picks, paths, overridden) {
  const options = [];
  const pick = picks.get(match.id);
  if (pick && (pick.winner === match.a || pick.winner === match.b)) {
    options.push({
      kind: "pick",
      team: pick.team,
      winner: pick.winner,
      seq: pick.seq,
      cause: { kind: "pick", team: pick.team, seq: pick.seq },
    });
  }

  for (const team of [match.a, match.b]) {
    if (overridden.has(team)) continue;
    const queue = queues.get(team);
    const path = paths.get(team);
    if (!queue?.length || !path) continue;
    const step = queue[0];
    const opponent = team === match.a ? match.b : match.a;
    options.push({
      kind: "path",
      team,
      winner: step.step === "W" ? team : opponent,
      seq: step.seq,
      cause: {
        kind: "path",
        team,
        stepIndex: path.steps.length - queue.length,
        seq: step.seq,
      },
    });
  }

  if (!options.length) return null;
  const top = options.reduce((best, option) => (option.seq >= best.seq ? option : best));
  const agreed = new Set(options.map((option) => option.winner)).size === 1;

  if (agreed) {
    for (const option of options) {
      if (option.kind === "path") queues.get(option.team).shift();
    }
  } else {
    for (const option of options) {
      if (option.kind !== "path") continue;
      if (top.kind === "path" && option.team === top.team) queues.get(option.team).shift();
      else {
        queues.set(option.team, []);
        overridden.add(option.team);
      }
    }
  }

  return { winner: top.winner, cause: top.cause };
}

function addGenerated(matches, snapshot, swaps) {
  let added = false;
  for (const pool of readyPools(matches, snapshot)) {
    if (pool.teams.length % 2 === 1) continue;
    if (matches.some((match) => match.generated && match.pool === pool.record)) continue;
    const paired = pairPool(pool.teams, {
      rematches: rematchSet(matches),
      regions: regionMap(snapshot),
    });
    const pairs = applySwaps(paired.pairs, swaps, pool.teams).sort(
      (a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]),
    );
    const base = Date.parse(latestStart(matches)) + 60 * 60 * 1000;
    pairs.forEach(([a, b], index) => {
      const left = a < b ? a : b;
      const right = a < b ? b : a;
      matches.push({
        id: `gen-${pool.record}-${left}-${right}`,
        a: left,
        b: right,
        startTime: new Date(base + index * 60 * 60 * 1000).toISOString().replace(".000Z", "Z"),
        winner: null,
        source: null,
        generated: true,
        pool: pool.record,
        cause: null,
      });
    });
    if (pairs.length) added = true;
  }
  return added;
}

function applySwaps(pairs, swaps, poolTeams) {
  const current = pairs.map((pair) => [...pair]);
  const pool = new Set(poolTeams);
  for (const swap of swaps) {
    if (!pool.has(swap.a) || !pool.has(swap.b) || swap.a === swap.b) continue;
    const ia = current.findIndex((pair) => pair.includes(swap.a));
    const ib = current.findIndex((pair) => pair.includes(swap.b));
    if (ia < 0 || ib < 0 || ia === ib) continue;
    const opponentA = current[ia][0] === swap.a ? current[ia][1] : current[ia][0];
    const opponentB = current[ib][0] === swap.b ? current[ib][1] : current[ib][0];
    current[ia] = [swap.a, opponentB];
    current[ib] = [swap.b, opponentA];
  }
  return current.map(([a, b]) => (a < b ? [a, b] : [b, a]));
}

function readyPools(matches, snapshot) {
  const walked = walk(matches);
  const pending = new Set();
  const feeding = new Set();
  for (const item of walked.ordered) {
    if (item.match.winner) continue;
    pending.add(item.match.a);
    pending.add(item.match.b);
    feeding.add(`${item.beforeA.wins + 1}-${item.beforeA.losses}`);
    feeding.add(`${item.beforeA.wins}-${item.beforeA.losses + 1}`);
  }

  const pools = new Map();
  for (const team of snapshot.teams) {
    const record = walked.records[team.code] || { wins: 0, losses: 0 };
    if (record.wins >= 3 || record.losses >= 3) continue;
    if (pending.has(team.code)) continue;
    const key = `${record.wins}-${record.losses}`;
    if (feeding.has(key)) continue;
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(team.code);
  }
  return [...pools.entries()].map(([record, teams]) => ({ record, teams }));
}

function findUnpaired(matches, snapshot) {
  return readyPools(matches, snapshot)
    .filter((pool) => pool.teams.length % 2 === 1)
    .map((pool) => ({ record: pool.record, teams: [...pool.teams].sort() }));
}

function rematchSet(matches) {
  const set = new Set();
  for (const match of matches) {
    const [a, b] = match.a < match.b ? [match.a, match.b] : [match.b, match.a];
    set.add(`${a}|${b}`);
  }
  return set;
}

function regionMap(snapshot) {
  return new Map(snapshot.teams.map((team) => [team.code, team.region]));
}

function latestStart(matches) {
  return matches.reduce((latest, match) => (match.startTime > latest ? match.startTime : latest), "2026-10-31T16:00:00Z");
}

function decorate(snapshot, intents, settled) {
  const walked = walk(settled.matches);
  const matches = walked.ordered.map(({ match, beforeA }) => ({
    id: match.id,
    a: match.a,
    b: match.b,
    startTime: match.startTime,
    winner: match.winner,
    source: match.source,
    generated: match.generated,
    pool: match.pool,
    cause: match.cause,
    entry: `${beforeA.wins}-${beforeA.losses}`,
  }));

  const records = {};
  for (const team of snapshot.teams) {
    const record = walked.records[team.code] || { wins: 0, losses: 0 };
    records[team.code] = {
      wins: record.wins,
      losses: record.losses,
      advanced: record.wins >= 3,
      eliminated: record.losses >= 3,
    };
  }

  const paths = {};
  for (const [team, path] of intents.paths) paths[team] = [...path.steps];

  return {
    matches,
    records,
    paths,
    queues: settled.queues,
    overridden: settled.overridden,
    unpaired: settled.unpaired,
    trialCount: matches.filter((match) => match.source === "trial" && match.winner).length,
    officialRound: officialRound(snapshot),
    fetchedAt: snapshot.fetchedAt,
  };
}

function officialRound(snapshot) {
  const matches = snapshot.matches.map((match) => ({
    id: String(match.id),
    a: match.teams[0],
    b: match.teams[1],
    startTime: match.startTime,
    winner: match.winner || null,
  }));
  const walked = walk(matches);
  let earliest = null;
  for (const item of walked.ordered) {
    if (item.match.winner) continue;
    const round = item.beforeA.wins + item.beforeA.losses + 1;
    if (earliest === null || round < earliest) earliest = round;
  }
  return earliest ?? 1;
}

function walk(matches) {
  const records = {};
  const ordered = [...matches].sort(byTime);
  const annotated = [];
  for (const match of ordered) {
    records[match.a] ??= { wins: 0, losses: 0 };
    records[match.b] ??= { wins: 0, losses: 0 };
    const beforeA = { ...records[match.a] };
    const beforeB = { ...records[match.b] };
    annotated.push({ match, beforeA, beforeB });
    if (match.winner !== match.a && match.winner !== match.b) continue;
    const loser = match.winner === match.a ? match.b : match.a;
    records[match.winner].wins += 1;
    records[loser].losses += 1;
  }
  return { records, ordered: annotated };
}

function byTime(a, b) {
  return a.startTime.localeCompare(b.startTime) || String(a.id).localeCompare(String(b.id));
}
