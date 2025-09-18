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
  const [tab, setTab] = useState<"new"|"ongoing"|"leader"|"latest"|"history"|"rules">("new");

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
    const participants = payload.roster.filter((r: any) => !r.absent);
    const rows: EntryRow[] = payload.roster.map((r: any) => {
      const pts = r.absent ? 5 : calcPoints(r.place || 0, participants.length);
      return {
        id: uid(),
        game_id: g.id,
        player: r.player,
        leader: r.leader || null,
        difficulty: r.difficulty || null,
        handicap_turns: r.absent ? 0 : r.handicap_turns ?? 0,
        place: r.absent ? null : r.place || null,
        points: pts,
        winner: !!r.winner,
        absent: !!r.absent,
        exit_turn: r.absent ? null : r.exit_turn ?? null,
      };
    });
    setGames((x) => [g, ...x]);
    setEntries((x) => [...x, ...rows]);
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
                  {new Date(game.played_at).toLocaleDateString()}{" "}
                  {game.turns ? `· ${game.turns} turns` : ""}
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
              <Table entries={entries} onDelete={deleteEntry} />
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
                  (e) =>
                    `${e.place ? `#${e.place}` : "-"} ${e.player}${
                      e.absent ? " (frånvaro)" : ""
                    }${e.exit_turn ? ` · T${e.exit_turn}` : ""}`
                )
                .join(" · ");
              const winner = entries.find((e) => !!e.winner)?.player || "-";
              return (
                <div key={game.id} className="panel">
                  <div className="row between">
                    <div className="muted">
                      {new Date(game.played_at).toLocaleDateString()}{" "}
                      {game.turns ? `· ${game.turns} turns` : ""}
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
                  {new Date(game.played_at).toLocaleDateString()}{" "}
                  {game.turns ? `· ${game.turns} turns` : ""}
                </div>
                <button className="btn danger" onClick={() => deleteGame(game.id)}>
                  Ta bort spel
                </button>
              </div>
              <Table entries={entries} onDelete={deleteEntry} />
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
  value: "new" | "ongoing" | "leader" | "latest" | "history" | "rules";
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

function Table({ entries, onDelete }: { entries: EntryRow[]; onDelete: (id: string) => void }) {
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
      place: 0,
      winner: false,
      absent: false,
      exit_turn: undefined as any,
    };
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
                          place: e.target.checked ? 0 : x.place,
                          winner: e.target.checked ? false : x.winner,
                          exit_turn: e.target.checked ? null : x.exit_turn,
                        }
                      : x
                  )
                )
              }
            />
            Deltog ej (+5)
          </label>

          <select
            disabled={!!r.absent}
            onChange={(e) =>
              setRoster((m) => m.map((x, i) => (i === idx ? { ...x, place: Number(e.target.value) } : x)))
            }
            defaultValue=""
          >
            <option value="" disabled>
              Placering
            </option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <select
            disabled={!!r.absent}
            onChange={(e) =>
              setRoster((m) => m.map((x, i) => (i === idx ? { ...x, winner: e.target.value === "yes" } : x)))
            }
            defaultValue=""
          >
            <option value="" disabled>
              Vinnare?
            </option>
            <option value="no">Nej</option>
            <option value="yes">Ja</option>
          </select>

          <input
            className="w100"
            disabled={!!r.absent}
            inputMode="numeric"
            placeholder="Turn (ut)"
            value={r.exit_turn ?? ""}
            onChange={(e) =>
              setRoster((m) =>
                m.map((x, i) =>
                  i === idx ? { ...x, exit_turn: e.target.value ? Number(e.target.value) : undefined } : x
                )
              )
            }
          />
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
