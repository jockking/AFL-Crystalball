import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, CURRENT_YEAR, type Prediction, type ModelVote } from "../api";
import { Card, CardTitle } from "../components/Card";
import ConfidenceBar from "../components/ConfidenceBar";
import RoundSelector from "../components/RoundSelector";
import Spinner from "../components/Spinner";
import { CheckCircle, XCircle, Clock, BarChart2, ChevronDown, ChevronUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

function ResultBadge({ p }: { p: Prediction }) {
  if (!p.is_complete) {
    return (
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <Clock size={12} /> Upcoming
      </span>
    );
  }
  if (p.tip_correct === true) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-400 font-semibold">
        <CheckCircle size={12} /> Correct
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-400 font-semibold">
      <XCircle size={12} /> Wrong
    </span>
  );
}

function ScoreBadge({ p }: { p: Prediction }) {
  if (!p.is_complete || p.home_score === null || p.away_score === null) return null;
  const homeWon = p.home_score > p.away_score;
  return (
    <div className="flex items-center gap-2 text-sm font-mono">
      <span className={homeWon ? "text-slate-100 font-bold" : "text-slate-500"}>{p.home_score}</span>
      <span className="text-slate-600">–</span>
      <span className={!homeWon ? "text-slate-100 font-bold" : "text-slate-500"}>{p.away_score}</span>
    </div>
  );
}

function BetPanel({ p }: { p: Prediction }) {
  const conf = p.confidence;
  const isStrong = conf >= 75;
  const isModerate = conf >= 60;
  const tierLabel = isStrong ? "Strong tip" : isModerate ? "Moderate" : "Tight game";
  const containerCls = isStrong
    ? "bg-green-900/40 border-green-600/60 text-green-200"
    : isModerate
    ? "bg-amber-900/30 border-amber-600/50 text-amber-200"
    : "bg-slate-800/60 border-slate-600/50 text-slate-300";
  const labelCls = isStrong ? "text-green-400" : isModerate ? "text-amber-400" : "text-slate-500";
  const teamCls = isStrong ? "text-green-100" : isModerate ? "text-amber-100" : "text-slate-200";
  const eliteSplit = p.elite_winner != null && p.elite_winner !== p.predicted_winner;

  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${containerCls}`}>
      <div>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${labelCls}`}>
          {tierLabel}
        </div>
        <div className={`text-base font-bold ${teamCls}`}>{p.predicted_winner}</div>
      </div>
      <div className="text-right">
        <div className={`text-2xl font-bold tabular-nums ${labelCls}`}>{conf.toFixed(0)}%</div>
        <div className="text-xs text-slate-500">
          {Math.abs(p.avg_margin).toFixed(1)} pts · {p.model_count}m
        </div>
        {p.elite_winner && !eliteSplit && (
          <div className="text-xs text-amber-400 mt-0.5">★ Elite agree</div>
        )}
        {eliteSplit && (
          <div className="text-xs text-orange-400 mt-0.5">⚠ Elite: {p.elite_winner}</div>
        )}
      </div>
    </div>
  );
}

function ModelBreakdown({ votes, homeTeam, awayTeam }: { votes: ModelVote[]; homeTeam: string; awayTeam: string }) {
  const eliteVotes = votes.filter((v) => v.is_elite);
  const otherVotes = votes.filter((v) => !v.is_elite);

  const renderVote = (v: ModelVote) => {
    const pickedHome = v.tip === homeTeam;
    return (
      <div key={v.source_id ?? v.source_name} className="flex items-center gap-2 py-1 border-b border-slate-800/50 last:border-0">
        <span className={`flex-1 text-xs truncate ${v.is_elite ? "text-amber-300 font-medium" : "text-slate-400"}`}>
          {v.is_elite && <span className="text-amber-400 mr-1">★</span>}
          {v.source_name ?? `Model ${v.source_id}`}
        </span>
        <span className={`text-xs font-semibold w-28 text-right ${pickedHome ? "text-sky-400" : "text-violet-400"}`}>
          {v.tip ?? "—"}
        </span>
        {v.margin != null && (
          <span className="text-xs text-slate-500 w-16 text-right font-mono">
            {v.margin.toFixed(1)} pts
          </span>
        )}
        <span className="text-xs text-slate-600 w-12 text-right font-mono">
          {v.weight.toFixed(1)}%
        </span>
      </div>
    );
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-800">
      {eliteVotes.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-amber-400 font-semibold mb-1">★ Elite Models</div>
          {eliteVotes.map(renderVote)}
        </div>
      )}
      {otherVotes.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 font-semibold mb-1">All Other Models</div>
          {otherVotes.map(renderVote)}
        </div>
      )}
      <div className="text-xs text-slate-600 mt-2 text-right">
        weight = % of total consensus influence
      </div>
    </div>
  );
}

export default function Predictions() {
  const [round, setRound] = useState<number | null>(null);
  const [expandedGame, setExpandedGame] = useState<number | null>(null);

  const { data: roundData } = useQuery({
    queryKey: ["current-round"],
    queryFn: () => api.currentRound(CURRENT_YEAR),
  });

  useEffect(() => {
    if (roundData && round === null) setRound(roundData.round);
  }, [roundData]);

  const activeRound = round ?? roundData?.round ?? 1;
  const currentRound = roundData?.round ?? 1;

  const { data, isLoading, error } = useQuery({
    queryKey: ["predictions", CURRENT_YEAR, activeRound],
    queryFn: () => api.predictions(CURRENT_YEAR, activeRound),
    enabled: activeRound > 0,
  });

  const predictions: Prediction[] = data?.predictions ?? [];
  const isPastRound = activeRound < currentRound;

  // Summary stats for past rounds
  const completed = predictions.filter((p) => p.is_complete);
  const correct = completed.filter((p) => p.tip_correct).length;
  const accuracy = completed.length > 0 ? (correct / completed.length) * 100 : null;

  // Chart data
  const chartData = predictions.map((p) => ({
    name: `${p.home_team.split(" ").pop()} v ${p.away_team.split(" ").pop()}`,
    confidence: p.confidence,
    correct: p.tip_correct,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            {isPastRound ? "Round Results" : "Round Predictions"}
          </h1>
          <p className="text-slate-400 text-sm">
            {isPastRound
              ? "Model predictions vs actual results"
              : "Weighted consensus from 28+ models"}
          </p>
        </div>
        <RoundSelector round={activeRound} maxRound={currentRound} onChange={setRound} />
      </div>

      {/* Past round summary */}
      {isPastRound && accuracy !== null && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="text-center">
            <div className="text-3xl font-bold text-amber-400">{correct}/{completed.length}</div>
            <div className="text-xs text-slate-500 mt-1">Tips Correct</div>
          </Card>
          <Card className="text-center">
            <div className={`text-3xl font-bold ${accuracy >= 70 ? "text-green-400" : accuracy >= 55 ? "text-amber-400" : "text-red-400"}`}>
              {accuracy.toFixed(0)}%
            </div>
            <div className="text-xs text-slate-500 mt-1">Accuracy</div>
          </Card>
          <Card className="text-center">
            <div className="text-3xl font-bold text-sky-400">
              {predictions.filter((p) => !p.is_close).length}
            </div>
            <div className="text-xs text-slate-500 mt-1">High Confidence</div>
          </Card>
        </div>
      )}

      {isLoading ? (
        <Spinner label="Loading round data..." />
      ) : error ? (
        <Card>
          <p className="text-red-400 text-sm">Failed to load predictions. Is the API server running?</p>
          <p className="text-slate-500 text-xs mt-1">Start it with: <code className="bg-slate-800 px-1 rounded">uvicorn api.main:app --reload --port 8000</code></p>
        </Card>
      ) : predictions.length === 0 ? (
        <Card><p className="text-slate-500">No data for Round {activeRound}.</p></Card>
      ) : (
        <>
          {/* Confidence chart */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={14} className="text-slate-400" />
              <CardTitle>{isPastRound ? "Confidence vs Outcome" : "Model Confidence by Game"}</CardTitle>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} />
                <YAxis domain={[50, 100]} tick={{ fill: "#64748b", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                  formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Confidence"]}
                />
                <Bar dataKey="confidence" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => {
                    let fill: string;
                    if (isPastRound) {
                      fill = entry.correct === null ? "#64748b" : entry.correct ? "#22c55e" : "#ef4444";
                    } else {
                      fill = entry.confidence >= 75 ? "#22c55e" : entry.confidence >= 60 ? "#f59e0b" : "#ef4444";
                    }
                    return <Cell key={i} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {isPastRound && (
              <div className="flex gap-4 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Correct tip</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Wrong tip</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-500 inline-block" /> Not played</span>
              </div>
            )}
          </Card>

          {/* Game cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {predictions.map((p) => {
              const upcomingBorderCls = !p.is_complete
                ? p.confidence >= 75
                  ? "border-green-800/40"
                  : p.confidence >= 60
                  ? "border-amber-800/40"
                  : ""
                : p.tip_correct
                ? "border-green-800/50"
                : "border-red-800/50";

              return (
                <Card key={p.game_id} className={upcomingBorderCls}>
                  {/* Header: date / venue / status */}
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs text-slate-500">{p.date ? p.date.slice(0, 10) : "TBA"}</p>
                      <p className="text-xs text-slate-600">{p.venue ?? ""}</p>
                    </div>
                    <ResultBadge p={p} />
                  </div>

                  {p.is_complete ? (
                    /* ── Past game ── */
                    <>
                      {/* Teams + score */}
                      <div className="flex justify-between items-center mb-3">
                        <span className={`font-semibold ${p.actual_winner === p.home_team ? "text-slate-100" : "text-slate-500"}`}>
                          {p.home_team}
                        </span>
                        <ScoreBadge p={p} />
                        <span className={`font-semibold text-right ${p.actual_winner === p.away_team ? "text-slate-100" : "text-slate-500"}`}>
                          {p.away_team}
                        </span>
                      </div>

                      <ConfidenceBar homePct={p.home_vote_pct} homeTeam={p.home_team} awayTeam={p.away_team} />

                      {/* Tipped vs actual */}
                      <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between text-xs text-slate-500">
                        <span>
                          Tipped:{" "}
                          <span className={`font-semibold ${p.tip_correct ? "text-green-400" : "text-red-400"}`}>
                            {p.predicted_winner}
                          </span>
                        </span>
                        {!p.tip_correct && p.actual_winner && (
                          <span>Won: <span className="text-slate-300 font-semibold">{p.actual_winner}</span></span>
                        )}
                        <span>
                          Margin: <span className="font-mono text-slate-300">{Math.abs(p.avg_margin).toFixed(1)} pts</span>
                        </span>
                      </div>
                    </>
                  ) : (
                    /* ── Upcoming game ── */
                    <>
                      {/* Teams */}
                      <div className="flex justify-between items-center text-sm mb-2">
                        <span className="text-slate-300 font-medium">{p.home_team}</span>
                        <span className="text-slate-600 text-xs">vs</span>
                        <span className="text-slate-300 font-medium">{p.away_team}</span>
                      </div>

                      {/* Prominent bet recommendation */}
                      <BetPanel p={p} />

                      <div className="mt-3">
                        <ConfidenceBar homePct={p.home_vote_pct} homeTeam={p.home_team} awayTeam={p.away_team} />
                      </div>
                    </>
                  )}

                  {/* Model breakdown toggle */}
                  {p.model_votes.length > 0 && (
                    <button
                      onClick={() => setExpandedGame(expandedGame === p.game_id ? null : p.game_id)}
                      className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {expandedGame === p.game_id ? (
                        <><ChevronUp size={12} /> Hide model breakdown</>
                      ) : (
                        <><ChevronDown size={12} /> Show {p.model_votes.length} model votes</>
                      )}
                    </button>
                  )}

                  {expandedGame === p.game_id && (
                    <ModelBreakdown votes={p.model_votes} homeTeam={p.home_team} awayTeam={p.away_team} />
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
