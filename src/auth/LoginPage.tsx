import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { auth } from '../firebase';

const ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Email 或密碼錯誤',
  'auth/invalid-email': 'Email 格式不正確',
  'auth/email-already-in-use': '這個 Email 已經註冊過了，請直接登入',
  'auth/weak-password': '密碼至少需要 6 個字元',
  'auth/too-many-requests': '嘗試次數太多，請稍後再試',
  'auth/popup-closed-by-user': '登入視窗被關閉了',
  'auth/network-request-failed': '網路連線失敗',
};

function msg(e: unknown): string {
  const code = (e as { code?: string }).code ?? '';
  return ERRORS[code] ?? (e as Error).message;
}

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const google = () => run(() => signInWithPopup(auth(), new GoogleAuthProvider()));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth(), email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth(), email, password);
        await sendEmailVerification(cred.user);
      }
    });
  };

  const reset = () =>
    run(async () => {
      if (!email) throw new Error('請先在上方輸入 Email');
      await sendPasswordResetEmail(auth(), email);
      setInfo('已寄出重設密碼的信，請到信箱查看');
    });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6 text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-3 h-14 w-14" />
          <h1 className="text-xl font-semibold text-slate-800">個人資產</h1>
          <p className="mt-1 text-sm text-slate-500">帳戶、投資、負債一次掌握</p>
        </div>

        <button
          onClick={google}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          使用 Google 登入
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />或使用 Email<div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" />
          <input
            type="password"
            required
            minLength={6}
            placeholder="密碼（至少 6 個字元）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {mode === 'login' ? '登入' : '註冊'}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {info && <p className="mt-3 text-sm text-teal-700">{info}</p>}

        <div className="mt-4 flex justify-between text-sm">
          <button className="text-teal-700 hover:underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? '還沒有帳號？註冊' : '已有帳號？登入'}
          </button>
          {mode === 'login' && (
            <button className="text-slate-500 hover:underline" onClick={reset}>
              忘記密碼
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
