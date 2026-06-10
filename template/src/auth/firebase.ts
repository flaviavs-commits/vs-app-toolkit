import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'

// ── Config Firebase ────────────────────────────────────────────────────────────
// Reusa o projeto Firebase do ecossistema VS (`descontoss-vip`) — o backend do VS
// valida o id_token contra esse projeto (audience). As chaves VITE_FIREBASE_* são
// públicas por design (vão no bundle) e ficam nas env vars da Vercel.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const googleProvider = new GoogleAuthProvider()

// Abre o popup do Google e retorna o id_token do Firebase para enviar ao backend.
export async function signInWithGoogle(): Promise<string> {
  const result = await signInWithPopup(auth, googleProvider)
  return result.user.getIdToken()
}

export { auth }
