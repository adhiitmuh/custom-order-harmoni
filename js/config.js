import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'

// Data app — Firestore tetap di project lama (dengan offline persistence)
const dataConfig = {
  apiKey: "AIzaSyAy4w2mhgZQfMBto7a9A8dhsrK2Envprf4",
  authDomain: "harmoni-custom-order.firebaseapp.com",
  projectId: "harmoni-custom-order",
  storageBucket: "harmoni-custom-order.firebasestorage.app",
  messagingSenderId: "230484579154",
  appId: "1:230484579154:web:929f7772c2db041466608b",
}

// Auth terpusat via harmoni-indonesia
const harmoniConfig = {
  apiKey: 'AIzaSyA9V5Lw40pDeAWeQKijYCkdvnag8AlEe74',
  authDomain: 'harmoni-indonesia.firebaseapp.com',
  projectId: 'harmoni-indonesia',
  storageBucket: 'harmoni-indonesia.firebasestorage.app',
  messagingSenderId: '825719884876',
  appId: '1:825719884876:web:a8fd78d382e0f98cf6b8e9',
}

const dataApp    = initializeApp(dataConfig, 'data')
const harmoniApp = initializeApp(harmoniConfig, 'harmoni-auth')

export const app      = harmoniApp
export const auth     = getAuth(harmoniApp)
export const dataAuth = getAuth(dataApp)      // auth untuk harmoni-custom-order Firestore
export const db       = initializeFirestore(dataApp, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
})
export const authDb  = getFirestore(harmoniApp)
export const storage = getStorage(dataApp)
