import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** .env.local 還沒填好時，畫面會顯示設定說明，而不是直接當掉 */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

if (firebaseConfigured) {
  app = initializeApp(config);
  _auth = getAuth(app);
  _auth.languageCode = 'zh-TW';
  _db = getFirestore(app);
}

export function auth(): Auth {
  if (!_auth) throw new Error('Firebase 尚未設定');
  return _auth;
}

export function fs(): Firestore {
  if (!_db) throw new Error('Firebase 尚未設定');
  return _db;
}
