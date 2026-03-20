import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, CURRENT_YEAR, type TeamForm } from "../api";
import { Card, CardTitle } from "../components/Card";
import ConfidenceBar from "../components/ConfidenceBar";
import RoundSelector from "../components/RoundSelector";
import Spinner from "../components/Spinner";
import { Link } from "react-router-dom";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// AFL has up to 24 regular-season rounds + 4 finals weeks
const MAX_ROUND = 27;

export default function Dashboard() {
  const { data: roundData } = useQuery({
    queryKey: ["current-round"],
    queryFn: () => api.currentRound(CURRENT_YEAR),
  });

  const currentRound = roundData?.round;

  // Selected round — default to current once loaded
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  useEffect(() => {
    if (currentRound != null && selectedRound === null) {
      setSelectedRound(currentRound);
    }
  }, [currentRound, selectedRound]);

  const round = selectedRound ?? currentRound;
  const isCurrentRound = round === currentRound;
  const isPastRound = currentRound != null && round != null && round < currentRound;
  const isFutureRound = currentRound != null && round != null && round > currentRound;

  const { data: predData, isLoading: loadingPreds } = useQuery({
    queryKey: ["predictions", CURRENT_YEAR, round],
    queryFn: () => api.predictions(CURRENT_YEAR, round),
    enabled: !!round,
  });

  const { data: standingsData } = useQuery({
    queryKey: ["standings", CURRENT_YEAR],
    queryFn: () => api.standings(CURRENT_YEAR),
  });

  const { data: formData } = useQuery({
    queryKey: ["form", CURRENT_YEAR],
    queryFn: () => api.form(CURRENT_YEAR, 5),
  });

  const predictions = predData?.predictions ?? [];
  const standings = (standingsData?.standings ?? [])
    .sort((a: any, b: any) => (a.rank ?? 99) - (b.rank ?? 99))
    .slice(0, 8);

  const allForm: TeamForm[] = formData?.form ?? [];
  const topForm = allForm.slice(0, 5);

  // Build a quick-lookup map for form by team name
  const formByTeam = Object.fromEntries(allForm.map((t) => [t.team, t]));

  // Accuracy for past/current rounds
  const completedPreds = predictions.filter((p) => p.is_complete);
  const correctPreds = completedPreds.filter((p) => p.tip_correct === true);
  const accuracy =
    completedPreds.length > 0
      ? Math.round((correctPreds.length / completedPreds.length) * 100)
      : null;

  // Radar data for top 5 form teams
  const radarData = topForm.map((t) => ({
    team: t.team.replace(/ /g, "\n"),
    "Win %": t.win_rate,
    "Avg Margin": Math.max(0, t.avg_margin + 30),
  }));

  const roundLabel = isFutureRound
    ? `Round ${round} — Predicted`
    : isPastRound
    ? `Round ${round} — Results`
    : `Round ${round} — Current`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            AFL Predictor — {CURRENT_YEAR}
          </h1>
          {currentRound && (
            <p className="text-slate-400 text-sm mt-1">
              Current round:{" "}
              <span className="text-amber-400 font-semibold">
                Round {currentRound}
              </span>
            </p>
          )}
        </div>

        {/* Round navigation */}
        {round != null && (
          <div className="flex items-center gap-3">
            {isFutureRound && (
              <span className="text-xs bg-blue-900/50 text-blue-300 border border-blue-700 px-2 py-0.5 rounded-full">
                Forecasted
              </span>
            )}
            {isPastRound && accuracy !== null && (
              <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full">
                {correctPreds.length}/{completedPreds.length} correct ({accuracy}%)
              </span>
            )}
            <RoundSelector
              round={round}
              maxRound={MAX_ROUND}
              onChange={setSelectedRound}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Predictions panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                {roundLabel}
              </h2>
              {isFutureRound && (
                <span className="text-xs text-slate-500 italic">
                  Based on model consensus + recent form
                </span>
              )}
            </div>

            {loadingPreds ? (
              <Spinner label="Fetching predictions..." />
            ) : predictions.length === 0 ? (
              <p className="text-slate-500 text-sm">
                {isFutureRound
                  ? "No predictions available for this round yet — check back closer to game day."
                  : "No predictions available."}
              </p>
            ) : (
              <div className="space-y-4">
                {predictions.slice(0, 5).map((p) => {
                  const homeForm = formByTeam[p.home_team];
                  const awayForm = formByTeam[p.away_team];
                  return (
                    <div
                      key={p.game_id}
                      className="border-b border-slate-800 pb-4 last:border-0 last:pb-0"
                    >
                      {/* Matchup line */}
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-sm text-slate-300">
                            {p.home_team}{" "}
                            <span className="text-slate-600 text-xs">vs</span>{" "}
                            {p.away_team}
                          </span>
                          {p.venue && (
                            <div className="text-xs text-slate-600 mt-0.5">{p.venue}</div>
                          )}
                        </div>
                        {(isFutureRound || isCurrentRound) && homeForm && awayForm && (
                          <FormBadgePair
                            homeTeam={p.home_team}
                            awayTeam={p.away_team}
                            homeForm={homeForm}
                            awayForm={awayForm}
                          />
                        )}
                      </div>

                      {p.is_complete && p.actual_winner ? (
                        /* ── Past game: result view ── */
                        <div className="flex items-center justify-between mt-2">
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold ${
                            p.tip_correct
                              ? "bg-green-900/40 border border-green-700/50 text-green-300"
                              : "bg-red-900/30 border border-red-800/50 text-red-300"
                          }`}>
                            {p.tip_correct ? "✓" : "✗"} {p.actual_winner}
                            {p.home_score != null && p.away_score != null && (
                              <span className="font-mono font-normal text-xs opacity-75 ml-1">
                                {p.home_score}–{p.away_score}
                              </span>
                            )}
                          </div>
                          {!p.tip_correct && (
                            <div className="text-xs text-slate-600">
                              tipped <span className="text-slate-500">{p.predicted_winner}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* ── Upcoming game: BET recommendation ── */
                        <BetRecommendation p={p} />
                      )}

                      <div className="mt-2">
                        <ConfidenceBar
                          homePct={p.home_vote_pct}
                          homeTeam={p.home_team}
                          awayTeam={p.away_team}
                        />
                      </div>

                      {isFutureRound && homeForm && awayForm && (
                        <FormContext homeForm={homeForm} awayForm={awayForm} />
                      )}
                    </div>
                  );
                })}

                {predictions.length > 5 && (
                  <Link
                    to="/tips"
                    className="text-amber-400 text-sm hover:underline block text-center pt-1"
                  >
                    View all {predictions.length} predictions →
                  </Link>
                )}
              </div>
            )}
          </Card>

          {/* Past round accuracy summary */}
          {isPastRound && completedPreds.length > 0 && (
            <Card>
              <CardTitle>Round {round} Accuracy</CardTitle>
              <div className="grid grid-cols-3 gap-4 mt-2">
                <Stat label="Correct" value={correctPreds.length} color="text-green-400" />
                <Stat
                  label="Incorrect"
                  value={completedPreds.length - correctPreds.length}
                  color="text-red-400"
                />
                <Stat label="Accuracy" value={`${accuracy}%`} color="text-amber-400" />
              </div>
              {/* Mini accuracy bar */}
              <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all duration-500"
                  style={{ width: `${accuracy}%` }}
                />
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Top 8 */}
          <Card>
            <CardTitle>Top 8 Ladder</CardTitle>
            {standings.length === 0 ? (
              <p className="text-slate-500 text-sm">Loading...</p>
            ) : (
              <div className="space-y-1">
                {standings.map((s: any, i: number) => (
                  <div key={s.name} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 w-4 text-right">{i + 1}</span>
                    <span
                      className={`flex-1 ${
                        i < 4 ? "text-slate-100 font-medium" : "text-slate-300"
                      }`}
                    >
                      {s.name}
                    </span>
                    <span className="text-slate-400 font-mono text-xs">{s.wins}W</span>
                    <span className="text-slate-600 font-mono text-xs">{s.pts}pt</span>
                  </div>
                ))}
                <Link
                  to="/standings"
                  className="text-amber-400 text-xs hover:underline block text-center pt-2"
                >
                  Full ladder →
                </Link>
              </div>
            )}
          </Card>

          {/* Quick links */}
          <Card>
            <CardTitle>Quick Actions</CardTitle>
            <div className="space-y-2">
              <Link
                to="/value"
                className="block w-full text-center bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold py-2 rounded-lg text-sm transition-colors"
              >
                💰 Find Value Bets
              </Link>
              <Link
                to="/form"
                className="block w-full text-center bg-slate-800 hover:bg-slate-700 text-slate-100 py-2 rounded-lg text-sm transition-colors"
              >
                📈 View Team Form
              </Link>
              <Link
                to="/models"
                className="block w-full text-center bg-slate-800 hover:bg-slate-700 text-slate-100 py-2 rounded-lg text-sm transition-colors"
              >
                🤖 Model Leaderboard
              </Link>
            </div>
          </Card>

          {/* Round context blurb */}
          {round != null && (
            <Card>
              <CardTitle>About This Round</CardTitle>
              <p className="text-xs text-slate-400 leading-relaxed">
                {isFutureRound
                  ? "These are forward-looking predictions from 28+ AFL models weighted by historical accuracy. Form badges show each team's last 5 game record."
                  : isPastRound
                  ? "Showing actual results for this round. ✓ = model predicted correctly, ✗ = model was wrong."
                  : "Live round predictions. Results will appear as games complete."}
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Form radar */}
      {topForm.length > 0 && (
        <Card>
          <CardTitle>Top 5 Teams by Recent Form (Last 5 Games)</CardTitle>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis
                dataKey="team"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Radar
                name="Win %"
                dataKey="Win %"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

// --- Sub-components ---

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function BetRecommendation({ p }: { p: import("../api").Prediction }) {
  const conf = p.confidence;
  const isStrong = conf >= 75;
  const isModerate = conf >= 60;

  const tierLabel = isStrong ? "Strong tip" : isModerate ? "Moderate" : "Tight game";
  const containerCls = isStrong
    ? "bg-green-900/40 border-green-600/60 text-green-200"
    : isModerate
    ? "bg-amber-900/30 border-amber-600/50 text-amber-200"
    : "bg-slate-800/60 border-slate-600/50 text-slate-300";
  const labelCls = isStrong
    ? "text-green-400"
    : isModerate
    ? "text-amber-400"
    : "text-slate-500";
  const teamCls = isStrong
    ? "text-green-100"
    : isModerate
    ? "text-amber-100"
    : "text-slate-200";

  const eliteSplit = p.elite_winner != null && p.elite_winner !== p.predicted_winner;

  return (
    <div className={`mt-2 flex items-center justify-between rounded-lg border px-3 py-2 ${containerCls}`}>
      <div>
        <div className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${labelCls}`}>
          {tierLabel}
        </div>
        <div className={`text-base font-bold ${teamCls}`}>
          {p.predicted_winner}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-2xl font-bold tabular-nums ${labelCls}`}>
          {conf.toFixed(0)}%
        </div>
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

function FormBadgePair({
  homeTeam,
  awayTeam,
  homeForm,
  awayForm,
}: {
  homeTeam: string;
  awayTeam: string;
  homeForm: TeamForm;
  awayForm: TeamForm;
}) {
  const streakLabel = (f: TeamForm) => {
    if (f.streak >= 3) return `🔥 ${f.streak}`;
    if (f.streak <= -3) return `❄️ ${Math.abs(f.streak)}`;
    return null;
  };
  const homeStreak = streakLabel(homeForm);
  const awayStreak = streakLabel(awayForm);
  if (!homeStreak && !awayStreak) return null;
  return (
    <div className="flex gap-1">
      {homeStreak && (
        <span
          title={`${homeTeam}: ${homeForm.wins}W-${homeForm.losses}L last 5`}
          className="text-xs bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded"
        >
          {homeStreak}
        </span>
      )}
      {awayStreak && (
        <span
          title={`${awayTeam}: ${awayForm.wins}W-${awayForm.losses}L last 5`}
          className="text-xs bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded"
        >
          {awayStreak}
        </span>
      )}
    </div>
  );
}

function FormContext({
  homeForm,
  awayForm,
}: {
  homeForm: TeamForm;
  awayForm: TeamForm;
}) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
      <div>
        <span className="text-slate-400">{homeForm.team}</span>
        {" "}— {homeForm.wins}W {homeForm.losses}L · avg {homeForm.avg_margin > 0 ? "+" : ""}
        {homeForm.avg_margin.toFixed(0)} margin
      </div>
      <div className="text-right">
        <span className="text-slate-400">{awayForm.team}</span>
        {" "}— {awayForm.wins}W {awayForm.losses}L · avg {awayForm.avg_margin > 0 ? "+" : ""}
        {awayForm.avg_margin.toFixed(0)} margin
      </div>
    </div>
  );
}
