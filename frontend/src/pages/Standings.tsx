import { useQuery } from "@tanstack/react-query";
import { api, CURRENT_YEAR } from "../api";
import { Card, CardTitle } from "../components/Card";
import Spinner from "../components/Spinner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";


export default function Standings() {
  const { data: standingsData, isLoading } = useQuery({
    queryKey: ["standings", CURRENT_YEAR],
    queryFn: () => api.standings(CURRENT_YEAR),
  });

  const standings = (standingsData?.standings ?? [])
    .sort((a: any, b: any) => (a.rank ?? 99) - (b.rank ?? 99));

  const round = standingsData?.round;

  // Chart: percentage ladder
  const chartData = standings.map((s: any, i: number) => ({
    name: s.name.split(" ").pop(),
    pct: s.percentage ?? 0,
    pts: s.pts ?? 0,
    rank: i + 1,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">AFL Ladder</h1>
        {round && <p className="text-slate-400 text-sm">After Round {round} — {CURRENT_YEAR}</p>}
      </div>

      {isLoading ? (
        <Spinner label="Fetching standings..." />
      ) : (
        <>
          {/* Percentage chart */}
          <Card>
            <CardTitle>Team Percentage</CardTitle>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 30 }}>
                <CartesianGrid stroke="#1e293b" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 9 }} angle={-45} textAnchor="end" />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                  formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Percentage"]}
                />
                <Line type="monotone" dataKey="pct" stroke="#f59e0b" dot={{ fill: "#f59e0b", r: 3 }} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Ladder table */}
          <Card>
            <CardTitle>Full Ladder</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-800">
                    <th className="text-left py-2 pr-4 font-medium w-6">#</th>
                    <th className="text-left py-2 pr-4 font-medium">Team</th>
                    <th className="text-right py-2 px-2 font-medium">P</th>
                    <th className="text-right py-2 px-2 font-medium">W</th>
                    <th className="text-right py-2 px-2 font-medium">L</th>
                    <th className="text-right py-2 px-2 font-medium">D</th>
                    <th className="text-right py-2 px-2 font-medium">Pts</th>
                    <th className="text-right py-2 pl-2 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s: any, i: number) => {
                    const inFinals = i < 8;
                    const topFour = i < 4;
                    const borderClass = i === 7 ? "border-b-2 border-amber-500/40" : "border-b border-slate-800/50";

                    return (
                      <tr key={s.name} className={`${borderClass} hover:bg-slate-800/30 transition-colors`}>
                        <td className="py-2.5 pr-4">
                          <span
                            className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                              topFour ? "bg-green-900/40 text-green-400" :
                              inFinals ? "bg-amber-900/40 text-amber-400" :
                              "text-slate-600"
                            }`}
                          >
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={`font-medium ${inFinals ? "text-slate-100" : "text-slate-400"}`}>
                            {s.name}
                          </span>
                        </td>
                        <td className="text-right py-2.5 px-2 font-mono text-slate-500">{s.played}</td>
                        <td className="text-right py-2.5 px-2 font-mono text-slate-300">{s.wins}</td>
                        <td className="text-right py-2.5 px-2 font-mono text-slate-500">{s.losses}</td>
                        <td className="text-right py-2.5 px-2 font-mono text-slate-600">{s.draws}</td>
                        <td className="text-right py-2.5 px-2 font-mono font-bold text-slate-200">{s.pts ?? "—"}</td>
                        <td className="text-right py-2.5 pl-2 font-mono text-slate-400">
                          {s.percentage ? `${s.percentage.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-green-900/40 border border-green-600 inline-block" /> Top 4
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-amber-900/40 border border-amber-600 inline-block" /> Finals (top 8)
              </span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
