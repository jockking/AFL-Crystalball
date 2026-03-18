import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, CURRENT_YEAR, type TeamForm } from "../api";
import { Card, CardTitle } from "../components/Card";
import Spinner from "../components/Spinner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ScatterChart, Scatter, CartesianGrid, ReferenceLine,
} from "recharts";

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return <span className="text-slate-500 text-xs">—</span>;
  const isWin = streak > 0;
  return (
    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${isWin ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
      {Math.abs(streak)}{isWin ? "W" : "L"}
    </span>
  );
}

export default function FormGuide() {
  const [lastN, setLastN] = useState(5);
  const [sortKey, setSortKey] = useState<keyof TeamForm>("win_rate");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["form", CURRENT_YEAR, lastN],
    queryFn: () => api.form(CURRENT_YEAR, lastN),
  });

  const allForm: TeamForm[] = data?.form ?? [];

  const filtered = allForm
    .filter((t) => t.team.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));

  // Scatter: win_rate vs avg_margin per team
  const scatterData = allForm.map((t) => ({
    name: t.team,
    x: t.win_rate,
    y: t.avg_margin,
  }));

  const cols: { key: keyof TeamForm; label: string }[] = [
    { key: "win_rate", label: "Win %" },
    { key: "avg_margin", label: "Avg Margin" },
    { key: "avg_score_for", label: "Avg Score" },
    { key: "streak", label: "Streak" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Form Guide</h1>
          <p className="text-slate-400 text-sm">Recent performance across all teams</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            placeholder="Search team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 w-36"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-400">Last</label>
            {[3, 5, 8].map((n) => (
              <button
                key={n}
                onClick={() => setLastN(n)}
                className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
                  lastN === n ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {n}
              </button>
            ))}
            <label className="text-sm text-slate-400">games</label>
          </div>
        </div>
      </div>

      {/* Win rate bar chart */}
      {!isLoading && allForm.length > 0 && (
        <Card>
          <CardTitle>Win Rate — Last {lastN} Games</CardTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={[...allForm].sort((a, b) => b.win_rate - a.win_rate)}
              margin={{ top: 0, right: 0, left: -20, bottom: 30 }}
            >
              <XAxis dataKey="team" tick={{ fill: "#64748b", fontSize: 9 }} angle={-45} textAnchor="end" />
              <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                formatter={(v: any) => [`${Number(v).toFixed(0)}%`, "Win rate"]}
              />
              <Bar dataKey="win_rate" radius={[3, 3, 0, 0]}>
                {allForm.map((t, i) => (
                  <Cell
                    key={i}
                    fill={t.win_rate >= 80 ? "#22c55e" : t.win_rate >= 60 ? "#f59e0b" : t.win_rate >= 40 ? "#64748b" : "#ef4444"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Win rate vs margin scatter */}
      {!isLoading && scatterData.length > 0 && (
        <Card>
          <CardTitle>Win Rate vs Average Margin</CardTitle>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="x" name="Win %" unit="%" tick={{ fill: "#64748b", fontSize: 11 }} label={{ value: "Win %", position: "insideBottom", offset: -5, fill: "#64748b", fontSize: 11 }} />
              <YAxis dataKey="y" name="Avg Margin" tick={{ fill: "#64748b", fontSize: 11 }} />
              <ReferenceLine x={50} stroke="#334155" strokeDasharray="3 3" />
              <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                cursor={{ strokeDasharray: "3 3" }}
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-slate-800 border border-slate-700 rounded p-2 text-xs">
                      <div className="font-semibold text-slate-100">{d.name}</div>
                      <div className="text-slate-400">Win rate: {d.x.toFixed(0)}%</div>
                      <div className="text-slate-400">Avg margin: {d.y.toFixed(1)}</div>
                    </div>
                  );
                }}
              />
              <Scatter data={scatterData} fill="#f59e0b" fillOpacity={0.8} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Table */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <CardTitle>All Teams</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Sort by:</span>
            {cols.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  sortKey === key ? "bg-amber-500 text-slate-900 font-semibold" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <Spinner label="Loading form data..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 pr-4 font-medium">Team</th>
                  <th className="text-right py-2 px-2 font-medium">W-L</th>
                  <th className="text-right py-2 px-2 font-medium">Win %</th>
                  <th className="text-right py-2 px-2 font-medium">Avg Margin</th>
                  <th className="text-right py-2 px-2 font-medium">Avg Score</th>
                  <th className="text-right py-2 pl-2 font-medium">Streak</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={t.team} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 pr-4">
                      <span className="text-slate-500 text-xs w-5 inline-block">{i + 1}</span>
                      <span className="text-slate-100 font-medium">{t.team}</span>
                    </td>
                    <td className="text-right py-2 px-2 font-mono text-slate-400">
                      {t.wins}–{t.losses}
                    </td>
                    <td className="text-right py-2 px-2 font-mono">
                      <span className={t.win_rate >= 60 ? "text-green-400" : t.win_rate >= 40 ? "text-slate-300" : "text-red-400"}>
                        {t.win_rate.toFixed(0)}%
                      </span>
                    </td>
                    <td className="text-right py-2 px-2 font-mono">
                      <span className={t.avg_margin >= 0 ? "text-green-400" : "text-red-400"}>
                        {t.avg_margin >= 0 ? "+" : ""}{t.avg_margin.toFixed(1)}
                      </span>
                    </td>
                    <td className="text-right py-2 px-2 font-mono text-slate-400">
                      {t.avg_score_for.toFixed(0)}
                    </td>
                    <td className="text-right py-2 pl-2">
                      <StreakBadge streak={t.streak} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
