import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { auth, fs } from '../firebase';
import { defaultCategoryOps } from '../seed/defaultCategories';
import { ensureRebateCategory } from '../seed/migrations';
import { SyncEngine, type SyncStatus } from '../sync/engine';
import { clearLocal } from '../sync/localDb';
import { commit, createOp, setWriteUser } from '../sync/write';
import { deleteAccountAndData } from './deleteAccount';

/** admin = 在 config/allowlist 裡；member = 用邀請碼加入 */
export type Role = 'admin' | 'member';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'needsVerify'; user: User }
  | { status: 'notAllowed'; user: User }
  | { status: 'error'; user: User; message: string }
  | { status: 'ready'; user: User; role: Role; sync: SyncStatus };

interface Ctx {
  state: AuthState;
  logout: () => Promise<void>;
  recheck: () => void;
  /** 刪除帳號與所有資料（呼叫前必須先重新驗證） */
  deleteAccount: (onProgress: (msg: string) => void) => Promise<void>;
}

const AuthCtx = createContext<Ctx>({
  state: { status: 'loading' },
  logout: async () => {},
  recheck: () => {},
  deleteAccount: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  const engineRef = useRef<SyncEngine | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stopEngine = () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
    const unsub = onAuthStateChanged(auth(), async (user) => {
      stopEngine();
      if (!user) {
        setWriteUser(null);
        // 登出、或帳號在其他裝置被刪除後自動登出 → 清空本機副本
        await clearLocal();
        setState({ status: 'signedOut' });
        return;
      }
      if (!user.emailVerified) {
        setState({ status: 'needsVerify', user });
        return;
      }
      setState({ status: 'loading' });
      setWriteUser(user.uid);

      // 用讀取自己的設定檔來確認是否有使用權限（白名單本身不開放讀取，避免外洩名單）
      let firstTime = false;
      let role: Role = 'admin';
      try {
        const snap = await getDoc(doc(fs(), 'users', user.uid, 'settings', 'main'));
        firstTime = !snap.exists();
        // 有權限但不是成員 → 一定是白名單裡的管理者
        const member = await getDoc(doc(fs(), 'members', user.uid));
        role = member.exists() ? 'member' : 'admin';
      } catch (e) {
        if (cancelled) return;
        const code = (e as { code?: string }).code;
        if (code === 'permission-denied') setState({ status: 'notAllowed', user });
        else setState({ status: 'error', user, message: (e as Error).message });
        return;
      }

      if (firstTime) {
        try {
          // 預設分類已經包含「手續費退佣」，所以直接標記成已補過
          await commit([createOp('settings', { costMethod: 'avg', addedRebateCategory: true }, 'main'), ...defaultCategoryOps()]);
        } catch (e) {
          // 另一台裝置可能同時在建立，忽略即可，之後同步會收到
          console.warn('初始化設定失敗', e);
        }
      }

      const engine = new SyncEngine(user.uid);
      engineRef.current = engine;
      let migrated = false;
      engine.onStatus((sync) => {
        if (!cancelled && engineRef.current === engine) setState({ status: 'ready', user, role, sync });
        // 同步完成後執行一次資料補充（例如新增的預設小類）
        if (sync.ready && !migrated) {
          migrated = true;
          ensureRebateCategory().catch((e) => console.warn('補充預設分類失敗', e));
        }
      });
      await engine.start();
    });
    return () => {
      cancelled = true;
      unsub();
      stopEngine();
    };
  }, [nonce]);

  const logout = async () => {
    engineRef.current?.stop();
    engineRef.current = null;
    // 共用裝置的隱私：登出時清空本機資料
    await clearLocal();
    await signOut(auth());
  };

  const deleteAccount = async (onProgress: (msg: string) => void) => {
    const user = auth().currentUser;
    if (!user) throw new Error('尚未登入');
    // 先停止同步，避免刪除過程中又把資料寫回本機
    engineRef.current?.stop();
    engineRef.current = null;
    await deleteAccountAndData(user, onProgress);
  };

  return (
    <AuthCtx.Provider value={{ state, logout, recheck: () => setNonce((n) => n + 1), deleteAccount }}>{children}</AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
