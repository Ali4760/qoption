import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { connect } from './firebase';

function initRegister() {
  const form = document.getElementById('registerForm') as HTMLFormElement | null;
  const btn = document.getElementById('regBtn') as HTMLButtonElement | null;
  const alertBox = document.getElementById('alertBox') as HTMLDivElement | null;
  const togglePassBtn = document.getElementById('togglePassBtn') as HTMLButtonElement | null;
  const passwordInput = document.getElementById('password') as HTMLInputElement | null;

  if (togglePassBtn && passwordInput) {
    togglePassBtn.addEventListener('click', () => {
      const isPass = passwordInput.type === 'password';
      passwordInput.type = isPass ? 'text' : 'password';
      togglePassBtn.innerHTML = isPass ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
    });
  }

  if (!form || !btn || !alertBox) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = (document.getElementById('fullName') as HTMLInputElement).value.trim();
    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('password') as HTMLInputElement).value;
    const confirmPass = (document.getElementById('confirmPass') as HTMLInputElement).value;
    const inviteCode = (document.getElementById('inviteCode') as HTMLInputElement).value.trim();

    alertBox.classList.add('d-none');
    alertBox.classList.remove('alert-success');
    alertBox.classList.add('alert-danger');

    if (password !== confirmPass) {
      alertBox.textContent = 'Passwords do not match.';
      alertBox.classList.remove('d-none');
      return;
    }

    if (password.length < 6) {
      alertBox.textContent = 'Password must be at least 6 characters.';
      alertBox.classList.remove('d-none');
      return;
    }

    btn.disabled = true;
    const originalBtnHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Creating account...';

    try {
      const api = await connect('user');
      const credential = await createUserWithEmailAndPassword(api.auth, email, password);
      const user = credential.user;

      if (fullName) {
        await updateProfile(user, { displayName: fullName });
      }

      // Initialize the user workspace profile and demo wallet in Firestore
      try {
        await api.call('access', { name: fullName, inviteCode });
      } catch (accessErr) {
        console.warn('Workspace initial setup note:', accessErr);
      }

      alertBox.classList.remove('alert-danger');
      alertBox.classList.add('alert-success');
      alertBox.textContent = 'Account created successfully! Opening your trading workspace...';
      alertBox.classList.remove('d-none');

      setTimeout(() => {
        window.location.href = '/#trade';
      }, 1200);
    } catch (err: any) {
      let message = err.message || 'Registration failed. Please check your details and try again.';
      if (err.code === 'auth/email-already-in-use') {
        message = 'An account with this email already exists. Please sign in instead.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please provide a valid email address.';
      } else if (err.code === 'auth/weak-password') {
        message = 'Password is too weak. Please use at least 6 characters.';
      }
      alertBox.textContent = message;
      alertBox.classList.remove('d-none');
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRegister);
} else {
  initRegister();
}
