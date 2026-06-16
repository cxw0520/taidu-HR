import { initializeApp } from 'firebase/app';
import { getFirestore, getDocs, collection, query, where, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 初始化資料庫 (Firestore)
export const db = getFirestore(app);

// 初始化身分驗證 (Auth)
export const auth = getAuth(app);

// 將資料庫與操作函數公開至全域，以便在瀏覽器控制台執行批量操作
if (typeof window !== 'undefined') {
  (window as any).db = db;
  (window as any).auth = auth;
  (window as any).firebaseAdminHelpers = {
    getDocs, collection, query, where, addDoc, doc, updateDoc, deleteDoc
  };
}

export default app;
