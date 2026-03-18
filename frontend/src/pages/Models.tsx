import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Card, CardTitle } from "../components/Card";
import Spinner from "../components/Spinner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function Models() {
  const { data, isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.sources(),
  });

  const sources = data?.sources ?? [];
  const withAccuracy = sources.filter((s) => s.accuracy !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Prediction Models</h1>
        <p className="text-slate-400 text-sm">{sources.length} models contribute to the consensus prediction</p>
      </div>

      {isLoading ? (
        <Spinner label="Fetching model data..." />
      ) : (
        <>
          {/* Accuracy chart */}
          {withAccuracy.length > 0 && (
            <Card>
              <CardTitle>Historical Accuracy</CardTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={withAccuracy.slice(0, 20)}
                  margin={{ top: 0, right: 0, left: -20, bottom: 60 }}
                  layout="vertical"
                >
                  <XAxis type="number" domain={[50, 75]} tick={{ fill: "#64748b", fontSize: 11 }} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} width={130} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Accuracy"]}
                  />
                  <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
                    {withAccuracy.slice(0, 20).map((s, i) => (
                      <Cell
                        key={i}
                        fill={
                          (s.accuracy ?? 0) >= 68 ? "#22c55e" :
                          (s.accuracy ?? 0) >= 64 ? "#f59e0b" : "#64748b"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Table */}
          <Card>
            <CardTitle>All Models — Ranked by Accuracy</CardTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-800">
                    <th className="text-left py-2 pr-4 font-medium">#</th>
                    <th className="text-left py-2 pr-4 font-medium">Model</th>
                    <th className="text-right py-2 px-2 font-medium">Correct</th>
                    <th className="text-right py-2 px-2 font-medium">Incorrect</th>
                    <th className="text-right py-2 pl-2 font-medium">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s, i) => (
                    <tr key={s.name} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 pr-4 text-slate-500 text-xs">{i + 1}</td>
                      <td className="py-2 pr-4">
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline font-medium">
                            {s.name}
                          </a>
                        ) : (
                          <span className="text-slate-200 font-medium">{s.name}</span>
                        )}
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-green-400">{s.correct ?? "—"}</td>
                      <td className="text-right py-2 px-2 font-mono text-red-400">{s.incorrect ?? "—"}</td>
                      <td className="text-right py-2 pl-2 font-mono font-bold">
                        {s.accuracy !== null ? (
                          <span className={
                            s.accuracy >= 68 ? "text-green-400" :
                            s.accuracy >= 64 ? "text-amber-400" : "text-slate-400"
                          }>
                            {s.accuracy.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
