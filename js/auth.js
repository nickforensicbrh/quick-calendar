import { CONFIG } from './config.js';

let tokenClient = null;
let pendingResolve = null;
let pendingReject = null;

function waitForGIS() {
  return new Promise((resolve) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const iv = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(iv);
        resolve();
      }
    }, 50);
  });
}

function handleTokenResponse(response) {
  const r = pendingResolve;
  const rj = pendingReject;
  pendingResolve = null;
  pendingReject = null;
  if (response.error) {
    rj?.(new Error(response.error_description || response.error));
    return;
  }
  r?.({
    accessToken: response.access_token,
    expiresAt: Date.now() + Number(response.expires_in) * 1000,
  });
}

function handleErrorCallback(err) {
  const rj = pendingReject;
  pendingResolve = null;
  pendingReject = null;
  rj?.(new Error(err?.type || 'popup_closed'));
}

export async function initAuth() {
  await waitForGIS();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.OAUTH_CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: handleTokenResponse,
    error_callback: handleErrorCallback,
  });
}

export function requestToken({ silent = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error('auth_not_initialized'));
    pendingResolve = resolve;
    pendingReject = reject;
    tokenClient.requestAccessToken({ prompt: silent ? 'none' : '' });
  });
}

export async function fetchUserInfo(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo_${res.status}`);
  return res.json();
}
