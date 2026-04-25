import { CONFIG } from './config.js';

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

function apiError(prefix, res) {
  const err = new Error(`${prefix}_${res.status}`);
  err.status = res.status;
  return err;
}

export async function uploadPhoto(accessToken, file) {
  const metadata = {
    name: `qcal-${Date.now()}-${file.name}`,
    parents: [CONFIG.DRIVE_FOLDER_ID],
    mimeType: file.type,
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(
    `${UPLOAD}/files?uploadType=multipart&fields=id,webViewLink,webContentLink`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  if (!res.ok) throw apiError('drive_upload', res);
  return res.json();
}

export async function setPublicPermission(accessToken, fileId) {
  const res = await fetch(`${BASE}/files/${encodeURIComponent(fileId)}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  if (!res.ok) throw apiError('drive_perm', res);
  return res.json();
}

export async function deletePhoto(accessToken, fileId) {
  const res = await fetch(`${BASE}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) throw apiError('drive_delete', res);
  return true;
}
