import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCVps5Fmg37kVNDxJ1ONd4_dUbTW1resuY",
  authDomain: "fit-comment-soie.firebaseapp.com",
  projectId: "fit-comment-soie",
  storageBucket: "fit-comment-soie.firebasestorage.app",
  messagingSenderId: "327134525506",
  appId: "1:327134525506:web:853c28836079f6c5f5d5db",
  measurementId: "G-H0PPL25RDY"
};

// Initialize Firebase
let app;
let db: any;
let auth: any;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

export { db, auth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut };

/**
 * Helper to perform Firestore operations without blocking the main thread
 * and with a timeout to prevent hanging.
 */
export async function safeFirestoreWrite(operation: () => Promise<void>) {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Sync took too long")), 30000)
  );

  try {
    if (!db) return;
    await Promise.race([operation(), timeout]);
  } catch (error) {
    // We log it as a warning since these are non-blocking background tasks
    console.warn("Background sync info:", error instanceof Error ? error.message : error);
  }
}

export default app;
