const BASE = 'https://www.googleapis.com/calendar/v3';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Retry GETs only: 429 with backoff (1s/2s/4s, max 3); 5xx once after 1s.
// Mutations (POST/PATCH/DELETE) intentionally don't retry — risk of duplicates.
async function fetchWithRetry(url, options) {
  const delays = [1000, 2000, 4000];
  let res = await fetch(url, options);
  for (let i = 0; i < delays.length && res.status === 429; i++) {
    await sleep(delays[i]);
    res = await fetch(url, options);
  }
  if (res.status >= 500 && res.status < 600) {
    await sleep(1000);
    res = await fetch(url, options);
  }
  return res;
}

async function apiGet(accessToken, path, params = {}) {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null));
  const qs = new URLSearchParams(cleaned).toString();
  const url = `${BASE}${path}${qs ? '?' + qs : ''}`;
  const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const err = new Error(`calendar_api_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function apiJson(accessToken, method, path, body, params = {}) {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null));
  const qs = new URLSearchParams(cleaned).toString();
  const url = `${BASE}${path}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`calendar_api_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export function createEvent(accessToken, calendarId, eventBody) {
  return apiJson(accessToken, 'POST', `/calendars/${encodeURIComponent(calendarId)}/events`, eventBody, { supportsAttachments: 'true' });
}

// supportsAttachments=true: required by Google whenever an event has attachments[]
// so the server preserves them across our PATCH (we never send the attachments field).
export function updateEvent(accessToken, calendarId, eventId, eventBody) {
  return apiJson(accessToken, 'PATCH', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, eventBody, { supportsAttachments: 'true' });
}

export function deleteEvent(accessToken, calendarId, eventId) {
  return apiJson(accessToken, 'DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, undefined, { supportsAttachments: 'true' });
}

export async function listMonthEvents(accessToken, calendars, year, month0) {
  const timeMin = new Date(year, month0, 1).toISOString();
  const timeMax = new Date(year, month0 + 1, 1).toISOString();
  const perCalendar = await Promise.all(
    calendars.map(c => listEvents(accessToken, c.id, { timeMin, timeMax, maxResults: 250 }))
  );
  return perCalendar.flat();
}

export async function listCalendars(accessToken, allowedIds) {
  const data = await apiGet(accessToken, '/users/me/calendarList');
  const writable = (data.items || []).filter(c => c.accessRole === 'owner' || c.accessRole === 'writer');
  if (!allowedIds || allowedIds.length === 0) return writable;
  const byId = new Map(writable.map(c => [c.id, c]));
  return allowedIds.map(id => byId.get(id)).filter(Boolean);
}

export async function listEvents(accessToken, calendarId, { timeMin, timeMax, maxResults = 10 } = {}) {
  const data = await apiGet(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
  });
  return (data.items || []).map(e => ({ ...e, calendarId }));
}

export async function listUpcomingEvents(accessToken, calendars, { days = 30, max = 10 } = {}) {
  const now = new Date();
  const later = new Date(now.getTime() + days * 86400000);
  const timeMin = now.toISOString();
  const timeMax = later.toISOString();
  const perCalendar = await Promise.all(
    calendars.map(c => listEvents(accessToken, c.id, { timeMin, timeMax, maxResults: max }))
  );
  const merged = perCalendar.flat();
  merged.sort((a, b) => {
    const ta = a.start?.dateTime || a.start?.date || '';
    const tb = b.start?.dateTime || b.start?.date || '';
    return ta.localeCompare(tb);
  });
  return merged.slice(0, max);
}
