# qoption

## Firebase Hosting deployment

On pushes to `main`, GitHub Actions deploys the test page in `hosting/index.html` to [qoption-6c226.web.app](https://qoption-6c226.web.app/). You can also run the workflow from the repository's **Actions** tab. It uses short-lived Google Cloud credentials from Workload Identity Federation and a dedicated Hosting deployment account.

When the application is ready, update `firebase.json` to point Hosting at its build output and run the build before deploying. Update the deployment check to match the app. Add Cloud Functions and Firestore to the workflow when their configuration and tests are in place.
