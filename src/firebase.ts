import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// ⚠️ 請將以下設定替換為您專案的真實 Firebase 設定
// 這些資訊可以在 Firebase Console > 專案設定 > 您的應用程式 (Web) 中找到
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 初始化資料庫 (Firestore)
export const db = getFirestore(app);

// 初始化身分驗證 (Auth)
export const auth = getAuth(app);

export default app;
