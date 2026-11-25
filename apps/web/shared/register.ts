import { createUserWithEmailAndPassword, updateProfile, type User } from 'firebase/auth';
import { connect } from './firebase';

const form = document.querySelector<HTMLFormElement>('#registerForm')!;
const fields = form.querySelector<HTMLFieldSetElement>('.register-fields')!;
const submit = form.querySelector<HTMLButtonElement>('#regBtn')!;
const status = form.querySelector<HTMLElement>('#registerStatus')!;
const password = form.querySelector<HTMLInputElement>('#password')!;
const confirmation = form.querySelector<HTMLInputElement>('#confirmPass')!;
const visibility = form.querySelector<HTMLButtonElement>('#togglePassBtn')!;

let client: Awaited<ReturnType<typeof connect>> | undefined;
let account: { user: User; name: string; inviteCode: string } | undefined;

visibility.addEventListener('click', () => {
  const showing = password.type === 'text';
  password.type = showing ? 'password' : 'text';
  visibility.textContent = showing ? 'Show' : 'Hide';
  visibility.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
});

function clearConfirmationError() {
  confirmation.setCustomValidity('');
}

password.addEventListener('input', clearConfirmationError);
confirmation.addEventListener('input', clearConfirmationError);

function signupError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  switch (code) {
    case 'auth/email-already-in-use': return 'An account already uses this email. Sign in to continue.';
    case 'auth/invalid-email': return 'Enter a valid email address.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements': return 'Choose a different password that meets the account requirements.';
    case 'auth/too-many-requests': return 'Too many attempts. Wait a moment and try again.';
    default: return 'We could not create your account. Please try again.';
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled || !form.reportValidity()) return;
  if (!account && password.value !== confirmation.value) {
    confirmation.setCustomValidity('Passwords do not match.');
    confirmation.reportValidity();
    return;
  }

  const data = new FormData(form);
  submit.disabled = true;
  fields.disabled = true;
  status.textContent = '';
  submit.textContent = account ? 'Setting up workspace...' : 'Creating account...';

  try {
    client ??= await connect('user');
    if (!account) {
      const email = String(data.get('email')).trim();
      const name = String(data.get('name')).trim();
      const inviteCode = String(data.get('inviteCode')).trim();
      const { user } = await createUserWithEmailAndPassword(client.auth, email, password.value);
      account = { user, name, inviteCode };
    }

    if (account.user.displayName !== account.name) {
      await updateProfile(account.user, { displayName: account.name });
    }
    await client.call('access', { name: account.name, inviteCode: account.inviteCode });
    location.replace('/#trade');
  } catch (error) {
    status.textContent = account
      ? 'Your account is created. Retry to finish setting up your workspace.'
      : signupError(error);
    fields.disabled = !!account;
    submit.disabled = false;
    submit.textContent = account ? 'Retry workspace setup' : 'Create account';
  }
});

submit.disabled = false;
