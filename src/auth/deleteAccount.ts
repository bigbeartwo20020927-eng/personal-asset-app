import { deleteUser, EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, type User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { fs } from '../firebase';
import { clearLocal } from '../sync/localDb';
import { COLLECTIONS } from '../types';

export function usesPassword(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'password') && !user.providerData.some((p) => p.providerId === 'google.com');
}

/** Firebase 要求刪除帳號前必須「最近登入過」，所以先重新驗證一次 */
export async function reauthenticate(user: User, password?: string): Promise<void> {
  if (usesPassword(user)) {
    if (!password) throw new Error('請輸入密碼');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? '', password));
  } else {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
  }
}

/**
 * 刪除帳號與所有資料（必須先 reauthenticate）：
 *  1. 雲端個人資料（包含刪除標記），每批最多 450 筆
 *  2. 成員資格
 *  3. 登入帳號
 *  4. 這台裝置的本機副本
 * 順序很重要：先刪資料、最後才刪成員資格與帳號，否則中途就沒有權限刪除了。
 */
export async function deleteAccountAndData(user: User, onProgress: (msg: string) => void): Promise<void> {
  for (const col of COLLECTIONS) {
    onProgress(`正在刪除雲端資料（${col}）…`);
    const snap = await getDocs(collection(fs(), 'users', user.uid, col));
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(fs());
      for (const d of snap.docs.slice(i, i + 450)) batch.delete(d.ref);
      await batch.commit();
    }
  }
  onProgress('正在移除成員資格…');
  const memberRef = doc(fs(), 'members', user.uid);
  if ((await getDoc(memberRef)).exists()) await deleteDoc(memberRef);

  onProgress('正在刪除登入帳號…');
  await deleteUser(user);

  onProgress('正在清除這台裝置的資料…');
  await clearLocal();
}
