import { reload, sendEmailVerification, type User } from 'firebase/auth';
import { useState, type FormEvent, type ReactNode } from 'react';
import { redeemInvite } from './invites';
import { firebaseConfigured } from '../firebase';
import { useAuth } from './AuthProvider';
import LoginPage from './LoginPage';
import { canAutoFocus } from '../touchFocus';

function Center({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">{children}</div>
    </div>
  );
}

function RedeemForm({ user, onDone }: { user: User; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await redeemInvite(code, user);
      onDone();
    } catch (err) {
      const c = (err as { code?: string }).code;
      setError(c === 'permission-denied' ? '這個邀請碼無法使用（可能已過期、用完或停用）' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        className="input text-center font-mono text-lg tracking-widest uppercase"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="XXXX-XXXX"
        autoComplete="off"
        autoFocus={canAutoFocus}
      />
      <button type="submit" className="btn-primary w-full" disabled={busy || !code.trim()}>
        {busy ? '確認中…' : '使用邀請碼加入'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function NotConfigured() {
  return (
    <Center>
      <h1 className="mb-2 text-lg font-semibold">尚未設定 Firebase</h1>
      <p className="text-sm text-slate-600">
        請依照 <code className="rounded bg-slate-100 px-1">docs/SETUP.md</code> 建立 Firebase 專案，
        把設定值填入專案根目錄的 <code className="rounded bg-slate-100 px-1">.env.local</code>，然後重新啟動開發伺服器。
      </p>
    </Center>
  );
}

/** 依登入狀態決定要顯示登入頁、驗證提示、無權限提示，還是 APP 本身 */
export default function Gate({ children }: { children: ReactNode }) {
  const { state, logout, recheck } = useAuth();
  const [sent, setSent] = useState(false);

  if (!firebaseConfigured) return <NotConfigured />;

  switch (state.status) {
    case 'loading':
      return (
        <Center>
          <p className="text-slate-500">載入中…</p>
        </Center>
      );
    case 'signedOut':
      return <LoginPage />;
    case 'needsVerify':
      return (
        <Center>
          <h1 className="mb-2 text-lg font-semibold">請驗證你的 Email</h1>
          <p className="mb-4 text-sm text-slate-600">
            驗證信已寄到 <b>{state.user.email}</b>，點信中的連結後再按下方按鈕。找不到的話請看看垃圾郵件匣。
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              className="btn-primary"
              onClick={async () => {
                await reload(state.user);
                await state.user.getIdToken(true);
                recheck();
              }}
            >
              我已經驗證了
            </button>
            <button
              className="btn"
              disabled={sent}
              onClick={async () => {
                await sendEmailVerification(state.user);
                setSent(true);
              }}
            >
              {sent ? '已重新寄出' : '重新寄送'}
            </button>
            <button className="btn" onClick={logout}>
              登出
            </button>
          </div>
        </Center>
      );
    case 'notAllowed':
      return (
        <Center>
          <h1 className="mb-2 text-lg font-semibold">尚未取得使用權限</h1>
          <p className="mb-4 text-sm text-slate-600">
            這個 APP 只開放給受邀的使用者。目前登入的是 <b>{state.user.email}</b>，請輸入管理者給你的邀請碼。
          </p>
          <RedeemForm user={state.user} onDone={recheck} />
          <div className="mt-4 flex justify-center gap-2 border-t border-slate-100 pt-4">
            <button className="btn" onClick={recheck}>
              重新檢查
            </button>
            <button className="btn" onClick={logout}>
              換一個帳號
            </button>
          </div>
        </Center>
      );
    case 'error':
      return (
        <Center>
          <h1 className="mb-2 text-lg font-semibold">連線發生問題</h1>
          <p className="mb-4 text-sm text-slate-600">{state.message}</p>
          <button className="btn-primary" onClick={recheck}>
            重試
          </button>
        </Center>
      );
    case 'ready':
      if (!state.sync.ready && !state.sync.error)
        return (
          <Center>
            <p className="text-slate-500">正在與雲端同步資料…</p>
          </Center>
        );
      return <>{children}</>;
  }
}
