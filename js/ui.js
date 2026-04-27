import {
  formatEventDateRange, styleChip,
  thaiMonthLong, toBE,
  fmtPickerDate, fmtHM,
  daysInMonth, firstDayOfWeek,
  todayISODate,
  EVENT_COLORS, eventColorHex,
} from './util.js';

// ---- Home: upcoming events ----

function setUpcomingMessage(text, tone = 'muted') {
  const container = document.getElementById('upcomingEvents');
  if (!container) return;
  container.replaceChildren();
  const div = document.createElement('div');
  div.className = 'card-meta';
  div.style.padding = '12px';
  div.style.textAlign = 'center';
  if (tone === 'error') div.style.color = 'var(--danger)';
  div.textContent = text;
  container.appendChild(div);
}

export function renderUpcomingLoading() { setUpcomingMessage('กำลังโหลด...'); }
export function renderUpcomingError(msg) { setUpcomingMessage('โหลด event ไม่สำเร็จ: ' + msg, 'error'); }

export function renderUpcomingEvents(events, calendars, { onCardClick } = {}) {
  const container = document.getElementById('upcomingEvents');
  if (!container) return;
  if (!events || events.length === 0) {
    setUpcomingMessage('ไม่มี event ในช่วง 30 วันข้างหน้า');
    return;
  }
  const calsById = new Map(calendars.map(c => [c.id, c]));
  container.replaceChildren();
  for (const ev of events) {
    container.appendChild(renderEventCard(ev, calsById.get(ev.calendarId), onCardClick));
  }
}

function renderEventCard(event, calendar, onClick) {
  const card = document.createElement('div');
  card.className = 'card';
  if (onClick) {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => onClick(event));
  }

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = event.summary || '(ไม่มีชื่อ)';
  card.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = formatEventDateRange(event);
  card.appendChild(meta);

  if (calendar) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = calendar.summary;
    styleChip(chip, calendar.backgroundColor);
    card.appendChild(chip);
  }

  return card;
}

// ---- Form ----

export function renderForm(state) {
  const f = state.formData;
  document.getElementById('fTitle').value = f.title;
  document.getElementById('fLocation').value = f.location;
  document.getElementById('fDescription').value = f.description;
  document.getElementById('fReminder').value = f.reminderMin != null ? String(f.reminderMin) : '';
  document.getElementById('fAllDay').checked = !!f.allDay;
  document.getElementById('fTimeRow').style.display = f.allDay ? 'none' : '';
  renderCalendarSelect(state);
  updatePickerLabels(state);
  renderPhotos(state.formData.photos || [], state.formData.attachments || []);
  renderColorPicker(state);
  const isDup = state.formEntry === 'duplicate';
  const titleText = isDup ? 'ทำซ้ำ event' : (state.formMode === 'edit' ? 'แก้ไข event' : 'เพิ่ม event');
  const submitText = isDup ? 'ทำซ้ำ event' : 'บันทึก event';
  document.getElementById('addTitle').textContent = titleText;
  document.getElementById('submitBtn').textContent = submitText;
  document.getElementById('dupAttachmentsNote').style.display =
    (isDup && state.formData.duplicateSourceHadAttachments) ? '' : 'none';
  clearFormError();
}

export function renderColorPicker(state) {
  const trigger = document.getElementById('colorTrigger');
  if (!trigger) return;
  const colorId = state.formData.colorId;
  let triggerColor;
  if (colorId) {
    triggerColor = eventColorHex(colorId);
  } else {
    const cal = state.calendars.find(c => c.id === state.formData.calendarId);
    triggerColor = cal?.backgroundColor || 'var(--gold)';
  }
  trigger.style.background = triggerColor;

  const dropdown = document.getElementById('colorDropdown');
  dropdown.replaceChildren();
  const def = document.createElement('button');
  def.type = 'button';
  def.className = 'color-swatch default-swatch' + (colorId == null ? ' selected' : '');
  def.setAttribute('data-action', 'select-color');
  def.setAttribute('data-color-id', '');
  def.setAttribute('aria-label', 'Default (calendar color)');
  dropdown.appendChild(def);
  for (const c of EVENT_COLORS) {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'color-swatch' + (colorId === c.id ? ' selected' : '');
    sw.style.background = c.hex;
    sw.setAttribute('data-action', 'select-color');
    sw.setAttribute('data-color-id', c.id);
    sw.setAttribute('aria-label', c.name);
    dropdown.appendChild(sw);
  }
}

function renderCalendarSelect(state) {
  const sel = document.getElementById('fCalendar');
  sel.replaceChildren();
  for (const c of state.calendars) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.summary;
    sel.appendChild(opt);
  }
  if (state.formData?.calendarId) sel.value = state.formData.calendarId;
}

export function updatePickerLabels(state) {
  const f = state.formData;
  document.getElementById('fStartDateLbl').textContent = fmtPickerDate(f.startDate);
  document.getElementById('fEndDateLbl').textContent = fmtPickerDate(f.endDate);
  document.getElementById('fStartTimeLbl').textContent = fmtHM(f.startTime);
  document.getElementById('fEndTimeLbl').textContent = fmtHM(f.endTime);
}

export function renderPhotos(photos, attachments = []) {
  const grid = document.getElementById('fPics');
  grid.replaceChildren();
  photos.forEach((p, idx) => {
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const img = document.createElement('img');
    img.alt = '';
    img.src = p.localUrl || p.thumbUrl || p.driveLink || '';
    thumb.appendChild(img);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb-remove';
    btn.setAttribute('data-action', 'remove-photo');
    btn.setAttribute('data-idx', String(idx));
    btn.setAttribute('aria-label', 'Remove photo');
    btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    thumb.appendChild(btn);
    grid.appendChild(thumb);
  });

  // Read-only attachments[] from the native Calendar app — distinct gold border
  // + 🔒 badge to signal "managed elsewhere". Tapping opens the Drive viewer.
  for (const a of attachments) {
    const isImage = (a.mimeType || '').startsWith('image/');
    if (isImage) {
      const thumb = document.createElement('div');
      thumb.className = 'thumb locked';
      thumb.title = a.title + ' — แก้ไขใน Google Calendar';
      const img = document.createElement('img');
      img.alt = a.title;
      img.src = a.fileId
        ? `https://drive.google.com/thumbnail?id=${a.fileId}&sz=w400`
        : (a.iconLink || '');
      thumb.appendChild(img);
      const lock = document.createElement('div');
      lock.className = 'thumb-lock';
      lock.textContent = '🔒';
      thumb.appendChild(lock);
      if (a.fileUrl) {
        thumb.style.cursor = 'pointer';
        thumb.addEventListener('click', () => window.open(a.fileUrl, '_blank', 'noopener'));
      }
      grid.appendChild(thumb);
    } else {
      const chip = document.createElement('div');
      chip.className = 'thumb attach-chip';
      chip.title = a.title + ' — แก้ไขใน Google Calendar';
      const lock = document.createElement('div');
      lock.className = 'thumb-lock';
      lock.textContent = '🔒';
      chip.appendChild(lock);
      const icon = document.createElement('div');
      icon.className = 'attach-chip-icon';
      icon.textContent = '📎';
      chip.appendChild(icon);
      const name = document.createElement('div');
      name.className = 'attach-chip-name';
      name.textContent = a.title;
      chip.appendChild(name);
      if (a.fileUrl) {
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', () => window.open(a.fileUrl, '_blank', 'noopener'));
      }
      grid.appendChild(chip);
    }
  }
}

export function showFormError(msg) {
  const el = document.getElementById('formError');
  el.textContent = msg;
  el.classList.add('active');
}

export function clearFormError() {
  const el = document.getElementById('formError');
  el.textContent = '';
  el.classList.remove('active');
}

// ---- Month Calendar (shared between Date Picker and Edit Date Selector) ----

function renderMonthCalendar({ container, monthLabel, viewYear, viewMonth, selectedDate, minDate, monthEvents, todayIso, onDayClick }) {
  monthLabel.textContent = `${thaiMonthLong(viewMonth)} ${toBE(viewYear)}`;
  container.replaceChildren();

  for (const dow of ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']) {
    const el = document.createElement('div');
    el.className = 'dow';
    el.textContent = dow;
    container.appendChild(el);
  }

  const firstDow = firstDayOfWeek(viewYear, viewMonth);
  for (let i = 0; i < firstDow; i++) {
    const el = document.createElement('div');
    el.className = 'day';
    el.style.visibility = 'hidden';
    container.appendChild(el);
  }

  const numDays = daysInMonth(viewYear, viewMonth);
  const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const selMonth = selectedDate ? selectedDate.slice(0, 7) : '';
  const selDay = selectedDate ? Number(selectedDate.split('-')[2]) : 0;
  const eventsMode = !!monthEvents;

  for (let d = 1; d <= numDays; d++) {
    const isoDate = `${monthStr}-${String(d).padStart(2, '0')}`;
    const el = document.createElement('div');
    el.className = 'day';
    el.textContent = String(d);
    const disabled = !!(minDate && isoDate < minDate);
    if (disabled) {
      el.classList.add('disabled');
    } else {
      if (todayIso && isoDate === todayIso) el.classList.add('today');
      if (eventsMode && monthEvents.has(isoDate)) el.classList.add('has-events');
      if (selMonth === monthStr && selDay === d) el.classList.add('selected');
      const allowClick = eventsMode ? monthEvents.has(isoDate) : true;
      if (allowClick) {
        el.addEventListener('click', () => onDayClick?.(isoDate));
      } else {
        el.style.cursor = 'default';
      }
    }
    container.appendChild(el);
  }
}

// ---- Date Picker ----

export function renderDatePicker(state, { onDayClick } = {}) {
  renderMonthCalendar({
    container: document.getElementById('datePickerGrid'),
    monthLabel: document.getElementById('datePickerMonth'),
    viewYear: state.datePicker.viewYear,
    viewMonth: state.datePicker.viewMonth,
    selectedDate: state.datePicker.selectedDate,
    minDate: state.datePicker.minDate,
    todayIso: todayISODate(),
    onDayClick,
  });
}

// ---- Edit / Duplicate Date Selectors ----

export function renderEditDateSelector(state, { onDayClick } = {}) {
  renderMonthCalendar({
    container: document.getElementById('editDateGrid'),
    monthLabel: document.getElementById('editDateMonth'),
    viewYear: state.editDateMonth.viewYear,
    viewMonth: state.editDateMonth.viewMonth,
    selectedDate: state.editListDate,
    monthEvents: state.monthEvents,
    todayIso: todayISODate(),
    onDayClick,
  });
}

export function renderDuplicateDateSelector(state, { onDayClick } = {}) {
  renderMonthCalendar({
    container: document.getElementById('dupDateGrid'),
    monthLabel: document.getElementById('dupDateMonth'),
    viewYear: state.duplicateDateMonth.viewYear,
    viewMonth: state.duplicateDateMonth.viewMonth,
    selectedDate: state.duplicateListDate,
    monthEvents: state.duplicateMonthEvents,
    todayIso: todayISODate(),
    onDayClick,
  });
}

// ---- Inline event list (rendered below calendar on edit/duplicate screens) ----

export function renderInlineEventList({ container, events, calendars, mode, dateLabel, callbacks = {} }) {
  container.replaceChildren();
  if (events == null) return;

  if (dateLabel) {
    const heading = document.createElement('div');
    heading.className = 'section-heading';
    heading.textContent = `${dateLabel} (${events.length})`;
    container.appendChild(heading);
  }

  if (events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card-meta';
    empty.style.cssText = 'padding: 12px; text-align: center;';
    empty.textContent = 'ไม่มี event ในวันนี้';
    container.appendChild(empty);
    return;
  }

  const calsById = new Map(calendars.map(c => [c.id, c]));
  for (const ev of events) {
    container.appendChild(renderInlineEventCard(ev, calsById.get(ev.calendarId), mode, callbacks));
  }
}

function renderInlineEventCard(event, calendar, mode, { onEdit, onDelete, onDuplicate }) {
  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = event.summary || '(ไม่มีชื่อ)';
  card.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = formatEventDateRange(event);
  card.appendChild(meta);

  if (calendar) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = calendar.summary;
    styleChip(chip, calendar.backgroundColor);
    card.appendChild(chip);
  }

  const acts = document.createElement('div');
  acts.className = 'action-row';

  if (mode === 'duplicate') {
    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'btn btn-sm';
    dupBtn.style.cssText = 'margin: 0; grid-column: 1 / -1;';
    dupBtn.textContent = 'ทำซ้ำ';
    dupBtn.addEventListener('click', () => onDuplicate?.(event));
    acts.appendChild(dupBtn);
  } else {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-sm';
    editBtn.style.margin = '0';
    editBtn.textContent = 'แก้ไข';
    editBtn.addEventListener('click', () => onEdit?.(event));
    acts.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-sm btn-danger';
    delBtn.style.margin = '0';
    delBtn.textContent = 'ลบ';
    delBtn.addEventListener('click', () => onDelete?.(event));
    acts.appendChild(delBtn);
  }

  card.appendChild(acts);
  return card;
}

// ---- Time Picker ----

export function renderTimePicker(state, { onHour, onMinute } = {}) {
  const { hour, minute, mode } = state.timePicker;
  document.getElementById('timeHour').textContent = String(hour).padStart(2, '0');
  document.getElementById('timeMinute').textContent = String(minute).padStart(2, '0');
  document.getElementById('timeHour').classList.toggle('active', mode === 'hour');
  document.getElementById('timeMinute').classList.toggle('active', mode === 'minute');
  renderClockFace(state, { onHour, onMinute });
}

function renderClockFace(state, { onHour, onMinute }) {
  const { hour, minute, mode } = state.timePicker;
  const face = document.getElementById('clockFace');
  face.replaceChildren();
  const cx = 130, cy = 130, rOut = 105, rIn = 70;

  if (mode === 'hour') {
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 - 90) * Math.PI / 180;
      addFaceNum(face, cx + rOut * Math.cos(a), cy + rOut * Math.sin(a), i, hour === i, false, () => onHour?.(i));
      const inner = i + 12;
      addFaceNum(face, cx + rIn * Math.cos(a), cy + rIn * Math.sin(a), inner, hour === inner, true, () => onHour?.(inner));
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const m = i * 5;
      const a = (i * 30 - 90) * Math.PI / 180;
      addFaceNum(face, cx + rOut * Math.cos(a), cy + rOut * Math.sin(a), m, minute === m, false, () => onMinute?.(m));
    }
  }

  const line = document.createElement('div');
  line.className = 'face-line';
  let handLen, ang;
  if (mode === 'hour') {
    handLen = hour < 12 ? rOut : rIn;
    ang = (hour % 12) * 30 - 90;
  } else {
    handLen = rOut;
    ang = (minute / 5) * 30 - 90;
  }
  line.style.width = handLen + 'px';
  line.style.transform = `rotate(${ang}deg)`;
  face.appendChild(line);

  const dot = document.createElement('div');
  dot.className = 'face-dot';
  face.appendChild(dot);
}

function addFaceNum(face, x, y, num, selected, isInner, onClick) {
  const el = document.createElement('div');
  el.className = 'face-num' + (isInner ? ' inner' : '') + (selected ? ' selected' : '');
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.textContent = String(num).padStart(2, '0');
  el.addEventListener('click', onClick);
  face.appendChild(el);
}

// ---- Loading + Success ----

export function setLoadingStep({ upload, create, done }) {
  const apply = (id, s) => {
    const el = document.getElementById(id);
    el.classList.remove('done', 'active');
    if (s === 'done' || s === 'active') el.classList.add(s);
  };
  apply('step-upload', upload);
  apply('step-create', create);
  apply('step-done', done);
}

export function renderSuccessSummary(event, calendar, photoCount) {
  const el = document.getElementById('successSummary');
  el.replaceChildren();
  const rows = [
    ['กิจกรรม', event.summary || '(ไม่มีชื่อ)'],
    ['วันเวลา', formatEventDateRange(event)],
    ['ปฏิทิน', calendar?.summary || ''],
    ['รูปภาพ', `${photoCount} รูป`],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    row.className = 'success-row';
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('span');
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    el.appendChild(row);
  }
}
