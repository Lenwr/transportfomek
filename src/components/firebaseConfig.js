import { initializeApp } from "firebase/app"
import { initializeFirestore } from "firebase/firestore"
import { getStorage } from "firebase/storage"
import { getAuth } from "firebase/auth"

// Initialisation de l'application Firebase
export const firebaseApp = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
})

// Firebase Storage
export const storage = getStorage(firebaseApp)

// Firestore
// Configuration anti-QUIC pour stabiliser les listeners
export const db = initializeFirestore(firebaseApp, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
})

// Firebase Authentication
export const auth = getAuth(firebaseApp)