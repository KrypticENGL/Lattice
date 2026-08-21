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
    <div className="matte rounded-2xl p-4">
      <p className="font-mono text-[13px] uppercase tracking-wider text-[var(--text-secondary)]">
        {label}
      </p>
      <p className="mt-2 font-serif text-4xl font-black tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      <p className="mt-1.5 font-mono text-[13px] text-[var(--accent-secondary)]">
        {delta}
      </p>
    </div>
  );
}
