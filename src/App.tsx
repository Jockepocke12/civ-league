import React, { useEffect, useMemo, useState } from "react";

// ======== Typer ========
type Difficulty =
  | "Settler" | "Chieftain" | "Warlord" | "Prince"
  | "King" | "Emperor" | "Immortal" | "Deity";

type GameRow = {
  id: string;
  played_at: string; // YYYY-MM-DD
  turns?: number | null;
  notes?: string | null;
  completed?: boolean | null;
};

type EntryRow = {
  id: string;
  game_id: string;
  player: string;
  leader?: string | null;
  difficulty?: Difficulty | null;
  handicap_turns?: number | null;
  place?: number | null;
  points?: number | null;
  winner?: boolean | null;
  absent?: boolean | null;
  exit_turn?: number | null;
};

type PlayerStateRow = {
  player: string;
  difficulty: Difficulty;
  deity_turns: number;
};

// ======== Konstanter & helpers ========
const DEFAULT_PLAYERS = ["Peter", "Jocke", "Macce", "Ecca"];
const SEED_PLAYER = "Ecca";
const DIFFICULTIES: Difficulty[] = [
  "Settler","Chieftain","Warlord","Prince","King","Emperor","Immortal","Deity"
];

const LS = {
  games: "civ_games",
  entries: "civ_entries",
  players: "civ_players_state",
  rules: "civ_house_rules",
} as const;

const SEED_KEY = "civ_seed_done";
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const save = (k: string, v: any) => localStorage.setItem(k, JSON.stringify(v));
const load = <T,>(k: string, fb: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fb;
  } catch {
    return fb;
  }
};

function calcPoints(place: number, participants: number) {
  const t: Record<number, number[]> = {
    2: [0, 10, 6],
    3: [0, 10, 6, 3],
    4: [0, 10, 6, 3, 1],
  };
  return (t[participants] || t[4])[place] ?? 0;
}

const idxOf = (d?: Difficulty | null) => {
  const i = DIFFICULTIES.indexOf((d as any) || "Prince");
  return i < 0 ? 3 : i;
};

function nextState(cur: PlayerStateRow, win: boolean): PlayerStateRow {
  let i = idxOf(cur.difficulty);
  let deity = cur.deity_turns || 0;
  if (win) {
    if (cur.difficulty === "Deity") deity += 1;
    else i = Math.min(DIFFICULTIES.length - 1, i + 1);
  } else {
    if (cur.difficulty !== "Settler") {
      i = Math.max(0, i - 1);
      deity = 0;
    }
  }
  return {
    player: cur.player,
    difficulty: DIFFICULTIES[i],
    deity_turns: deity,
  };
}

function seedPlayers(list = DEFAULT_PLAYERS): PlayerStateRow[] {
  return list.map((p) =>
    p === SEED_PLAYER
      ? { player: p, difficulty: "Deity", deity_turns: 1 }
      : { player: p, difficulty: "Settler", deity_turns: 0 }
  );
}

// ======== Global styles (inline för enkel sparning) ========
function GlobalStyles() {
  return (
    <style>{`
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#0b0d10; color:#e7e9ee; }
.wrap { max-width: 1100px; margin: 24px auto; padding: 0 16px; }

.topbar { display:flex; align-items:center; gap:12px; }
.topbar h1 { margin:0; font-size: 24px; }
.spacer { flex:1; }

.tabs { display:grid; grid-template-columns: repeat(7, 1fr); gap:6px; margin:16px 0; }
.tab { background:#151922; border:1px solid #212633; padding:10px; color:#cfd6e4; cursor:pointer; border-radius:8px; }
.tab.active { background:#1e2635; color:#fff; border-color:#2f3a4f; }

.card { border:1px solid #212633; background:#111522; border-radius:12px; }
.card-head { padding:12px 16px; border-bottom:1px solid #212633; font-weight:600; }
.card-body { padding:16px; }

.panel { border:1px solid #212633; border-radius:10px; padding:12px; margin:10px 0; background:#0f1421; }

.row { display:flex; align-items:center; }
.col { display:flex; flex-direction:column; }
.wrap .wrap { flex-wrap: wrap; }
.gap { gap:8px; }
.s { font-size: 14px; }
.small { font-size: 12px; }
.center { text-align:center; }
.right { text-align:right; }
.muted { color:#9aa7bd; }

.btn { background:#26334a; border:1px solid #33435f; color:#e7e9ee; padding:8px 12px; border-radius:8px; cursor:pointer; }
.btn:hover { filter:brightness(1.1); }
.btn.secondary { background:#2a2f3a; border-color:#3b4351; }
.btn.primary { background:#2652cf; border-color:#315fe1; }
.btn.danger { background:#7c1f1f; border-color:#9a2a2a; }
.link { background:none; border:none; color:#84a7ff; cursor:pointer; text-decoration:underline; }

.table { width:100%; border-collapse: collapse; }
.table th, .table td { padding:8px 6px; border-bottom:1px solid #1f2736; text-align:left; }
.table th { color:#a9b6cd; font-weight:600; }

.textarea, input, select, textarea { width:auto; background:#0f1421; color:#e7e9ee; border:1px solid #27324a; border-radius:8px; padding:8px; }
input.w150 { width:150px; }
input.w100 { width:100px; }
input.w200 { width:200px; }

.grid { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:10px; }
.grid .full { grid-column: 1 / -1; }
.grid label { display:flex; flex-direction:column; gap:6px; font-size:14px; color:#c2c9d6; }
`}</style>
  );
}

// ======== App ========
export default function App() {
  // localStorage state
  const [games, setGames] = useState<GameRow[]>(load(LS.games, []));
  const [entries, setEntries] = useState<EntryRow[]>(load(LS.entries, []));
  const [players, setPlayers] = useState<PlayerStateRow[]>(
    load(
      LS.players,
      DEFAULT_PLAYERS.map((p) => ({
        player: p,
        difficulty: "Prince",
        deity_turns: 0,
      }))
    )
  );
  const [rules, setRules] = useState<string>(load(LS.rules, ""));
  const [tab, setTab] = useState<
    "new"|"ongoing"|"leader"|"latest"|"history"|"rules"|"industries"
  >("new");

  // initial seed – bara om det är helt tomt
  useEffect(() => {
    const seeded = localStorage.getItem(SEED_KEY) === "true";
    if (!seeded && games.length === 0 && entries.length === 0) {
      const ps = seedPlayers();
      setPlayers(ps);
      save(LS.players, ps);
      localStorage.setItem(SEED_KEY, "true");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist
  useEffect(() => save(LS.games, games), [games]);
  useEffect(() => save(LS.entries, entries), [entries]);
  useEffect(() => save(LS.players, players), [players]);
  useEffect(() => save(LS.rules, rules), [rules]);

  // deriverat
  const byGame = useMemo(() => {
    const map = new Map<string, { game: GameRow; entries: EntryRow[] }>();
    games.forEach((g) => map.set(g.id, { game: g, entries: [] }));
    entries.forEach((e) => {
      const b = map.get(e.game_id);
      if (b) b.entries.push(e);
    });
    return Array.from(map.values()).sort((a, b) =>
      a.game.played_at < b.game.played_at ? 1 : -1
    );
  }, [games, entries]);

  const ongoing = useMemo(() => byGame.filter((x) => !x.game.completed), [byGame]);
  const historyDone = useMemo(() => byGame.filter((x) => !!x.game.completed), [byGame]);
  const latest10 = useMemo(() => historyDone.slice(0, 10), [historyDone]);

  const leaderboard = useMemo(() => {
    const acc = new Map<
      string,
      { player: string; played: number; wins: number; points: number; places: number[] }
    >();
    for (const e of entries) {
      const key = e.player?.trim();
      if (!key) continue;
      if (!acc.has(key))
        acc.set(key, { player: key, played: 0, wins: 0, points: 0, places: [] });
      const row = acc.get(key)!;
      row.played += e.absent ? 0 : 1;
      row.wins += e.winner ? 1 : 0;
      row.points += e.points || 0;
      if (e.place) row.places.push(e.place);
    }
    return Array.from(acc.values())
      .map((r) => ({
        ...r,
        avgPlace: r.places.length
          ? r.places.reduce((a, b) => a + b, 0) / r.places.length
          : 0,
      }))
      .sort((a, b) => b.points - a.points || a.avgPlace - b.avgPlace);
  }, [entries]);

  // ===== Recalc helpers (poäng + vinnare) =====
  function recalcForGame(all: EntryRow[], gameId: string): EntryRow[] {
    const arr = all.map((e) => ({ ...e }));
    const inGame = arr.filter((e) => e.game_id === gameId);
    const participants = inGame.filter((e) => !e.absent);

    // reset
    inGame.forEach((e) => {
      if (e.absent) {
        e.points = 5;
        e.place = null;
        e.winner = false;
      } else {
        e.winner = false;
      }
    });

    const allPlaced = participants.length > 0 && participants.every((e) => e.place != null && e.place! > 0);

    if (allPlaced) {
      const sorted = participants
        .slice()
        .sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
      sorted.forEach((e, i) => {
        e.points = calcPoints(i + 1, participants.length);
        e.winner = i === 0; // vinnaren = plats #1
      });
    } else {
      // inga poäng innan alla placeringar är satta
      participants.forEach((e) => (e.points = 0));
    }

    return arr;
  }

  function updateEntry(entryId: string, fields: Partial<EntryRow>) {
    setEntries((prev) => {
      const before = prev.find((e) => e.id === entryId);
      const gid = before?.game_id || "";
      const next = prev.map((e) => (e.id === entryId ? { ...e, ...fields } : e));
      return gid ? recalcForGame(next, gid) : next;
    });
  }

  // actions
  function createGame(payload: {
    played_at: string;
    turns?: number | null;
    notes?: string | null;
    roster: any[];
  }) {
    const g: GameRow = {
      id: uid(),
      played_at: payload.played_at,
      turns: payload.turns ?? null,
      notes: payload.notes ?? null,
      completed: false,
    };
    const rows: EntryRow[] = payload.roster.map((r: any) => ({
      id: uid(),
      game_id: g.id,
      player: r.player,
      leader: r.leader || null,
      difficulty: r.difficulty || null,
      handicap_turns: r.absent ? 0 : r.handicap_turns ?? 0,
      place: null, // sätts senare i Pågående
      points: r.absent ? 5 : 0,
      winner: false,
      absent: !!r.absent,
      exit_turn: null,
    }));
    setGames((x) => [g, ...x]);
    setEntries((x) => recalcForGame([...x, ...rows], g.id));
    setTab("ongoing");
  }

  function markCompleted(gameId: string) {
    const rows = entries.filter((e) => e.game_id === gameId);
    const map = new Map<string, PlayerStateRow>();
    players.forEach((p) => map.set(p.player, { ...p }));

    for (const r of rows) {
      if (!r.player || r.absent) continue;
      const cur =
        map.get(r.player) || { player: r.player, difficulty: "Prince", deity_turns: 0 };
      map.set(r.player, nextState(cur, !!r.winner));
    }
    setPlayers(Array.from(map.values()));
    setGames((g) => g.map((x) => (x.id === gameId ? { ...x, completed: true } : x)));
  }

  const deleteEntry = (id: string) => setEntries((xs) => xs.filter((e) => e.id !== id));
  const deleteGame = (id: string) => {
    setGames((g) => g.filter((x) => x.id !== id));
    setEntries((xs) => xs.filter((e) => e.game_id !== id));
  };

  function clearHistory() {
    if (!confirm("Rensa ALL historik och resetta startläge?")) return;
    const ps = seedPlayers();
    setGames([]);
    setEntries([]);
    setPlayers(ps);
    save(LS.games, []);
    save(LS.entries, []);
    save(LS.players, ps);
    localStorage.setItem(SEED_KEY, "true");
    setTab("new");
  }

  return (
    <div className="wrap">
      <GlobalStyles />
      <header className="topbar">
        <h1>Civ VI Liga</h1>
        <div className="spacer" />
        <button className="btn secondary" onClick={clearHistory}>Rensa historik</button>
      </header>

      <Tabs value={tab} onChange={setTab} />

      {tab === "new" && (
        <Card title="Registrera omgång">
          <NewGame
            players={players}
            onCreate={createGame}
            hasCompleted={historyDone.length > 0}
          />
        </Card>
      )}

      {tab === "ongoing" && (
        <Card title="Pågående spel">
          {!ongoing.length && <div className="muted">Inga pågående spel – skapa en ny omgång.</div>}
          {ongoing.map(({ game, entries }) => (
            <div key={game.id} className="panel">
              <div className="row between">
                <div className="muted">
                  {new Date(game.played_at).toLocaleDateString()} {game.turns ? `· ${game.turns} turns` : ""}
                </div>
                <div className="row gap">
                  <button className="btn" onClick={() => markCompleted(game.id)}>
                    Markera som färdig
                  </button>
                  <button className="btn danger" onClick={() => deleteGame(game.id)}>
                    Ta bort spel
                  </button>
                </div>
              </div>
              <OngoingTable entries={entries} onChange={updateEntry} onDelete={deleteEntry} />
            </div>
          ))}
        </Card>
      )}

      {tab === "leader" && (
        <Card title="Tabell">
          {!leaderboard.length ? (
            <div className="muted">Ingen data än.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Spelare</th><th>Spel</th><th>Vinster</th><th>Poäng</th><th>Snittplats</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r) => (
                  <tr key={r.player}>
                    <td>{r.player}</td>
                    <td>{r.played}</td>
                    <td>{r.wins}</td>
                    <td>{r.points}</td>
                    <td>{r.avgPlace.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="muted small">
            Svårighetsgrad/handikapp visas i fliken <i>Pågående spel</i>.
          </div>
        </Card>
      )}

      {tab === "latest" && (
        <Card title="Senaste 10 matcher">
          {!latest10.length && <div className="muted">Inga matcher ännu.</div>}
          <div className="col gap">
            {latest10.map(({ game, entries }) => {
              const summary = entries
                .slice()
                .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
                .map(
                  (e) => `${e.place ? `#${e.place}` : "-"} ${e.player}${e.absent ? " (frånvaro)" : ""}${e.exit_turn ? ` · T${e.exit_turn}` : ""}`
                )
                .join(" · ");
              const winner = entries.find((e) => !!e.winner)?.player || "-";
              return (
                <div key={game.id} className="panel">
                  <div className="row between">
                    <div className="muted">
                      {new Date(game.played_at).toLocaleDateString()} {game.turns ? `· ${game.turns} turns` : ""}
                    </div>
                    <div className="small">
                      Vinnare: <b>{winner}</b>
                    </div>
                  </div>
                  <div className="small muted">{summary}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {tab === "history" && (
        <Card title="Historik (färdiga)">
          {!historyDone.length && <div className="muted">Inga färdiga spel ännu.</div>}
          {historyDone.map(({ game, entries }) => (
            <div key={game.id} className="panel">
              <div className="row between">
                <div className="muted">
                  {new Date(game.played_at).toLocaleDateString()} {game.turns ? `· ${game.turns} turns` : ""}
                </div>
                <button className="btn danger" onClick={() => deleteGame(game.id)}>
                  Ta bort spel
                </button>
              </div>
              <HistoryTable entries={entries} onDelete={deleteEntry} />
            </div>
          ))}
        </Card>
      )}

      {tab === "rules" && (
        <Card title="Husregler">
          <textarea
            className="textarea"
            rows={10}
            placeholder="Skriv era husregler här…"
            value={rules}
            onChange={(e) => setRules(e.target.value)}
          />
          <div className="muted small">Sparas lokalt i din webbläsare i denna demo.</div>
        </Card>
      )}

      {tab === "industries" && (
        <Card title="Industries (Monopolies & Corporations)">
          <IndustriesInfo />
        </Card>
      )}

      <footer className="muted center small">
        Frånvaro +5p. 3 spelare: 10/6/3 (+5 till frånvarande). 4 spelare: 10/6/3/1.
        Svår upp/ner efter färdigt parti. Deity-vinst ⇒ +1 turn. Första spel seedas:
        <b> {SEED_PLAYER}</b> Deity+1, övriga Settler.
      </footer>
    </div>
  );
}

// ======== Små UI-komponenter (egenbyggda) ========

function Tabs({
  value,
  onChange,
}: {
  value: "new" | "ongoing" | "leader" | "latest" | "history" | "rules" | "industries";
  onChange: (v: any) => void;
}) {
  return (
    <div className="tabs">
      {[
        ["new", "Ny omgång"],
        ["ongoing", "Pågående spel"],
        ["leader", "Tabell"],
        ["latest", "Senaste 10"],
        ["history", "Historik"],
        ["rules", "Husregler"],
        ["industries", "Industries"],
      ].map(([k, label]) => (
        <button
          key={k}
          className={`tab ${value === k ? "active" : ""}`}
          onClick={() => onChange(k)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-head">{title}</div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function HistoryTable({ entries, onDelete }: { entries: EntryRow[]; onDelete: (id: string) => void }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Plats</th>
          <th>Spelare</th>
          <th>Ledare</th>
          <th>Svår</th>
          <th>HC (+turns)</th>
          <th>Turn (ut)</th>
          <th>Poäng</th>
          <th>Vinnare</th>
          <th>Frånvaro</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {entries
          .slice()
          .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
          .map((e) => (
            <tr key={e.id}>
              <td>{e.place ?? "-"}</td>
              <td>{e.player}</td>
              <td>{e.leader ?? ""}</td>
              <td>{e.difficulty ?? ""}</td>
              <td>{e.handicap_turns ?? 0}</td>
              <td>{e.exit_turn ?? "-"}</td>
              <td>{e.points ?? 0}</td>
              <td>{e.winner ? "Ja" : "Nej"}</td>
              <td>{e.absent ? "Ja (+5)" : "Nej"}</td>
              <td className="right">
                <button className="link" onClick={() => onDelete(e.id)}>
                  Ta bort rad
                </button>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function OngoingTable({ entries, onChange, onDelete }: { entries: EntryRow[]; onChange:(id:string, f:Partial<EntryRow>)=>void; onDelete:(id:string)=>void; }) {
  const participants = entries.filter(e=>!e.absent).length;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Plats</th>
          <th>Spelare</th>
          <th>Ledare</th>
          <th>Svår</th>
          <th>HC (+turns)</th>
          <th>Turn (ut)</th>
          <th>Poäng</th>
          <th>Vinnare</th>
          <th>Frånvaro</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {entries
          .slice()
          .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
          .map((e) => (
            <tr key={e.id}>
              <td>
                {e.absent ? (
                  <span>-</span>
                ) : (
                  <select
                    value={e.place ?? ''}
                    onChange={(ev)=> onChange(e.id,{ place: ev.target.value? Number(ev.target.value): null })}
                  >
                    <option value="">—</option>
                    {Array.from({length:participants}).map((_,i)=> (
                      <option key={i+1} value={i+1}>{i+1}</option>
                    ))}
                  </select>
                )}
              </td>
              <td>{e.player}</td>
              <td>{e.leader ?? ""}</td>
              <td>{e.difficulty ?? ""}</td>
              <td>{e.handicap_turns ?? 0}</td>
              <td>
                {e.absent ? (
                  <span>-</span>
                ) : (
                  <input
                    className="w100"
                    inputMode="numeric"
                    value={e.exit_turn ?? ''}
                    placeholder="T"
                    onChange={(ev)=> onChange(e.id,{ exit_turn: ev.target.value? Number(ev.target.value): null })}
                  />
                )}
              </td>
              <td>{e.points ?? 0}</td>
              <td>{e.winner ? "Ja" : "Nej"}</td>
              <td>{e.absent ? "Ja (+5)" : "Nej"}</td>
              <td className="right">
                <button className="link" onClick={() => onDelete(e.id)}>Ta bort rad</button>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

// ======== Ny omgång ========
function NewGame({
  players,
  onCreate,
  hasCompleted,
}: {
  players: PlayerStateRow[];
  onCreate: (payload: any) => void;
  hasCompleted: boolean;
}) {
  const [playedAt, setPlayedAt] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [turns, setTurns] = useState("");
  const [notes, setNotes] = useState("");

  const initialRoster = DEFAULT_PLAYERS.map((p) => {
    const seeded = !hasCompleted; // om inga färdiga spel → seedläge
    const baseDiff: Difficulty = seeded
      ? p === SEED_PLAYER
        ? "Deity"
        : "Settler"
      : (players.find((ps) => ps.player === p)?.difficulty as Difficulty) || "Prince";
    const baseHC = seeded
      ? p === SEED_PLAYER
        ? 1
        : 0
      : players.find((ps) => ps.player === p)?.deity_turns ?? 0;
    return {
      player: p,
      leader: "",
      difficulty: baseDiff,
      handicap_turns: baseHC,
      absent: false,
    } as any;
  });

  const [roster, setRoster] = useState<any[]>(initialRoster);

  useEffect(() => {
    const next = DEFAULT_PLAYERS.map((p, i) => {
      const seeded = !hasCompleted;
      const baseDiff: Difficulty = seeded
        ? p === SEED_PLAYER
          ? "Deity"
          : "Settler"
        : (players.find((ps) => ps.player === p)?.difficulty as Difficulty) || "Prince";
      const baseHC = seeded
        ? p === SEED_PLAYER
          ? 1
          : 0
        : players.find((ps) => ps.player === p)?.deity_turns ?? 0;
      const prev = roster[i];
      return { ...prev, player: p, difficulty: baseDiff, handicap_turns: baseHC };
    });
    setRoster(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.map((p) => `${p.player}:${p.difficulty}:${p.deity_turns}`).join("|"), hasCompleted]);

  return (
    <div className="col gap">
      <div className="grid">
        <label>
          <span>Datum</span>
          <input type="date" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
        </label>
        <label>
          <span>Totala turns (valfritt)</span>
          <input
            inputMode="numeric"
            value={turns}
            onChange={(e) => setTurns(e.target.value)}
            placeholder="t.ex. 210"
          />
        </label>
        <label className="full">
          <span>Anteckning</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Kort kommentar"
          />
        </label>
      </div>

      {roster.map((r, idx) => (
        <div key={idx} className="row gap wrap">
          <input
            className="w150"
            placeholder="Spelarnamn"
            value={r.player}
            onChange={(e) =>
              setRoster((m) => m.map((x, i) => (i === idx ? { ...x, player: e.target.value } : x)))
            }
          />

          <select
            value={r.difficulty}
            onChange={(e) =>
              setRoster((m) => m.map((x, i) => (i === idx ? { ...x, difficulty: e.target.value } : x)))
            }
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* HC (+turns) 0..10 */}
          <select
            value={String(r.handicap_turns ?? 0)}
            onChange={(e) =>
              setRoster((m) =>
                m.map((x, i) =>
                  i === idx ? { ...x, handicap_turns: Number(e.target.value) } : x
                )
              )
            }
          >
            {Array.from({ length: 11 }).map((_, n) => (
              <option key={n} value={n}>
                +{n} turn{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>

          <input
            className="w200"
            placeholder="Ledare/civ"
            value={r.leader}
            onChange={(e) =>
              setRoster((m) => m.map((x, i) => (i === idx ? { ...x, leader: e.target.value } : x)))
            }
          />

          <label className="row gap s">
            <input
              type="checkbox"
              checked={!!r.absent}
              onChange={(e) =>
                setRoster((m) =>
                  m.map((x, i) =>
                    i === idx
                      ? {
                          ...x,
                          absent: e.target.checked,
                        }
                      : x
                  )
                )
              }
            />
            Deltog ej (+5)
          </label>
        </div>
      ))}

      <div className="right">
        <button
          className="btn primary"
          onClick={() =>
            onCreate({
              played_at: playedAt,
              turns: turns ? Number(turns) : null,
              notes,
              roster,
            })
          }
        >
          Spara som pågående
        </button>
      </div>
    </div>
  );
}

// ======== Industries – ren visning ========
function IndustriesInfo() {
  // Gruppning enligt luxury-typ → Industry-effekt i staden (GS + Corporations)
  const GROUPS: Array<{ resources: string[]; effect: string }> = [
    { resources: ["Amber","Dyes","Incense","Pearls"], effect: "+25% Faith i staden" },
    { resources: ["Citrus","Cotton","Ivory","Tobacco","Whales"], effect: "+30% Production mot MILITÄRA enheter i staden" },
    { resources: ["Cocoa","Honey","Salt","Sugar"], effect: "+20% befolkningstillväxt och +3 Housing i staden" },
    { resources: ["Coffee","Silk","Spices","Wine"], effect: "+20% Culture i staden" },
    { resources: ["Diamonds","Jade","Silver","Truffles"], effect: "+25% Gold i staden" },
    { resources: ["Furs","Olives"], effect: "+30% Production mot CIVILA enheter i staden" },
    { resources: ["Gypsum","Marble"], effect: "+30% Production mot BYGGNADER i staden" },
    { resources: ["Mercury","Tea","Turtles"], effect: "+15% Science i staden" },
  ];

  return (
    <div className="col gap">
      <div className="muted small">
        Varje <i>Industry</i> förbättrar sin resursruta (t.ex. +2 Food, +2 Production, +1 Gold)
        och ger +1 Great Merchant-poäng. Endast en Industry per stad.
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Luxury-grupp</th>
            <th>Effekt</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((g, i) => (
            <tr key={i}>
              <td>{g.resources.join(", ")}</td>
              <td>{g.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted small">
        <b>Corporations</b> (senare i spelet) dubblerar Industry-effekten och låser upp projekt för <i>Products</i>.
      </div>
    </div>
  );
}
