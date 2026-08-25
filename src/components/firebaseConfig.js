import { initializeApp } from 'firebase/app'
import { initializeFirestore, collection } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import {getAuth} from 'firebase/auth'
import {useCollection} from "vuefire";
// ... other firebase imports

export const firebaseApp = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
})

// used for the firestore refs
const storage = getStorage(firebaseApp)
// ✅ Firestore anti-QUIC (stabilise les listeners)
export const db = initializeFirestore(firebaseApp, {
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false,
  })
// here we can export reusable database reference
export const auth = getAuth()
export const listeEnlevements = useCollection(collection(db, 'enlevements'))
export const listeCustomers = useCollection(collection(db, 'customers'))
export { storage  }
