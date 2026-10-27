import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { fs } from '../firebase';

/** 排除 0/O、1/I 這類容易看錯的字元 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** 使用者輸入的邀請碼：去掉空白和連字號、轉大寫 */
export function normalizeCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/** 顯示用：K7QMX2PD → K7QM-X2PD */
export function displayCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export interface Invite {
  code: string;
  maxUses: number;
  uses: number;
  expiresAt: number | null;
  disabled: boolean;
  note: string;
  createdAt: number;
  redeemers: { uid: string; email: string }[];
}

export type InviteState = 'active' | 'used' | 'expired' | 'disabled';

export function inviteState(i: Invite, now = Date.now()): InviteState {
  if (i.disabled) return 'disabled';
  if (i.uses >= i.maxUses) return 'used';
  if (i.expiresAt != null && i.expiresAt <= now) return 'expired';
  return 'active';
}

/** 兌換邀請碼：同一個交易裡「使用次數 +1」並建立自己的成員資格（雲端規則會再檢查一次） */
export async function redeemInvite(input: string, user: User): Promise<void> {
  const code = normalizeCode(input);
  if (code.length !== 8) throw new Error('邀請碼是 8 個字元');
  const ref = doc(fs(), 'invites', code);
  await runTransaction(fs(), async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('找不到這個邀請碼，請確認有沒有打錯');
    const d = snap.data();
    if (d.disabled) throw new Error('這個邀請碼已經停用');
    if (d.uses >= d.maxUses) throw new Error('這個邀請碼的使用次數已經用完');
    if (d.expiresAt && (d.expiresAt as Timestamp).toMillis() <= Date.now()) throw new Error('這個邀請碼已經過期');
    tx.update(ref, { uses: d.uses + 1, redeemers: [...(d.redeemers ?? []), { uid: user.uid, email: user.email ?? '' }] });
    tx.set(doc(fs(), 'members', user.uid), { email: user.email, code, joinedAt: serverTimestamp() });
  });
}

// ── 管理者 ───────────────────────────────────────────

export async function createInvite(opts: { maxUses: number; expiresAt: Date | null; note: string; createdBy: string }): Promise<string> {
  const code = generateCode();
  await setDoc(doc(fs(), 'invites', code), {
    maxUses: opts.maxUses,
    uses: 0,
    expiresAt: opts.expiresAt ? Timestamp.fromDate(opts.expiresAt) : null,
    disabled: false,
    note: opts.note,
    createdBy: opts.createdBy,
    createdAt: serverTimestamp(),
    redeemers: [],
  });
  return code;
}

export async function listInvites(): Promise<Invite[]> {
  const snap = await getDocs(collection(fs(), 'invites'));
  return snap.docs
    .map((s) => {
      const d = s.data();
      return {
        code: s.id,
        maxUses: d.maxUses,
        uses: d.uses,
        expiresAt: d.expiresAt ? (d.expiresAt as Timestamp).toMillis() : null,
        disabled: d.disabled,
        note: d.note ?? '',
        createdAt: d.createdAt ? (d.createdAt as Timestamp).toMillis() : 0,
        redeemers: d.redeemers ?? [],
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function disableInvite(code: string): Promise<void> {
  await updateDoc(doc(fs(), 'invites', code), { disabled: true });
}

export interface Member {
  uid: string;
  email: string;
  code: string;
  joinedAt: number;
}

export async function listMembers(): Promise<Member[]> {
  const snap = await getDocs(collection(fs(), 'members'));
  return snap.docs
    .map((s) => {
      const d = s.data();
      return { uid: s.id, email: d.email, code: d.code, joinedAt: d.joinedAt ? (d.joinedAt as Timestamp).toMillis() : 0 };
    })
    .sort((a, b) => b.joinedAt - a.joinedAt);
}

/** 移除成員：只取消使用權限，他的資料保留 */
export async function removeMember(uid: string): Promise<void> {
  await deleteDoc(doc(fs(), 'members', uid));
}
