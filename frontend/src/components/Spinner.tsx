export default function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-500">
      <div className="w-8 h-8 border-2 border-slate-700 border-t-amber-400 rounded-full animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
