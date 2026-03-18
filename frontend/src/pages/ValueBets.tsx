import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, CURRENT_YEAR, type ValueData } from "../api";
import { Card, CardTitle } from "../components/Card";
import RoundSelector from "../components/RoundSelector";
import Spinner from "../components/Spinner";
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";

function StreakIcon({ streak }: { streak: number }) {
  if (streak >= 2) return <TrendingUp size={14} className="text-green-400" />;
  if (streak <= -2) return <TrendingDown size={14} className="text-red-400" />;
  return <Minus size={14} className="text-slate-500" />;
}

function FormPill({ wins, losses, winRate }: { wins: number; losses: number; winRate: number }) {
  const colour =
    winRate >= 80 ? "bg-green-900/40 text-green-400 border-green-800" :
    winRate >= 60 ? "bg-amber-900/40 text-amber-400 border-amber-800" :
                   "bg-red-900/40 text-red-400 border-red-800";
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-mono ${colour}`}>
      {wins}W-{losses}L
    </span>
  );
}

function confidenceToProb(confidence: number): number {
  const p = confidence / 100;
  return 0.5 + (p - 0.5) * 0.9;
}

function calcEdge(ourProb: number, odds: number): number {
  if (odds <= 1) return -1;
  return ourProb - 1 / odds;
}

function kellyStake(prob: number, odds: number, bankroll: number): number {
  const b = odds - 1;
  const q = 1 - prob;
  const full = (b * prob - q) / b;
  return Math.max(0, full * 0.25 * bankroll);
}

export default function ValueBets() {
  const [round, setRound] = useState<number | null>(null);
  const [bankroll, setBankroll] = useState(1000);
  const [odds, setOdds] = useState<Record<string, { home: string; away: string }>>({});

  const { data: roundData } = useQuery({
    queryKey: ["current-round"],
    queryFn: () => api.currentRound(CURRENT_YEAR),
  });

  useEffect(() => {
    if (roundData && round === null) setRound(roundData.round);
  }, [roundData]);

  const activeRound = round ?? roundData?.round ?? 1;

  const { data, isLoading } = useQuery({
    queryKey: ["value-data", CURRENT_YEAR, activeRound],
    queryFn: () => api.valueData(CURRENT_YEAR, activeRound),
    enabled: activeRound > 0,
  });

  const games: ValueData[] = data?.value_data ?? [];

  function getOdds(gameId: number) {
    return odds[gameId] ?? { home: "", away: "" };
  }

  function setOddsForGame(gameId: number, side: "home" | "away", val: string) {
    setOdds((prev) => ({
      ...prev,
      [gameId]: { ...getOdds(gameId), [side]: val },
    }));
  }

  // Compute value bets for games where odds are entered
  const valueBets = games.flatMap((g) => {
    const o = getOdds(g.game_id);
    const homeOdds = parseFloat(o.home);
    const awayOdds = parseFloat(o.away);
    if (!homeOdds || !awayOdds || homeOdds <= 1 || awayOdds <= 1) return [];

    const homeProb = confidenceToProb(g.home_vote_pct);
    const awayProb = 1 - homeProb;
    const homeEdge = calcEdge(homeProb, homeOdds);
    const awayEdge = calcEdge(awayProb, awayOdds);

    const bets = [];
    if (homeEdge > 0) bets.push({ ...g, betTeam: g.home_team, edge: homeEdge, prob: homeProb, betOdds: homeOdds });
    if (awayEdge > 0) bets.push({ ...g, betTeam: g.away_team, edge: awayEdge, prob: awayProb, betOdds: awayOdds });
    return bets;
  }).sort((a, b) => b.edge - a.edge);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Value Bet Finder</h1>
          <p className="text-slate-400 text-sm">Enter bookmaker odds to reveal model edge</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400">Bankroll $</label>
            <input
              type="number"
              value={bankroll}
              onChange={(e) => setBankroll(Number(e.target.value))}
              className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <RoundSelector round={activeRound} maxRound={24} onChange={setRound} />
        </div>
      </div>

      {/* Value bet summary */}
      {valueBets.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-900/10">
          <CardTitle>💰 Value Bets This Round</CardTitle>
          <div className="space-y-2">
            {valueBets.map((b, i) => {
              const stake = kellyStake(b.prob, b.betOdds, bankroll);
              const strength = b.edge >= 0.10 ? "STRONG" : b.edge >= 0.05 ? "MODERATE" : "MARGINAL";
              const colour = strength === "STRONG" ? "text-green-400" : strength === "MODERATE" ? "text-amber-400" : "text-slate-400";
              return (
                <div key={i} className="flex items-center justify-between gap-2 py-2 border-b border-slate-800 last:border-0 flex-wrap">
                  <div>
                    <span className={`font-bold ${colour}`}>{b.betTeam}</span>
                    <span className="text-slate-500 text-sm"> in {b.home_team} v {b.away_team}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-slate-400">Odds: <span className="text-slate-200 font-mono">${b.betOdds.toFixed(2)}</span></span>
                    <span className="text-slate-400">Edge: <span className="text-green-400 font-mono">+{(b.edge * 100).toFixed(1)}%</span></span>
                    <span className={`font-semibold ${colour}`}>{strength}</span>
                    {stake > 0 && (
                      <span className="bg-green-900/30 text-green-400 border border-green-800 px-2 py-0.5 rounded text-xs font-mono">
                        Stake ${stake.toFixed(0)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-600 mt-3">Stake sizes use 25% fractional Kelly Criterion.</p>
        </Card>
      )}

      {isLoading ? (
        <Spinner label="Loading game data..." />
      ) : games.length === 0 ? (
        <Card><p className="text-slate-500">No data for Round {activeRound}.</p></Card>
      ) : (
        <div className="space-y-4">
          {games.map((g) => {
            const o = getOdds(g.game_id);
            return (
              <Card key={g.game_id}>
                {/* Game header */}
                <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                  <div>
                    <h3 className="font-bold text-slate-100 text-lg">
                      {g.home_team} <span className="text-slate-500 text-sm font-normal">vs</span> {g.away_team}
                    </h3>
                    <p className="text-xs text-slate-500">{g.venue ?? ""}{g.date ? ` · ${g.date.slice(0, 10)}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-amber-400 font-semibold">{g.predicted_winner}</span>
                    <span className="text-slate-500 text-xs"> tipped @ {g.confidence.toFixed(0)}% conf</span>
                  </div>
                </div>

                {/* Form comparison */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* Home form */}
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-sky-400">{g.home_team}</span>
                      <FormPill wins={g.home_form.wins} losses={g.home_form.losses} winRate={g.home_form.win_rate} />
                    </div>
                    <div className="text-xs text-slate-400 space-y-1">
                      <div className="flex justify-between">
                        <span>Win rate</span>
                        <span className="font-mono text-slate-200">{g.home_form.win_rate.toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg margin</span>
                        <span className={`font-mono ${g.home_form.avg_margin >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {g.home_form.avg_margin >= 0 ? "+" : ""}{g.home_form.avg_margin.toFixed(1)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Streak</span>
                        <div className="flex items-center gap-1">
                          <StreakIcon streak={g.home_form.streak} />
                          <span className="font-mono text-slate-200">
                            {Math.abs(g.home_form.streak)}{g.home_form.streak >= 0 ? "W" : "L"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Away form */}
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-amber-400">{g.away_team}</span>
                      <FormPill wins={g.away_form.wins} losses={g.away_form.losses} winRate={g.away_form.win_rate} />
                    </div>
                    <div className="text-xs text-slate-400 space-y-1">
                      <div className="flex justify-between">
                        <span>Win rate</span>
                        <span className="font-mono text-slate-200">{g.away_form.win_rate.toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg margin</span>
                        <span className={`font-mono ${g.away_form.avg_margin >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {g.away_form.avg_margin >= 0 ? "+" : ""}{g.away_form.avg_margin.toFixed(1)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Streak</span>
                        <div className="flex items-center gap-1">
                          <StreakIcon streak={g.away_form.streak} />
                          <span className="font-mono text-slate-200">
                            {Math.abs(g.away_form.streak)}{g.away_form.streak >= 0 ? "W" : "L"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* H2H */}
                {g.h2h.games_played > 0 && (
                  <div className="bg-slate-800/30 rounded-lg px-3 py-2 mb-4 flex items-center justify-between text-xs text-slate-400">
                    <span>H2H (last {g.h2h.games_played})</span>
                    <span>
                      <span className="text-sky-400 font-semibold">{g.home_team.split(" ").pop()} {g.h2h.home_wins}</span>
                      <span className="text-slate-600 mx-1">–</span>
                      <span className="text-amber-400 font-semibold">{g.h2h.away_wins} {g.away_team.split(" ").pop()}</span>
                    </span>
                    <span>Avg margin: <span className="font-mono text-slate-200">{Math.abs(g.h2h.avg_margin).toFixed(1)} pts</span></span>
                  </div>
                )}

                {/* Odds input */}
                <div className="border-t border-slate-800 pt-3">
                  <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                    <AlertTriangle size={12} /> Enter bookmaker decimal odds to calculate edge
                  </p>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-slate-500 block mb-1">{g.home_team} odds</label>
                      <input
                        type="number"
                        step="0.05"
                        min="1"
                        placeholder="e.g. 1.85"
                        value={o.home}
                        onChange={(e) => setOddsForGame(g.game_id, "home", e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500 font-mono"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-slate-500 block mb-1">{g.away_team} odds</label>
                      <input
                        type="number"
                        step="0.05"
                        min="1"
                        placeholder="e.g. 2.10"
                        value={o.away}
                        onChange={(e) => setOddsForGame(g.game_id, "away", e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
