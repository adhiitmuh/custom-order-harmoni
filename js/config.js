import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'

const firebaseConfig = {
  apiKey: "AIzaSyAy4w2mhgZQfMBto7a9A8dhsrK2Envprf4",
  authDomain: "harmoni-custom-order.firebaseapp.com",
  projectId: "harmoni-custom-order",
  storageBucket: "harmoni-custom-order.firebasestorage.app",
  messagingSenderId: "230484579154",
  appId: "1:230484579154:web:929f7772c2db041466608b",
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
})
export const storage = getStorage(app)
