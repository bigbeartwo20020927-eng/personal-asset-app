import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { reauthenticate, usesPassword } from '../auth/deleteAccount';
import Modal from '../components/Modal';

const CONFIRM_WORD = '刪除';

export default function DeleteAccountCard() {
  const { state, deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [password, setPassword] = useState('');
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (state.status !== 'ready') return null;
  const user = state.user;
  const isAdmin = state.role === 'admin';
  const needPassword = usesPassword(user);

  const run = async () => {
    setError('');
    try {
      // 先重新驗證，確認是本人；驗證失敗就什麼都不會刪
      setProgress('正在確認身分…');
      await reauthenticate(user, password);
      await deleteAccount(setProgress);
      setProgress('已完成');
      // 登入帳號已刪除，畫面會自動回到登入頁
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      setError(
        code === 'auth/invalid-credential' || code === 'auth/wrong-password'
          ? '密碼錯誤'
          : code === 'auth/popup-closed-by-user'
            ? '登入視窗被關閉了，資料沒有被刪除'
            : code === 'auth/user-mismatch'
              ? '請用目前這個帳號重新登入'
              : `刪除失敗：${(e as Error).message}`,
      );
      setProgress(null);
    }
  };

  return (
    <div className="card border border-red-100">
      <h2 className="mb-1 font-semibold text-red-700">刪除我的帳號與所有資料</h2>
      <p className="mb-3 text-sm text-slate-500">永久刪除你在這個 APP 的所有紀錄和登入帳號，無法復原。</p>
      <button className="btn-danger" onClick={() => setOpen(true)}>
        刪除帳號…
      </button>

      <Modal open={open} onClose={() => !progress && setOpen(false)} title="刪除帳號與所有資料">
        <div className="space-y-3 text-sm">
          <div className="rounded-lg bg-red-50 p-3 text-red-800">
            以下資料會被<b>永久刪除，無法復原</b>：
            <ul className="mt-1 list-disc pl-5">
              <li>帳戶、子帳戶、劃撥、所有收支紀錄</li>
              <li>股票交易、負債、預算、範本、分類、設定</li>
              <li>你的登入帳號（{user.email}）</li>
              <li>這台裝置上的資料</li>
            </ul>
          </div>
          <p className="text-slate-600">
            建議先到上方「匯出資料」下載<b>完整備份（JSON）</b>。其他裝置會在下次驗證身分時（最多約 1 小時）自動登出並清除資料。
          </p>
          {isAdmin && (
            <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
              你是管理者：刪除後，請到 Firebase 後台把你的 Email 從 <code>config/allowlist</code> 移除。
            </p>
          )}
          {needPassword && (
            <div>
              <label className="label">輸入密碼確認身分</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
          )}
          {!needPassword && <p className="text-slate-500">按下刪除後，會跳出 Google 登入視窗確認身分。</p>}
          <div>
            <label className="label">
              請輸入「<b>{CONFIRM_WORD}</b>」兩個字以確認
            </label>
            <input className="input" value={word} onChange={(e) => setWord(e.target.value)} />
          </div>
          {progress && <p className="text-slate-600">{progress}</p>}
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <button
          className="btn-danger mt-4 w-full py-2.5"
          disabled={word.trim() !== CONFIRM_WORD || (needPassword && !password) || progress !== null}
          onClick={run}
        >
          永久刪除
        </button>
      </Modal>
    </div>
  );
}
