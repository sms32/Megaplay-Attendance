// lib/firebase/config.ts
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDq2jhIuYWMdNzjpzdh7qoHodzBrdnIo4M",
  authDomain: "megaplay-attendance-200cc.firebaseapp.com",
  projectId: "megaplay-attendance-200cc",
  storageBucket: "megaplay-attendance-200cc.firebasestorage.app",
  messagingSenderId: "609138785626",
  appId: "1:609138785626:web:9aec3325b01be50d078763"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

// ⚡ Enable offline persistence (caches reads locally for faster access)
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a time
      console.warn('⚠️ Multiple tabs open, persistence enabled in first tab only');
    } else if (err.code === 'unimplemented') {
      // The current browser doesn't support persistence
      console.warn('⚠️ Browser does not support offline persistence');
    } else {
      console.error('Failed to enable persistence:', err);
    }
  });
}

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
