type SemRow = { semafor: string; total: number };

const color = (s: string) => {
  if (s === "rojo") return "bg-red-500";
  if (s === "amarillo") return "bg-amber-400";
  return "bg-emerald-500";
};

export function SemaforoCard({
  title,
  rows,
}: {
  title: string;
  rows: SemRow[];
}) {
  const map = Object.fromEntries(rows.map((r) => [r.semafor, Number(r.total)]));
  const total = rows.reduce((a, r) => a + Number(r.total), 0);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</h3>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{total}</p>
      <ul className="mt-3 space-y-2">
        {["verde", "amarillo", "rojo"].map((k) => (
          <li key={k} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 capitalize text-zinc-700 dark:text-zinc-300">
              <span className={`h-2.5 w-2.5 rounded-full ${color(k)}`} />
              {k}
            </span>
            <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{map[k] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
