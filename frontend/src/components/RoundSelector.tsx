export default function RoundSelector({
  round,
  maxRound,
  onChange,
}: {
  round: number;
  maxRound: number;
  onChange: (r: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(1, round - 1))}
        disabled={round <= 1}
        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-sm"
      >
        ‹
      </button>
      <span className="text-sm font-semibold text-slate-300 w-20 text-center">
        Round {round}
      </span>
      <button
        onClick={() => onChange(Math.min(maxRound, round + 1))}
        disabled={round >= maxRound}
        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-sm"
      >
        ›
      </button>
    </div>
  );
}
