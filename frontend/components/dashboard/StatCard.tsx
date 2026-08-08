export default function StatCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: string;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
        {label}
      </p>
      <p className="mt-3 font-serif text-4xl font-black tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      <p className="mt-2 font-mono text-[11px] text-[var(--accent-secondary)]">
        {delta}
      </p>
    </div>
  );
}
