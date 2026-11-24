import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

export const emulator = import.meta.env.DEV || import.meta.env.MODE === 'emulator';

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

export async function connect(audience: string) {
  const app = initializeApp(await configuration(), 'qoption-' + audience);
  if (!emulator && import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
  }
  const auth = getAuth(app);
  const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_REGION || 'us-central1');
  if (emulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
  await setPersistence(auth, browserSessionPersistence);
  const call = httpsCallable<Record<string, unknown>, unknown>(functions, 'workspace');

  return {
    auth,
    async call<T>(op: string, args: Record<string, unknown> = {}) {
      return (await call({ op, ...args })).data as T;
    },
  };
}
