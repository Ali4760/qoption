# Qoption

Practice trading workspace and staff panel built with Vite, Firebase Authentication, Firestore, and Cloud Functions. The trading workspace uses deterministic simulated prices and Practice Credits. The read-only Assets tab displays Binance spot data where the public feed is reachable.

## Run locally

Use Node.js 22, Java 21 for the Firestore emulator, and the Firebase CLI.

```powershell
npm ci
npm ci --prefix functions
npm run emulators
```

In a second terminal run `npm run seed`. Open the [user sign-in page](http://127.0.0.1:5000/login) or [admin panel](http://127.0.0.1:5000/advin) and select **Open trading workspace**. The seed command only connects to localhost and is safe to run again. Start emulators before seeding. The [Emulator UI](http://127.0.0.1:4000/) shows the local Auth and Firestore state.

Run `npm run check` for both TypeScript projects. With the emulators running and seeded, run `npm run test:integration` to exercise permissions, settlement, funding, messaging, and pagination.

## Deploy the hosted prototype

1. In Firebase project `qoption-6c226`, register a Web app and enable the Email/Password sign-in provider. Firebase Hosting serves web configuration at `/__/firebase/init.json`. If using an explicit config at build time, copy the public web config field names from `.env.example`. Choose a Firestore location near the Functions region.
2. For hosted staff access, upgrade Firebase Authentication to Identity Platform and enable its TOTP factor. Create the intended Auth user and a Firestore document at `staff/{uid}` containing `active: true`, a `roles` array drawn from `admin`, `finance`, and `support`, and an `allClients` boolean. An account with `allClients: false` may work only with client records assigned to its UID. Sign in on `/advin` and follow the email verification and authenticator steps.
3. Register the web app with Firebase App Check using a reCAPTCHA Enterprise site key. Configure `VITE_FIREBASE_APPCHECK_SITE_KEY` in the build environment. If choosing a nondefault Functions region, set both `QOPTION_REGION` in the Functions environment and `VITE_FIREBASE_REGION` for the frontend build. The defaults are `us-central1`.
4. With Blaze enabled and dependencies installed, build the app and deploy against the authorized project.

   ```powershell
   npm run build
   firebase deploy --only firestore,functions,hosting --project qoption-6c226
   ```

5. Verify both entry points on the Firebase address. Use a synthetic account to verify sign-in, wallet activity, and staff review. Check that the scheduled reconciliation runs and that newly declared Firestore indexes are ready.

## GitHub deployment

The included workflow builds both dashboards and deploys Hosting on pushes to `main`. It uses the secret named `FIREBASE_SERVICE_ACCOUNT_QOPTION_6C226` created by Firebase's GitHub Hosting setup. Keep that secret in GitHub Actions. If the CLI generates another workflow that deploys the live channel, use one live workflow per branch. Add the App Check site key as the repository variable `VITE_FIREBASE_APPCHECK_SITE_KEY` before building a hosted release. The workflow leaves Functions and Firestore releases to the explicit deploy command above.

The reference captures in the local `user/` and `Admin/` directories are excluded from Git and the Hosting build.
