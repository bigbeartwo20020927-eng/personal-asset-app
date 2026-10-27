import { fmt } from '../format';

export function Money({ value, currency = 'TWD', colored = false, className = '' }: { value: number; currency?: string; colored?: boolean; className?: string }) {
  const color = colored ? (value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : '') : value < 0 ? 'text-red-600' : '';
  return (
    <span className={`tabular-nums ${color} ${className}`}>
      {currency !== 'TWD' && <span className="mr-1 text-xs text-slate-400">{currency}</span>}
      {colored && value > 0 ? '+' : ''}
      {fmt(value, currency)}
    </span>
  );
}

export function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    onChange(d.toISOString().slice(0, 7));
  };
  const [y, m] = month.split('-');
  return (
    <div className="flex items-center gap-2">
      <button className="btn px-2 py-1" onClick={() => shift(-1)} aria-label="上個月">
        ‹
      </button>
      <span className="min-w-24 text-center font-medium">
        {y} 年 {Number(m)} 月
      </span>
      <button className="btn px-2 py-1" onClick={() => shift(1)} aria-label="下個月">
        ›
      </button>
    </div>
  );
}

export function ProgressBar({ value, max, warnAt = 0.8 }: { value: number; max: number; warnAt?: number }) {
  const ratio = max > 0 ? value / max : 0;
  const color = ratio > 1 ? 'bg-red-500' : ratio >= warnAt ? 'bg-amber-500' : 'bg-teal-600';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: string }[] }) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm">
      {items.map((i) => (
        <button key={i.key} onClick={() => onChange(i.key)} className={`flex-1 rounded-md px-3 py-1.5 ${value === i.key ? 'bg-white font-medium shadow-sm' : 'text-slate-500'}`}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-sm text-slate-400">{children}</div>;
}
