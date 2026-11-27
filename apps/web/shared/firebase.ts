import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { browserLocalPersistence, browserSessionPersistence, connectAuthEmulator, getAuth, initializeAuth, setPersistence, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

export const emulator = import.meta.env.DEV || import.meta.env.MODE === 'emulator';

const rememberKey = 'qoption-remember-user';

export function rememberPreference(defaultRemember = false) {
  try {
    const saved = localStorage.getItem(rememberKey);
    return saved === null ? defaultRemember : saved === 'true';
  }
  catch { return false; }
}

export async function setRememberPreference(auth: Auth, remember: boolean) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  try { localStorage.setItem(rememberKey, String(remember)); }
  catch { /* Firebase still applies the choice for this session. */ }
}

async function configuration(): Promise<FirebaseOptions> {
  if (emulator) return { apiKey: 'qoption-emulator', projectId: 'demo-qoption', appId: '1:1234567890:web:demo' };
  if (import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };
  }
  const response = await fetch('/__/firebase/init.json');
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) {
    throw new Error('Connect a Firebase web app to this Hosting site or set the web app configuration before building.');
  }
  const config = await response.json() as FirebaseOptions;
  if (!config.projectId || !config.apiKey) throw new Error('The Firebase web app configuration is incomplete.');
  return config;
}

export async function connect(audience: 'admin' | 'user', onAdminSessionExpired?: () => void) {
  const app = initializeApp(await configuration(), 'qoption-' + audience);
  if (!emulator && import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
  }
  const auth = audience === 'admin' ? initializeAuth(app, { persistence: browserSessionPersistence }) : getAuth(app);
  const firestore = getFirestore(app);
  const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_REGION || 'us-central1');
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
  if (audience === 'user') await setPersistence(auth, rememberPreference() ? browserLocalPersistence : browserSessionPersistence);
  const call = httpsCallable<Record<string, unknown>, unknown>(functions, 'workspace');

  return {
    auth,
    async call<T>(op: string, args: Record<string, unknown> = {}) {
      const user = auth.currentUser;
      try {
        return (await call({ op, ...args })).data as T;
      } catch (error) {
        if (audience === 'admin' && user && user === auth.currentUser && (error as { code?: string }).code === 'functions/unauthenticated') {
          onAdminSessionExpired?.();
        }
        throw error;
      }
    },
    watchAdminSync(onChange: (data: Record<string, unknown>) => void): Unsubscribe {
      return onSnapshot(doc(firestore, 'meta', 'liveSync'), snap => {
        onChange(snap.exists() ? snap.data() : {});
      }, () => {});
    },
    watchUserSync(uid: string, onChange: (data: Record<string, unknown>) => void): Unsubscribe {
      return onSnapshot(doc(firestore, 'userSync', uid), snap => {
        onChange(snap.exists() ? snap.data() : {});
      }, () => {});
    },
  };
}
