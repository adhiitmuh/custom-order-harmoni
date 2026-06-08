import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'

const dataConfig = {
  apiKey: "AIzaSyAy4w2mhgZQfMBto7a9A8dhsrK2Envprf4",
  authDomain: "harmoni-custom-order.firebaseapp.com",
  projectId: "harmoni-custom-order",
  storageBucket: "harmoni-custom-order.firebasestorage.app",
  messagingSenderId: "230484579154",
  appId: "1:230484579154:web:929f7772c2db041466608b",
}

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
export const dataAuth = getAuth(dataApp)
export const db       = getFirestore(dataApp)   // memory-only cache, no IndexedDB complexity
export const authDb   = getFirestore(harmoniApp)
export const storage  = getStorage(dataApp)
