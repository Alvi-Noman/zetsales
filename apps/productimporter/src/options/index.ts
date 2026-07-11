import { login } from '../lib/apiClient.js';
import { getSession, setSession, clearSession } from '../lib/storage.js';

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in options.html`);
  return found as T;
}

const loggedOutEl = el<HTMLDivElement>('loggedOut');
const loggedInEl = el<HTMLDivElement>('loggedIn');
const loggedInEmailEl = el<HTMLElement>('loggedInEmail');
const statusEl = el<HTMLDivElement>('status');

async function render() {
  const session = await getSession();
  if (session) {
    loggedOutEl.style.display = 'none';
    loggedInEl.style.display = 'block';
    loggedInEmailEl.textContent = session.email;
  } else {
    loggedOutEl.style.display = 'block';
    loggedInEl.style.display = 'none';
  }
}

el<HTMLButtonElement>('loginButton').addEventListener('click', async () => {
  const email = el<HTMLInputElement>('email').value.trim();
  const password = el<HTMLInputElement>('password').value;
  const apiBaseUrl = el<HTMLInputElement>('apiBaseUrl').value.trim();
  const appBaseUrl = el<HTMLInputElement>('appBaseUrl').value.trim();

  if (!email || !password) {
    statusEl.textContent = 'Email and password are required.';
    return;
  }

  statusEl.textContent = 'Logging in…';
  try {
    const result = await login(email, password, apiBaseUrl);
    await setSession({ ...result, apiBaseUrl, appBaseUrl });
    statusEl.textContent = '';
    await render();
  } catch (err) {
    statusEl.textContent = (err as Error).message;
  }
});

el<HTMLButtonElement>('logoutButton').addEventListener('click', async () => {
  await clearSession();
  await render();
});

void render();
