import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import {
  createInvite,
  disableInvite,
  displayCode,
  inviteState,
  listInvites,
  listMembers,
  removeMember,
  type Invite,
  type InviteState,
  type Member,
} from '../auth/invites';
import Modal from '../components/Modal';
import { useAction, useToast } from '../components/Toast';
import { addDays, today } from '../domain/dates';

const EXPIRY = [
  { key: '3', label: '3 天' },
  { key: '7', label: '7 天' },
  { key: '30', label: '30 天' },
  { key: 'none', label: '不限期' },
  { key: 'custom', label: '自訂日期' },
] as const;
type ExpiryKey = (typeof EXPIRY)[number]['key'];

const STATE_LABEL: Record<InviteState, { text: string; cls: string }> = {
  active: { text: '有效', cls: 'bg-emerald-50 text-emerald-700' },
  used: { text: '已用完', cls: 'bg-slate-100 text-slate-500' },
  expired: { text: '已過期', cls: 'bg-slate-100 text-slate-500' },
  disabled: { text: '已停用', cls: 'bg-red-50 text-red-600' },
};

/** 只有管理者看得到：產生／停用邀請碼、管理成員 */
export default function InviteManager() {
  const { state } = useAuth();
  const act = useAction();
  const toast = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState('1');
  const [expiry, setExpiry] = useState<ExpiryKey>('7');
  const [customDate, setCustomDate] = useState(addDays(today(), 14));
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [showOld, setShowOld] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [i, m] = await Promise.all([listInvites(), listMembers()]);
      setInvites(i);
      setMembers(m);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (state.status !== 'ready' || state.role !== 'admin') return null;
  const uid = state.user.uid;

  const create = async () => {
    const n = Number(maxUses);
    if (!(Number.isInteger(n) && n >= 1 && n <= 100)) return toast('可使用次數請輸入 1～100', 'error');
    let expiresAt: Date | null = null;
    if (expiry === 'custom') {
      if (!customDate || customDate <= today()) return toast('自訂日期必須晚於今天', 'error');
      expiresAt = new Date(`${customDate}T23:59:59`);
    } else if (expiry !== 'none') {
      expiresAt = new Date(Date.now() + Number(expiry) * 86_400_000);
    }
    await act(async () => {
      const code = await createInvite({ maxUses: n, expiresAt, note: note.trim(), createdBy: uid });
      setCreated(code);
      setCreating(false);
      setNote('');
      await reload();
    });
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(displayCode(code));
      toast('已複製邀請碼', 'success');
    } catch {
      toast('無法自動複製，請手動選取', 'error');
    }
  };

  const disable = async (i: Invite) => {
    if (!confirm(`停用邀請碼 ${displayCode(i.code)}？停用後無法再啟用，已經加入的人不受影響。`)) return;
    await act(async () => {
      await disableInvite(i.code);
      await reload();
    }, '已停用');
  };

  const remove = async (m: Member) => {
    if (!confirm(`移除成員 ${m.email}？他會立刻無法使用，但資料會保留；之後用新的邀請碼加入，資料就會回來。`)) return;
    await act(async () => {
      await removeMember(m.uid);
      await reload();
    }, '已移除');
  };

  const now = Date.now();
  const active = invites.filter((i) => inviteState(i, now) === 'active');
  const old = invites.filter((i) => inviteState(i, now) !== 'active');

  const row = (i: Invite) => {
    const s = STATE_LABEL[inviteState(i, now)];
    return (
      <div key={i.code} className="py-2.5">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => copy(i.code)} className="font-mono text-lg tracking-wider hover:text-teal-700" title="點一下複製">
            {displayCode(i.code)}
          </button>
          <span className={`rounded px-2 py-0.5 text-xs ${s.cls}`}>{s.text}</span>
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          已使用 {i.uses}/{i.maxUses} 次 · {i.expiresAt ? `${new Date(i.expiresAt).toLocaleDateString('zh-TW')} 到期` : '不限期'}
          {i.note && ` · ${i.note}`}
        </div>
        {i.redeemers.length > 0 && <div className="mt-0.5 text-xs text-slate-500">使用者：{i.redeemers.map((r) => r.email).join('、')}</div>}
        {inviteState(i, now) === 'active' && (
          <button className="mt-1 text-xs text-red-600 hover:underline" onClick={() => disable(i)}>
            停用
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">邀請碼管理</h2>
        <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">管理者</span>
      </div>
      <p className="mb-3 text-sm text-slate-500">把邀請碼傳給家人朋友，對方登入後輸入就能使用。每個人只看得到自己的資料。</p>
      <button className="btn-primary w-full" onClick={() => setCreating(true)}>
        ＋ 產生邀請碼
      </button>

      <div className="mt-3 divide-y divide-slate-100">
        {active.length === 0 ? <p className="py-3 text-center text-sm text-slate-400">目前沒有有效的邀請碼</p> : active.map(row)}
      </div>
      {old.length > 0 && (
        <details className="mt-1" open={showOld} onToggle={(e) => setShowOld((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-sm text-slate-500">已用完／過期／停用（{old.length}）</summary>
          <div className="divide-y divide-slate-100 opacity-80">{old.map(row)}</div>
        </details>
      )}

      <h3 className="mt-5 mb-1 font-medium">成員（{members.length}）</h3>
      {members.length === 0 ? (
        <p className="text-sm text-slate-400">還沒有人用邀請碼加入</p>
      ) : (
        <div className="divide-y divide-slate-100 text-sm">
          {members.map((m) => (
            <div key={m.uid} className="flex items-center justify-between py-2">
              <span>
                {m.email}
                <span className="block text-xs text-slate-400">
                  {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('zh-TW') : ''} 加入 · {displayCode(m.code)}
                </span>
              </span>
              <button className="text-xs text-red-600 hover:underline" onClick={() => remove(m)}>
                移除
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="產生邀請碼">
        <div className="space-y-3">
          <div>
            <label className="label">可使用次數</label>
            <input className="input" type="number" inputMode="numeric" min="1" max="100" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">1 次 = 一人一碼；設成多次可以讓全家共用一組</p>
          </div>
          <div>
            <label className="label">有效期限</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPIRY.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  onClick={() => setExpiry(x.key)}
                  className={`rounded-full px-3 py-1 text-sm ${expiry === x.key ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  {x.label}
                </button>
              ))}
            </div>
            {expiry === 'custom' && <input className="input mt-2" type="date" value={customDate} min={addDays(today(), 1)} onChange={(e) => setCustomDate(e.target.value)} />}
          </div>
          <div>
            <label className="label">備註（選填）</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：給媽媽" />
          </div>
          <p className="text-xs text-slate-500">產生後不能修改次數或期限，只能停用。</p>
        </div>
        <button className="btn-primary mt-4 w-full py-2.5" onClick={create}>
          產生
        </button>
      </Modal>

      <Modal open={created !== null} onClose={() => setCreated(null)} title="邀請碼已產生">
        <p className="mb-3 text-sm text-slate-600">把這組邀請碼傳給對方。對方打開 APP、登入後輸入即可加入。</p>
        <div className="mb-3 rounded-xl bg-slate-50 py-4 text-center font-mono text-3xl tracking-widest">{created && displayCode(created)}</div>
        <button className="btn-primary w-full" onClick={() => created && copy(created)}>
          複製邀請碼
        </button>
      </Modal>
    </div>
  );
}
