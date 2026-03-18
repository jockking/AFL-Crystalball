export default function ConfidenceBar({
  homePct,
  homeTeam,
  awayTeam,
}: {
  homePct: number;
  homeTeam: string;
  awayTeam: string;
}) {
  const awayPct = 100 - homePct;
  const homeColour = homePct >= awayPct ? "bg-sky-500" : "bg-slate-600";
  const awayColour = awayPct > homePct ? "bg-amber-500" : "bg-slate-600";

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{homeTeam}</span>
        <span>{awayTeam}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        <div className={`${homeColour} transition-all`} style={{ width: `${homePct}%` }} />
        <div className={`${awayColour} transition-all`} style={{ width: `${awayPct}%` }} />
      </div>
      <div className="flex justify-between text-xs font-mono mt-1">
        <span className="text-sky-400">{homePct.toFixed(0)}%</span>
        <span className="text-amber-400">{awayPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
