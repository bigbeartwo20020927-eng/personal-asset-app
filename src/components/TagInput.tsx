import { useState } from 'react';

export default function TagInput({ value, onChange, suggestions }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState('');
  const add = (t: string) => {
    const tag = t.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setText('');
  };
  const rest = suggestions.filter((s) => !value.includes(s) && s.includes(text.trim())).slice(0, 8);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 px-2 py-1.5 focus-within:border-teal-600">
        {value.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-sm text-teal-800">
            #{t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="text-teal-600" aria-label={`移除 ${t}`}>
              ×
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
              e.preventDefault();
              add(text);
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => text && add(text)}
          placeholder={value.length ? '' : '輸入後按 Enter，例如：日本旅遊'}
          className="min-w-24 flex-1 py-0.5 text-sm outline-none"
        />
      </div>
      {rest.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {rest.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-200">
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
