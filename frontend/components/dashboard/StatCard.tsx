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
    <div className="matte rounded-2xl p-3.5">
      <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
        {label}
      </p>
      <p className="mt-1.5 font-serif text-[28px] font-black tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      <p className="mt-1 font-mono text-[11px] text-[var(--accent-secondary)]">
        {delta}
      </p>
    </div>
  );
}
