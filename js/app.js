import { CONFIG } from './config.js';
import { initAuth, requestToken, fetchUserInfo } from './auth.js';
import { listCalendars, listUpcomingEvents, createEvent, updateEvent, deleteEvent, listMonthEvents } from './calendar.js';
import { uploadPhoto, setPublicPermission, deletePhoto } from './drive.js';
import {
  renderUpcomingEvents, renderUpcomingLoading, renderUpcomingError,
  renderForm, updatePickerLabels, showFormError, clearFormError,
  renderDatePicker, renderTimePicker, renderPhotos, renderColorPicker,
  renderEditDateSelector, renderDuplicateDateSelector, renderInlineEventList,
  setLoadingStep, renderSuccessSummary,
} from './ui.js';
import {
  todayISODate, buildRFC3339, addDaysISO, dateToISO, compressImage,
  parsePhotoLinksFromDescription, extractDriveFileId,
  formatThaiDateLong, groupEventsByDate,
} from './util.js';

const state = {
  user: null,
  accessToken: null,
  tokenExpiresAt: null,
  calendars: [],
  currentScreen: 'welcome',
  formMode: 'create',
  formEntry: null,
  editingEvent: null,
  formData: null,
  photosToDelete: [],
  datePicker: null,
  timePicker: null,
  editDateMonth: null,
  editListDate: null,
  deletingEvent: null,
  upcomingEvents: [],
  monthEvents: new Map(),
  duplicateDateMonth: null,
  duplicateMonthEvents: new Map(),
  duplicateListDate: null,
};

// ---- Swipe gesture (calendar grids) ----

// 50px threshold; |dx| must dominate |dy| to avoid hijacking vertical scroll.
// suppressClickAfterSwipe gates day-click callbacks for 100ms after a swipe so
// the trailing tap event doesn't double-fire as both swipe + day select.
let suppressClickAfterSwipe = false;

function bindSwipe(el, onLeft, onRight) {
  if (!el) return;
  let sx = 0, sy = 0, touchActive = false;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { touchActive = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    touchActive = true;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (!touchActive) return;
    touchActive = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      suppressClickAfterSwipe = true;
      setTimeout(() => { suppressClickAfterSwipe = false; }, 100);
      if (dx < 0) onLeft(); else onRight();
    }
  });

  // Mouse drag — desktop testing parity.
  let mx = 0, my = 0, dragging = false;
  el.addEventListener('mousedown', (e) => { mx = e.clientX; my = e.clientY; dragging = true; });
  el.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - mx, dy = e.clientY - my;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      suppressClickAfterSwipe = true;
      setTimeout(() => { suppressClickAfterSwipe = false; }, 100);
      if (dx < 0) onLeft(); else onRight();
    }
  });
}

// ---- Screen + modal helpers ----

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`screen-${name}`);
  if (target) {
    target.classList.add('active');
    state.currentScreen = name;
    window.scrollTo(0, 0);
  }
}
function showModal(id) { document.getElementById(id)?.classList.add('active'); }
function hideModal(id) { document.getElementById(id)?.classList.remove('active'); }

// ---- Auth error mapping ----

function setWelcomeError(msg) {
  const el = document.getElementById('welcomeError');
  if (!el) return;
  if (msg) { el.textContent = msg; el.classList.add('active'); }
  else { el.textContent = ''; el.classList.remove('active'); }
}

function friendlyAuthError(err) {
  const t = err?.message || '';
  if (t.includes('popup_closed') || t.includes('popup_failed')) return 'ยกเลิกการลงชื่อเข้าใช้';
  if (t.includes('access_denied')) return 'บัญชีนี้ไม่ได้รับอนุญาต — ตรวจสอบว่าเพิ่มเป็น test user ใน Google Cloud Console';
  if (t.includes('origin')) return 'URL นี้ไม่ได้อยู่ในรายการ Authorized JavaScript origins';
  if (t.includes('userinfo_')) return 'โหลดข้อมูลบัญชีไม่สำเร็จ ลองใหม่อีกครั้ง';
  return 'เกิดข้อผิดพลาด: ' + t;
}

function friendlyApiError(err) {
  const s = err?.status;
  if (s === 401) return 'เซสชันหมดอายุ — กรุณาลงชื่อเข้าใช้ใหม่';
  if (s === 403) return 'ไม่มีสิทธิ์ — ตรวจสอบการแชร์ปฏิทิน';
  if (s === 404) return 'event นี้ไม่มีอยู่แล้ว';
  if (s === 429) return 'ใช้งานถี่เกินไป — ลองใหม่ในอีกสักครู่';
  if (s >= 500 && s < 600) return 'Google มีปัญหา ลองใหม่อีกครั้ง';
  if (err?.name === 'TypeError' || /fetch|network/i.test(err?.message || '')) {
    return 'ไม่มีการเชื่อมต่อ — ตรวจสอบอินเทอร์เน็ต';
  }
  return 'เกิดข้อผิดพลาด: ' + (err?.message || 'unknown');
}

async function withFreshToken(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.status !== 401) throw err;
    try {
      const { accessToken, expiresAt } = await requestToken({ silent: true });
      state.accessToken = accessToken;
      state.tokenExpiresAt = expiresAt;
      return await fn();
    } catch (refreshErr) {
      // Silent refresh failed — boot back to welcome
      state.user = null;
      state.accessToken = null;
      state.tokenExpiresAt = null;
      state.calendars = [];
      state.upcomingEvents = [];
      state.monthEvents = new Map();
      showScreen('welcome');
      setWelcomeError('เซสชันหมดอายุ — กรุณาลงชื่อเข้าใช้ใหม่');
      throw err;
    }
  }
}

// ---- Home data ----

async function loadHomeData() {
  renderUpcomingLoading();
  try {
    const calendars = await withFreshToken(() => listCalendars(state.accessToken, CONFIG.ALLOWED_CALENDAR_IDS));
    state.calendars = calendars;
    const events = await withFreshToken(() => listUpcomingEvents(state.accessToken, calendars));
    state.upcomingEvents = events;
    renderUpcomingEvents(events, calendars, { onCardClick: (e) => openEditEvent(e, 'home') });
  } catch (err) {
    renderUpcomingError(friendlyApiError(err));
  }
}

// ---- Auth flow ----

async function completeSignIn(accessToken, expiresAt) {
  state.accessToken = accessToken;
  state.tokenExpiresAt = expiresAt;
  const info = await fetchUserInfo(accessToken);
  state.user = { email: info.email, name: info.name };
  document.getElementById('userEmail').textContent = info.email;
  showScreen('home');
  loadHomeData();
}

async function doSignIn() {
  setWelcomeError('');
  const btn = document.getElementById('signInBtn');
  btn.disabled = true;
  btn.textContent = 'กำลังลงชื่อเข้าใช้...';
  try {
    const { accessToken, expiresAt } = await requestToken({ silent: false });
    await completeSignIn(accessToken, expiresAt);
  } catch (err) {
    setWelcomeError(friendlyAuthError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in with Google';
  }
}

function doSignOut() {
  hideModal('signOutModal');
  state.user = null;
  state.accessToken = null;
  state.tokenExpiresAt = null;
  state.calendars = [];
  state.upcomingEvents = [];
  state.monthEvents = new Map();
  state.editListDate = null;
  state.duplicateDateMonth = null;
  state.duplicateMonthEvents = new Map();
  state.duplicateListDate = null;
  showScreen('welcome');
}

// ---- Form init ----

// Duration tracking: when the user changes START, end shifts to preserve the
// last-known duration; when the user changes END, duration is recaptured. Both
// ms and days are stored so toggling allDay has a sensible default for the
// newly-active mode without recomputing from history.
const DEFAULT_DURATION_MS = 3600000;     // 1 hour
const DEFAULT_DURATION_DAYS = 0;          // single-day all-day = "1 day"

const clampPlusHour = (h, m) => (h + 1 >= 24) ? { h: 23, m: 59 } : { h: h + 1, m };

function localDateTime(isoDate, time) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  return new Date(y, mo - 1, d, time.h, time.m, 0);
}

function daysBetweenISO(startISO, endISO) {
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  const s = new Date(sy, sm - 1, sd);
  const e = new Date(ey, em - 1, ed);
  return Math.round((e - s) / 86400000);
}

function applyDurationToEnd() {
  const f = state.formData;
  if (f.allDay) {
    f.endDate = addDaysISO(f.startDate, Math.max(0, f.durationDays | 0));
  } else {
    const startDT = localDateTime(f.startDate, f.startTime);
    const endDT = new Date(startDT.getTime() + Math.max(0, f.durationMs || 0));
    f.endDate = dateToISO(endDT);
    f.endTime = { h: endDT.getHours(), m: endDT.getMinutes() };
  }
}

function recaptureDuration() {
  const f = state.formData;
  if (f.allDay) {
    f.durationDays = Math.max(0, daysBetweenISO(f.startDate, f.endDate));
  } else {
    const startDT = localDateTime(f.startDate, f.startTime);
    const endDT = localDateTime(f.endDate, f.endTime);
    f.durationMs = Math.max(0, endDT.getTime() - startDT.getTime());
  }
}

function revokePriorBlobs() {
  if (state.formData?.photos) {
    for (const p of state.formData.photos) {
      if (p.localUrl) URL.revokeObjectURL(p.localUrl);
    }
  }
}

function initNewForm() {
  revokePriorBlobs();
  const today = todayISODate();
  state.formMode = 'create';
  state.formEntry = 'home';
  state.editingEvent = null;
  state.photosToDelete = [];
  state.formData = {
    title: '',
    calendarId: state.calendars[0]?.id || '',
    startDate: today,
    endDate: today,
    startTime: { h: 10, m: 0 },
    endTime: { h: 11, m: 0 },
    allDay: false,
    location: '',
    description: '',
    reminderMin: null,
    colorId: null,
    photos: [],
    attachments: [],
    duplicateSourceHadAttachments: false,
    durationMs: DEFAULT_DURATION_MS,
    durationDays: DEFAULT_DURATION_DAYS,
  };
  document.getElementById('fCalendar').disabled = false;
  renderForm(state);
}

function eventToFormData(event, calendarId) {
  const allDay = !!(event.start?.date);
  let startDate, endDate, startTime, endTime;
  if (allDay) {
    startDate = event.start.date;
    endDate = addDaysISO(event.end.date, -1);
    startTime = { h: 10, m: 0 };
    endTime = { h: 11, m: 0 };
  } else {
    const s = new Date(event.start.dateTime);
    const e = new Date(event.end.dateTime);
    startDate = dateToISO(s);
    endDate = dateToISO(e);
    startTime = { h: s.getHours(), m: s.getMinutes() };
    endTime = { h: e.getHours(), m: e.getMinutes() };
  }
  const { userDesc, links } = parsePhotoLinksFromDescription(event.description || '');
  const photos = links.map(link => {
    const fileId = extractDriveFileId(link);
    return {
      file: null,
      localUrl: null,
      driveFileId: fileId,
      driveLink: link,
      thumbUrl: fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w200` : link,
      name: 'photo',
    };
  });
  let reminderMin = null;
  const override = event.reminders?.overrides?.find(o => o.method === 'popup');
  if (override) reminderMin = override.minutes;
  // Read-only carry of native Calendar attachments[]. Never sent in the PATCH
  // payload — supportsAttachments=true on PATCH tells Google to preserve them.
  const attachments = (event.attachments || []).map(a => ({
    fileId: a.fileId || null,
    fileUrl: a.fileUrl || '',
    title: a.title || 'attachment',
    mimeType: a.mimeType || '',
    iconLink: a.iconLink || '',
  }));
  // Capture duration in BOTH units. Active mode uses the matching one; the
  // inactive one falls back to a sane default (1hr) so allDay-toggle works.
  const durationDays = Math.max(0, daysBetweenISO(startDate, endDate));
  let durationMs = DEFAULT_DURATION_MS;
  if (!allDay) {
    const sDT = localDateTime(startDate, startTime);
    const eDT = localDateTime(endDate, endTime);
    durationMs = Math.max(0, eDT.getTime() - sDT.getTime());
  }
  return {
    title: event.summary || '',
    calendarId,
    startDate, endDate, startTime, endTime, allDay,
    location: event.location || '',
    description: userDesc,
    reminderMin,
    colorId: event.colorId || null,
    photos,
    attachments,
    duplicateSourceHadAttachments: false,
    durationMs,
    durationDays,
  };
}

function openEditEvent(event, entry = 'home') {
  if (!event?.id || !event?.calendarId) return;
  revokePriorBlobs();
  state.formMode = 'edit';
  state.formEntry = entry;
  state.editingEvent = { id: event.id, calendarId: event.calendarId };
  state.photosToDelete = [];
  state.formData = eventToFormData(event, event.calendarId);
  // Calendar move requires delete+create — out of scope; lock the select
  document.getElementById('fCalendar').disabled = true;
  renderForm(state);
  showScreen('add');
}

function openDuplicateEvent(event) {
  if (!event?.id || !event?.calendarId) return;
  revokePriorBlobs();
  // Duplicate creates a new event → formMode='create' so submit POSTs.
  // formEntry='duplicate' drives back routing, form labels, success buttons.
  state.formMode = 'create';
  state.formEntry = 'duplicate';
  state.editingEvent = null;
  state.photosToDelete = [];
  state.formData = eventToFormData(event, event.calendarId);
  // Drop native Calendar attachments[] (tied to original; copy needs Drive perms).
  // Surface a one-line note in the form when source had any.
  const hadAttachments = state.formData.attachments.length > 0;
  state.formData.attachments = [];
  state.formData.duplicateSourceHadAttachments = hadAttachments;
  document.getElementById('fCalendar').disabled = false;
  renderForm(state);
  showScreen('add');
}

function openNewEvent() {
  if (!state.calendars || state.calendars.length === 0) {
    document.getElementById('toastMsg').textContent = 'ไม่พบปฏิทินที่แก้ไขได้';
    showModal('toastModal');
    return;
  }
  initNewForm();
  showScreen('add');
}

// ---- Date picker ----

function openDatePicker(target) {
  const src = target === 'start' ? state.formData.startDate : state.formData.endDate;
  let selectedDate = src;
  let minDate = null;
  if (target === 'end') {
    // Auto-adjust rule 2: pre-position end ≥ start; disable earlier days
    minDate = state.formData.startDate;
    if (selectedDate < minDate) selectedDate = minDate;
  }
  const [y, m] = selectedDate.split('-').map(Number);
  state.datePicker = {
    target,
    viewYear: y,
    viewMonth: m - 1,
    selectedDate,
    minDate,
  };
  document.getElementById('dateTitle').textContent = target === 'start' ? 'วันที่เริ่ม' : 'ถึงวันที่';
  rebindDatePicker();
  showScreen('pick-date');
}

function rebindDatePicker() {
  renderDatePicker(state, {
    onDayClick: (isoDate) => {
      state.datePicker.selectedDate = isoDate;
      rebindDatePicker();
    },
  });
}

function saveDatePicker() {
  const { target, selectedDate } = state.datePicker;
  const f = state.formData;
  if (target === 'start') {
    f.startDate = selectedDate;
    applyDurationToEnd();
    // Defensive: if duration somehow leaves end before start, snap end = start
    if (f.endDate < f.startDate) f.endDate = f.startDate;
  } else {
    f.endDate = selectedDate;
    recaptureDuration();
  }
  updatePickerLabels(state);
  showScreen('add');
}

function navMonth(delta) {
  const dp = state.datePicker;
  dp.viewMonth += delta;
  if (dp.viewMonth < 0) { dp.viewMonth = 11; dp.viewYear -= 1; }
  else if (dp.viewMonth > 11) { dp.viewMonth = 0; dp.viewYear += 1; }
  rebindDatePicker();
}

// ---- Time picker ----

function openTimePicker(target) {
  const time = target === 'start' ? state.formData.startTime : state.formData.endTime;
  state.timePicker = { target, hour: time.h, minute: time.m, mode: 'hour' };
  document.getElementById('timeTitle').textContent = target === 'start' ? 'เวลาเริ่ม' : 'เวลาสิ้นสุด';
  rebindTimePicker();
  showScreen('pick-time');
}

function rebindTimePicker() {
  renderTimePicker(state, {
    onHour: (h) => {
      state.timePicker.hour = h;
      state.timePicker.mode = 'minute';
      rebindTimePicker();
    },
    onMinute: (m) => {
      state.timePicker.minute = m;
      rebindTimePicker();
    },
  });
}

function saveTimePicker() {
  const { target, hour, minute } = state.timePicker;
  const f = state.formData;
  if (target === 'start') {
    f.startTime = { h: hour, m: minute };
    // Shift end by stored duration (replaces former rule 3 hard-coded +1hr)
    applyDurationToEnd();
    // Defensive (former rule 4): if same-day duration is 0/negative, fall back to +1h
    if (f.startDate === f.endDate) {
      const sMin = f.startTime.h * 60 + f.startTime.m;
      const eMin = f.endTime.h * 60 + f.endTime.m;
      if (eMin <= sMin) f.endTime = clampPlusHour(f.startTime.h, f.startTime.m);
    }
  } else {
    const sameDay = f.startDate === f.endDate;
    const sMin = f.startTime.h * 60 + f.startTime.m;
    const eMin = hour * 60 + minute;
    if (sameDay && eMin <= sMin) {
      // Rule 4: overwrite with startTime + 1h
      f.endTime = clampPlusHour(f.startTime.h, f.startTime.m);
    } else {
      f.endTime = { h: hour, m: minute };
    }
    recaptureDuration();
  }
  updatePickerLabels(state);
  showScreen('add');
}

// ---- Submit ----

function buildEventPayload(formData, isEdit = false) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Bangkok';
  // Always include description/location/reminders so PATCH can clear them.
  // Google Calendar PATCH (RFC 7396 JSON Merge Patch) treats omitted fields as
  // "leave unchanged" and merges nested objects — so toggling all-day requires
  // explicit nulls on the inverse start/end sub-fields to drop the stale shape.
  const payload = {
    summary: formData.title,
    description: formData.description || '',
    location: formData.location || '',
  };
  if (formData.allDay) {
    payload.start = { date: formData.startDate };
    payload.end = { date: addDaysISO(formData.endDate, 1) };
    if (isEdit) {
      payload.start.dateTime = null;
      payload.start.timeZone = null;
      payload.end.dateTime = null;
      payload.end.timeZone = null;
    }
  } else {
    payload.start = { dateTime: buildRFC3339(formData.startDate, formData.startTime), timeZone: tz };
    payload.end = { dateTime: buildRFC3339(formData.endDate, formData.endTime), timeZone: tz };
    if (isEdit) {
      payload.start.date = null;
      payload.end.date = null;
    }
  }
  payload.reminders = (formData.reminderMin != null)
    ? { useDefault: false, overrides: [{ method: 'popup', minutes: formData.reminderMin }] }
    : { useDefault: false, overrides: [] };
  payload.colorId = formData.colorId || null;
  return payload;
}

function syncFormInputsToState() {
  const f = state.formData;
  f.title = document.getElementById('fTitle').value.trim();
  f.calendarId = document.getElementById('fCalendar').value;
  f.location = document.getElementById('fLocation').value.trim();
  f.description = document.getElementById('fDescription').value.trim();
  const r = document.getElementById('fReminder').value;
  f.reminderMin = r ? Number(r) : null;
}

function buildDescriptionWithPhotos(userDesc, links) {
  if (!links || links.length === 0) return userDesc;
  const block = '📸 รูปภาพ:\n' + links.join('\n');
  return userDesc ? `${userDesc}\n\n${block}` : block;
}

async function uploadOnePhoto(photo) {
  const compressed = await compressImage(photo.file);
  const meta = await withFreshToken(() => uploadPhoto(state.accessToken, compressed));
  await withFreshToken(() => setPublicPermission(state.accessToken, meta.id));
  return { id: meta.id, link: meta.webViewLink || meta.webContentLink };
}

async function submitEvent() {
  syncFormInputsToState();
  const f = state.formData;
  if (!f.title) return showFormError('กรอกชื่อกิจกรรม');
  if (!f.calendarId) return showFormError('เลือกปฏิทิน');
  clearFormError();

  const newPhotos = f.photos.filter(p => p.file);
  const existingLinks = f.photos.filter(p => !p.file && p.driveLink).map(p => p.driveLink);
  const hasUploads = newPhotos.length > 0;
  const isEdit = state.formMode === 'edit';

  setLoadingStep({
    upload: hasUploads ? 'active' : 'done',
    create: hasUploads ? null : 'active',
    done: null,
  });
  showScreen('loading');

  try {
    const uploadedLinks = [];
    if (hasUploads) {
      const results = await Promise.all(newPhotos.map(uploadOnePhoto));
      uploadedLinks.push(...results.map(r => r.link));
      setLoadingStep({ upload: 'done', create: 'active', done: null });
    }

    const allLinks = [...existingLinks, ...uploadedLinks];
    const desc = buildDescriptionWithPhotos(f.description, allLinks);
    const payload = buildEventPayload({ ...f, description: desc }, isEdit);

    let saved;
    if (isEdit) {
      const { calendarId, id } = state.editingEvent;
      saved = await withFreshToken(() => updateEvent(state.accessToken, calendarId, id, payload));
      // Best-effort Drive cleanup of removed existing photos (SPEC §9.3 step 7)
      for (const fileId of state.photosToDelete) {
        try { await withFreshToken(() => deletePhoto(state.accessToken, fileId)); }
        catch (_) { /* swallow per spec: best effort */ }
      }
      saved.calendarId = calendarId;
    } else {
      saved = await withFreshToken(() => createEvent(state.accessToken, f.calendarId, payload));
    }

    setLoadingStep({ upload: 'done', create: 'done', done: 'done' });
    const calendar = state.calendars.find(c => c.id === (saved.calendarId || f.calendarId));
    renderSuccessSummary(saved, calendar, allLinks.length);
    document.getElementById('successBackToEditList').style.display =
      state.formEntry === 'edit-list' ? '' : 'none';
    document.getElementById('successBackToDup').style.display =
      state.formEntry === 'duplicate' ? '' : 'none';
    showScreen('success');
    loadHomeData();
  } catch (err) {
    showScreen('add');
    showFormError('บันทึกไม่สำเร็จ: ' + friendlyApiError(err));
  }
}

// ---- Edit/Delete (merged screen) + Duplicate Date Selector ----

function openEditDateSelector() {
  if (!state.editDateMonth) {
    const t = new Date();
    state.editDateMonth = { viewYear: t.getFullYear(), viewMonth: t.getMonth() };
  }
  state.editListDate = null;
  document.getElementById('editEventList').replaceChildren();
  showScreen('edit-date');
  rebindEditDateSelector();
  loadMonthEvents();
}

function rebindEditDateSelector() {
  renderEditDateSelector(state, { onDayClick: handleEditDayClick });
}

function handleEditDayClick(isoDate) {
  if (suppressClickAfterSwipe) return;
  selectEditDate(isoDate);
}

function selectEditDate(isoDate) {
  state.editListDate = isoDate;
  rebindEditDateSelector();
  renderInlineEditList();
}

function renderInlineEditList() {
  const date = state.editListDate;
  const events = date ? (state.monthEvents.get(date) || []) : null;
  renderInlineEventList({
    container: document.getElementById('editEventList'),
    events,
    calendars: state.calendars,
    mode: 'edit',
    dateLabel: date ? formatThaiDateLong(date) : null,
    callbacks: {
      onEdit: (e) => openEditEvent(e, 'edit-list'),
      onDelete: showDeleteConfirm,
    },
  });
}

async function loadMonthEvents() {
  const loader = document.getElementById('editDateLoading');
  if (loader) loader.style.display = 'block';
  try {
    const { viewYear, viewMonth } = state.editDateMonth;
    const events = await withFreshToken(() => listMonthEvents(state.accessToken, state.calendars, viewYear, viewMonth));
    state.monthEvents = groupEventsByDate(events);
    rebindEditDateSelector();
    renderInlineEditList();
  } catch (err) {
    showToast(friendlyApiError(err));
  } finally {
    if (loader) loader.style.display = 'none';
  }
}

function navMonthEditDate(delta) {
  const m = state.editDateMonth;
  m.viewMonth += delta;
  if (m.viewMonth < 0) { m.viewMonth = 11; m.viewYear -= 1; }
  else if (m.viewMonth > 11) { m.viewMonth = 0; m.viewYear += 1; }
  state.monthEvents = new Map();
  state.editListDate = null;
  document.getElementById('editEventList').replaceChildren();
  rebindEditDateSelector();
  loadMonthEvents();
}

// ---- Duplicate Date Selector ----

function openDuplicateDateSelector() {
  if (!state.duplicateDateMonth) {
    const t = new Date();
    state.duplicateDateMonth = { viewYear: t.getFullYear(), viewMonth: t.getMonth() };
  }
  state.duplicateListDate = null;
  document.getElementById('dupEventList').replaceChildren();
  showScreen('duplicate-date');
  rebindDuplicateDateSelector();
  loadMonthEventsDup();
}

function rebindDuplicateDateSelector() {
  renderDuplicateDateSelector(state, { onDayClick: handleDupDayClick });
}

function handleDupDayClick(isoDate) {
  if (suppressClickAfterSwipe) return;
  selectDuplicateDate(isoDate);
}

function selectDuplicateDate(isoDate) {
  state.duplicateListDate = isoDate;
  rebindDuplicateDateSelector();
  renderInlineDupList();
}

function renderInlineDupList() {
  const date = state.duplicateListDate;
  const events = date ? (state.duplicateMonthEvents.get(date) || []) : null;
  renderInlineEventList({
    container: document.getElementById('dupEventList'),
    events,
    calendars: state.calendars,
    mode: 'duplicate',
    dateLabel: date ? formatThaiDateLong(date) : null,
    callbacks: { onDuplicate: openDuplicateEvent },
  });
}

async function loadMonthEventsDup() {
  const loader = document.getElementById('dupDateLoading');
  if (loader) loader.style.display = 'block';
  try {
    const { viewYear, viewMonth } = state.duplicateDateMonth;
    const events = await withFreshToken(() => listMonthEvents(state.accessToken, state.calendars, viewYear, viewMonth));
    state.duplicateMonthEvents = groupEventsByDate(events);
    rebindDuplicateDateSelector();
    renderInlineDupList();
  } catch (err) {
    showToast(friendlyApiError(err));
  } finally {
    if (loader) loader.style.display = 'none';
  }
}

function navMonthDuplicate(delta) {
  const m = state.duplicateDateMonth;
  m.viewMonth += delta;
  if (m.viewMonth < 0) { m.viewMonth = 11; m.viewYear -= 1; }
  else if (m.viewMonth > 11) { m.viewMonth = 0; m.viewYear += 1; }
  state.duplicateMonthEvents = new Map();
  state.duplicateListDate = null;
  document.getElementById('dupEventList').replaceChildren();
  rebindDuplicateDateSelector();
  loadMonthEventsDup();
}

function jumpToTodayDup() {
  const t = new Date();
  state.duplicateDateMonth = { viewYear: t.getFullYear(), viewMonth: t.getMonth() };
  state.duplicateMonthEvents = new Map();
  state.duplicateListDate = null;
  document.getElementById('dupEventList').replaceChildren();
  rebindDuplicateDateSelector();
  loadMonthEventsDup();
}

function showDeleteConfirm(event) {
  state.deletingEvent = event;
  document.getElementById('confirmDeleteMsg').textContent = `"${event.summary || '(ไม่มีชื่อ)'}" จะถูกลบถาวร`;
  showModal('confirmDeleteModal');
}

async function confirmDelete() {
  hideModal('confirmDeleteModal');
  const event = state.deletingEvent;
  state.deletingEvent = null;
  if (!event) return;

  // Delete the calendar event FIRST and only proceed once the server confirms.
  // Drive cleanup of description-photos runs after, best-effort. attachments[]
  // files are not touched — those aren't owned by the PWA.
  try {
    await withFreshToken(() => deleteEvent(state.accessToken, event.calendarId, event.id));
  } catch (err) {
    if (err.status === 404) {
      // Already deleted elsewhere — treat as success.
    } else {
      // Surface the failure and keep the event visible — local state untouched.
      showToast('ลบไม่สำเร็จ: ' + friendlyApiError(err));
      return;
    }
  }

  const { links } = parsePhotoLinksFromDescription(event.description || '');
  const fileIds = links.map(extractDriveFileId).filter(Boolean);
  for (const fileId of fileIds) {
    try { await withFreshToken(() => deletePhoto(state.accessToken, fileId)); }
    catch (_) { /* SPEC §9.4: best-effort cleanup */ }
  }

  showToast(`ลบ "${event.summary || '(ไม่มีชื่อ)'}" แล้ว`);
  await loadMonthEvents();
  loadHomeData();
}

function showToast(msg) {
  document.getElementById('toastMsg').textContent = msg;
  showModal('toastModal');
  setTimeout(() => hideModal('toastModal'), 2500);
}

function jumpToToday() {
  const t = new Date();
  state.editDateMonth = { viewYear: t.getFullYear(), viewMonth: t.getMonth() };
  state.monthEvents = new Map();
  state.editListDate = null;
  document.getElementById('editEventList').replaceChildren();
  rebindEditDateSelector();
  loadMonthEvents();
}

function jumpDatePickerToToday() {
  const t = new Date();
  const todayIso = todayISODate();
  state.datePicker.viewYear = t.getFullYear();
  state.datePicker.viewMonth = t.getMonth();
  // Respect minDate (end-date picker may forbid today)
  if (!state.datePicker.minDate || todayIso >= state.datePicker.minDate) {
    state.datePicker.selectedDate = todayIso;
  }
  rebindDatePicker();
}

function formBack() {
  // Cancel from form (no save): preserve list state, just navigate.
  if (state.formEntry === 'duplicate') {
    showScreen('duplicate-date');
    rebindDuplicateDateSelector();
    renderInlineDupList();
  } else if (state.formEntry === 'edit-list') {
    showScreen('edit-date');
    rebindEditDateSelector();
    renderInlineEditList();
  } else {
    showScreen('home');
  }
}

function backToEditFlow() {
  const date = state.formData?.startDate;
  if (date) {
    const [y, m] = date.split('-').map(Number);
    state.editDateMonth = { viewYear: y, viewMonth: m - 1 };
    state.monthEvents = new Map();
    state.editListDate = date;
  }
  document.getElementById('editEventList').replaceChildren();
  showScreen('edit-date');
  rebindEditDateSelector();
  loadMonthEvents();
}

function backToDuplicateFlow() {
  const date = state.formData?.startDate;
  if (date) {
    const [y, m] = date.split('-').map(Number);
    state.duplicateDateMonth = { viewYear: y, viewMonth: m - 1 };
    state.duplicateMonthEvents = new Map();
    state.duplicateListDate = date;
  }
  document.getElementById('dupEventList').replaceChildren();
  showScreen('duplicate-date');
  rebindDuplicateDateSelector();
  loadMonthEventsDup();
}

function goHome() {
  if (state.formData?.photos) {
    for (const p of state.formData.photos) {
      if (p.localUrl) URL.revokeObjectURL(p.localUrl);
    }
  }
  state.deletingEvent = null;
  state.editListDate = null;
  state.duplicateListDate = null;
  hideModal('confirmDeleteModal');
  hideModal('toastModal');
  hideModal('signOutModal');
  document.getElementById('colorDropdown')?.classList.remove('active');
  showScreen('home');
}

// ---- Actions ----

function handleAction(action, el) {
  switch (action) {
    case 'signin': doSignIn(); break;
    case 'open-signout': showModal('signOutModal'); break;
    case 'cancel-signout': hideModal('signOutModal'); break;
    case 'confirm-signout': doSignOut(); break;
    case 'cancel-delete': hideModal('confirmDeleteModal'); state.deletingEvent = null; break;
    case 'confirm-delete': confirmDelete(); break;
    case 'dismiss-toast': hideModal('toastModal'); break;
    case 'open-edit-date': openEditDateSelector(); break;
    case 'open-duplicate': openDuplicateDateSelector(); break;
    case 'prev-month-edit': navMonthEditDate(-1); break;
    case 'next-month-edit': navMonthEditDate(+1); break;
    case 'prev-month-dup': navMonthDuplicate(-1); break;
    case 'next-month-dup': navMonthDuplicate(+1); break;
    case 'jump-today': jumpToToday(); break;
    case 'jump-today-dup': jumpToTodayDup(); break;
    case 'jump-today-picker': jumpDatePickerToToday(); break;
    case 'form-back': formBack(); break;
    case 'back-to-edit-flow': backToEditFlow(); break;
    case 'back-to-duplicate-flow': backToDuplicateFlow(); break;
    case 'go-home': goHome(); break;
    case 'toggle-color-picker': document.getElementById('colorDropdown').classList.toggle('active'); break;
    case 'select-color': {
      const id = el.dataset.colorId || '';
      state.formData.colorId = id || null;
      document.getElementById('colorDropdown').classList.remove('active');
      renderColorPicker(state);
      break;
    }
    case 'install-pwa': installPwa(); break;
    case 'dismiss-install': dismissInstall(); break;
    case 'dismiss-ios-install': hideModal('iosInstallModal'); break;
    case 'new-event': openNewEvent(); break;
    case 'open-date': openDatePicker(el.dataset.target); break;
    case 'open-time': openTimePicker(el.dataset.target); break;
    case 'cancel-picker': showScreen('add'); break;
    case 'save-date': saveDatePicker(); break;
    case 'save-time': saveTimePicker(); break;
    case 'prev-month': navMonth(-1); break;
    case 'next-month': navMonth(+1); break;
    case 'time-mode-hour': state.timePicker.mode = 'hour'; rebindTimePicker(); break;
    case 'time-mode-minute': state.timePicker.mode = 'minute'; rebindTimePicker(); break;
    case 'toggle-allday': {
      // Rules 5+6: silent toggle. Recompute the now-active duration so a
      // subsequent start change shifts end correctly.
      const f = state.formData;
      const wasAllDay = f.allDay;
      f.allDay = document.getElementById('fAllDay').checked;
      document.getElementById('fTimeRow').style.display = f.allDay ? 'none' : '';
      if (!wasAllDay && f.allDay) {
        // timed → all-day: keep date span, refresh days from current dates
        f.durationDays = Math.max(0, daysBetweenISO(f.startDate, f.endDate));
      } else if (wasAllDay && !f.allDay) {
        // all-day → timed: collapse to a single 1hr block (multi-day timed
        // is rarely what the user wants here)
        f.endDate = f.startDate;
        f.endTime = clampPlusHour(f.startTime.h, f.startTime.m);
        f.durationMs = DEFAULT_DURATION_MS;
        updatePickerLabels(state);
      }
      break;
    }
    case 'remove-photo': {
      const idx = Number(el.dataset.idx);
      const p = state.formData.photos[idx];
      if (p?.localUrl) URL.revokeObjectURL(p.localUrl);
      // For existing Drive photos in EDIT mode, queue for delete on save.
      // In DUPLICATE mode the photos still belong to the source event — never queue.
      if (p && !p.file && p.driveFileId && state.formMode === 'edit') {
        state.photosToDelete.push(p.driveFileId);
      }
      state.formData.photos.splice(idx, 1);
      renderPhotos(state.formData.photos, state.formData.attachments);
      break;
    }
    case 'submit-event': submitEvent(); break;
  }
}

document.addEventListener('click', (e) => {
  // Close color dropdown when clicking outside it
  if (!e.target.closest('.color-picker')) {
    document.getElementById('colorDropdown')?.classList.remove('active');
  }
  const navEl = e.target.closest('[data-nav]');
  if (navEl) { showScreen(navEl.dataset.nav); return; }
  const actionEl = e.target.closest('[data-action]');
  if (actionEl) handleAction(actionEl.dataset.action, actionEl);
});

// ---- Bootstrap ----

// ---- PWA install ----

let deferredInstall = null;

function setupInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    if (sessionStorage.getItem('install_dismissed') !== '1') {
      document.getElementById('installBanner')?.classList.add('active');
    }
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    document.getElementById('installBanner')?.classList.remove('active');
  });
  // iOS Safari doesn't fire beforeinstallprompt — show one-time tutorial
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isIOS && !isStandalone && sessionStorage.getItem('ios_install_seen') !== '1') {
    setTimeout(() => {
      showModal('iosInstallModal');
      sessionStorage.setItem('ios_install_seen', '1');
    }, 2000);
  }
}

async function installPwa() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice.catch(() => {});
  deferredInstall = null;
  document.getElementById('installBanner')?.classList.remove('active');
}

function dismissInstall() {
  document.getElementById('installBanner')?.classList.remove('active');
  sessionStorage.setItem('install_dismissed', '1');
}

function initPhotoInputs() {
  const onChange = (ev) => {
    for (const file of ev.target.files || []) {
      state.formData.photos.push({
        file,
        localUrl: URL.createObjectURL(file),
        name: file.name,
        driveFileId: null,
        driveLink: null,
      });
    }
    renderPhotos(state.formData.photos, state.formData.attachments);
    ev.target.value = '';
  };
  document.getElementById('fCam').addEventListener('change', onChange);
  document.getElementById('fGal').addEventListener('change', onChange);
}

function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

async function bootstrap() {
  setupServiceWorker();
  initPhotoInputs();
  setupInstall();
  bindSwipe(document.getElementById('editDateGrid'), () => navMonthEditDate(+1), () => navMonthEditDate(-1));
  bindSwipe(document.getElementById('dupDateGrid'),  () => navMonthDuplicate(+1), () => navMonthDuplicate(-1));
  try {
    await initAuth();
    const btn = document.getElementById('signInBtn');
    btn.disabled = false;
    btn.textContent = 'Sign in with Google';
  } catch (err) {
    setWelcomeError('โหลด Google Identity Services ไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ');
    document.getElementById('screen-welcome').classList.remove('welcome-pending');
    return;
  }
  document.getElementById('screen-welcome').classList.remove('welcome-pending');
}

bootstrap();
