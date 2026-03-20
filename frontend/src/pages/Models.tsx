import { useQuery } from "@tanstack/react-query";
import { api, type Source } from "../api";
import { Card, CardTitle } from "../components/Card";
import Spinner from "../components/Spinner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

const TIER_COLORS: Record<string, string> = {
  Elite:   "text-amber-400",
  Strong:  "text-green-400",
  Average: "text-sky-400",
  Poor:    "text-slate-500",
  Unknown: "text-slate-600",
};

const TIER_BG: Record<string, string> = {
  Elite:   "bg-amber-900/40 border-amber-700/50 text-amber-300",
  Strong:  "bg-green-900/40 border-green-700/50 text-green-300",
  Average: "bg-sky-900/40 border-sky-700/50 text-sky-300",
  Poor:    "bg-slate-800 border-slate-700 text-slate-400",
  Unknown: "bg-slate-800 border-slate-700 text-slate-500",
};

const BAR_COLORS: Record<string, string> = {
  Elite:   "#f59e0b",
  Strong:  "#22c55e",
  Average: "#38bdf8",
  Poor:    "#64748b",
  Unknown: "#475569",
};

function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TIER_BG[tier] ?? TIER_BG.Unknown}`}>
      {tier}
    </span>
  );
}

export default function Models() {
  const { data, isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.sources(),
  });

  const sources: Source[] = data?.sources ?? [];
  const withAccuracy = sources.filter((s) => s.accuracy !== null);
  const eliteModels = sources.filter((s) => s.is_elite);
  const topChart = withAccuracy.slice(0, 20);

  // Total weight accounted for by elite models
  const eliteWeightTotal = eliteModels.reduce((sum, s) => sum + s.weight_pct, 0);

  // Scatter data: accuracy vs bits (models that have both)
  const scatterData = withAccuracy
    .filter((s) => s.bits !== null)
    .map((s) => ({
      name: s.name,
      accuracy: s.accuracy,
      bits: s.bits,
      tier: s.tier,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Prediction Models</h1>
        <p className="text-slate-400 text-sm">
          {sources.length} models · {eliteModels.length} elite ·{" "}
          elite tier controls{" "}
          <span className="text-amber-400 font-semibold">{eliteWeightTotal.toFixed(0)}%</span>{" "}
          of consensus weight
        </p>
      </div>

      {isLoading ? (
        <Spinner label="Fetching model data..." />
      ) : (
        <>
          {/* Elite models spotlight */}
          {eliteModels.length > 0 && (
            <Card>
              <CardTitle>Elite Models — Drive the Consensus</CardTitle>
              <p className="text-xs text-slate-500 mb-3">
                These top-{eliteModels.length} models (≥65% accuracy) receive quadratically-boosted
                weights. Their combined vote accounts for{" "}
                <span className="text-amber-400">{eliteWeightTotal.toFixed(0)}%</span> of the full
                consensus despite being only{" "}
                {Math.round((eliteModels.length / sources.length) * 100)}% of models.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {eliteModels.map((s) => (
                  <div
                    key={s.name}
                    className="bg-slate-800 border border-amber-800/40 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <span className="text-xs font-semibold text-slate-100 leading-tight">
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-amber-400">
                            {s.name}
                          </a>
                        ) : s.name}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-amber-400">{s.accuracy?.toFixed(1)}%</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {s.weight_pct.toFixed(1)}% weight · {s.total} tips
                    </div>
                    {s.bits !== null && (
                      <div className="text-xs text-slate-500">
                        bits: <span className="text-slate-300">{s.bits.toFixed(3)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Accuracy bar chart — top 20 */}
          {topChart.length > 0 && (
            <Card>
              <CardTitle>Historical Accuracy — Top 20 Models</CardTitle>
              <ResponsiveContainer width="100%" height={Math.max(240, topChart.length * 22)}>
                <BarChart
                  data={topChart}
                  layout="vertical"
                  margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    domain={[55, 75]}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    unit="%"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    width={140}
                  />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    formatter={(v: any, _: any, props: any) => [
                      `${Number(v).toFixed(1)}% (${props.payload.weight_pct?.toFixed(1)}% weight)`,
                      "Accuracy",
                    ]}
                  />
                  <ReferenceLine x={65} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Elite", fill: "#f59e0b", fontSize: 10, position: "top" }} />
                  <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
                    {topChart.map((s, i) => (
                      <Cell key={i} fill={BAR_COLORS[s.tier] ?? BAR_COLORS.Unknown} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
                {Object.entries(TIER_COLORS).filter(([t]) => t !== "Unknown").map(([tier, cls]) => (
                  <span key={tier} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ background: BAR_COLORS[tier] }} />
                    <span className={cls}>{tier}</span>
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* Accuracy vs Bits scatter (if bits data available) */}
          {scatterData.length >= 4 && (
            <Card>
              <CardTitle>Accuracy vs Information Score (bits)</CardTitle>
              <p className="text-xs text-slate-500 mb-3">
                Bits measure probabilistic quality — a model that confidently picks the right
                winner scores higher than one that hedges. High accuracy + high bits = the best models.
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" />
                  <XAxis
                    type="number"
                    dataKey="accuracy"
                    name="Accuracy"
                    domain={["auto", "auto"]}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    unit="%"
                    label={{ value: "Accuracy %", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="bits"
                    name="Bits"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    label={{ value: "Bits", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    formatter={(v: any, name: string | undefined) => [
                      name === "Accuracy" ? `${Number(v).toFixed(1)}%` : Number(v).toFixed(3),
                      name ?? "",
                    ]}
                    labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.name ?? ""}
                  />
                  <Scatter
                    data={scatterData}
                    fill="#38bdf8"
                  >
                    {scatterData.map((entry, i) => (
                      <Cell key={i} fill={BAR_COLORS[entry.tier] ?? "#38bdf8"} opacity={0.85} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Full table */}
          <Card>
            <CardTitle>All Models — Ranked by Accuracy</CardTitle>
            <p className="text-xs text-slate-500 mb-3">
              Weight % shows each model's actual influence in the consensus. Squared excess
              weighting means elite models have disproportionately high influence.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-800">
                    <th className="text-left py-2 pr-3 font-medium">#</th>
                    <th className="text-left py-2 pr-3 font-medium">Model</th>
                    <th className="text-left py-2 pr-3 font-medium">Tier</th>
                    <th className="text-right py-2 px-2 font-medium">Tips</th>
                    <th className="text-right py-2 px-2 font-medium">Correct</th>
                    <th className="text-right py-2 px-2 font-medium">Accuracy</th>
                    <th className="text-right py-2 px-2 font-medium">Bits</th>
                    <th className="text-right py-2 pl-2 font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s, i) => (
                    <tr
                      key={s.name}
                      className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${s.is_elite ? "bg-amber-950/10" : ""}`}
                    >
                      <td className="py-2 pr-3 text-slate-500 text-xs">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
                          {s.is_elite && <span className="text-amber-400 text-xs">★</span>}
                          {s.url ? (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-400 hover:underline font-medium"
                            >
                              {s.name}
                            </a>
                          ) : (
                            <span className="text-slate-200 font-medium">{s.name}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <TierBadge tier={s.tier} />
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-slate-400 text-xs">
                        {s.total ?? "—"}
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-green-400 text-xs">
                        {s.correct ?? "—"}
                      </td>
                      <td className="text-right py-2 px-2 font-mono font-bold">
                        {s.accuracy !== null ? (
                          <span className={TIER_COLORS[s.tier] ?? "text-slate-400"}>
                            {s.accuracy.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="text-right py-2 px-2 font-mono text-slate-400 text-xs">
                        {s.bits !== null ? s.bits.toFixed(3) : "—"}
                      </td>
                      <td className="text-right py-2 pl-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, s.weight_pct * 5)}%`,
                                background: BAR_COLORS[s.tier] ?? "#64748b",
                              }}
                            />
                          </div>
                          <span className="font-mono text-xs text-slate-400 w-10 text-right">
                            {s.weight_pct.toFixed(1)}%
                          </span>
                        </div>
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
