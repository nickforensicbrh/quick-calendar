const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_MONTHS_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

const BE_OFFSET = 543;

export function toBE(year) { return year + BE_OFFSET; }
export function thaiMonthShort(m) { return THAI_MONTHS_SHORT[m]; }
export function thaiMonthLong(m) { return THAI_MONTHS_LONG[m]; }

export function formatThaiDate(date, { long = false } = {}) {
  const day = date.getDate();
  const month = (long ? THAI_MONTHS_LONG : THAI_MONTHS_SHORT)[date.getMonth()];
  const year = toBE(date.getFullYear());
  return `${day} ${month} ${year}`;
}

export function formatTime(date) {
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

export function isAllDayEvent(event) {
  return !!(event.start?.date);
}

export function getEventDates(event) {
  if (isAllDayEvent(event)) {
    const start = new Date(event.start.date + 'T00:00:00');
    const endExclusive = new Date(event.end.date + 'T00:00:00');
    const end = new Date(endExclusive);
    end.setDate(end.getDate() - 1);
    return { start, end, allDay: true };
  }
  return {
    start: new Date(event.start.dateTime),
    end: new Date(event.end.dateTime),
    allDay: false,
  };
}

export function formatEventDateRange(event) {
  const { start, end, allDay } = getEventDates(event);
  const sameDay = start.toDateString() === end.toDateString();
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();

  let dateStr;
  if (sameDay) {
    dateStr = formatThaiDate(start);
  } else if (sameMonth) {
    dateStr = `${start.getDate()}-${end.getDate()} ${THAI_MONTHS_SHORT[start.getMonth()]} ${toBE(start.getFullYear())}`;
  } else if (sameYear) {
    dateStr = `${start.getDate()} ${THAI_MONTHS_SHORT[start.getMonth()]} — ${end.getDate()} ${THAI_MONTHS_SHORT[end.getMonth()]} ${toBE(start.getFullYear())}`;
  } else {
    dateStr = `${formatThaiDate(start)} — ${formatThaiDate(end)}`;
  }

  const timeStr = allDay ? 'ทั้งวัน' : `${formatTime(start)} — ${formatTime(end)}`;
  return `${dateStr} · ${timeStr}`;
}

const pad2 = n => String(n).padStart(2, '0');

export function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fmtPickerDate(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtHM(time) {
  return `${pad2(time.h)}:${pad2(time.m)}`;
}

export function buildRFC3339(isoDate, time) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const local = new Date(y, mo - 1, d, time.h, time.m, 0);
  const off = -local.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const oh = pad2(Math.floor(Math.abs(off) / 60));
  const om = pad2(Math.abs(off) % 60);
  return `${y}-${pad2(mo)}-${pad2(d)}T${pad2(time.h)}:${pad2(time.m)}:00${sign}${oh}:${om}`;
}

export function addDaysISO(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function dateToISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatThaiDateLong(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} ${THAI_MONTHS_LONG[m - 1]} ${toBE(y)}`;
}

export function eventDateRange(event) {
  if (event.start?.date) {
    const result = [];
    let cur = event.start.date;
    while (cur < event.end.date) {
      result.push(cur);
      cur = addDaysISO(cur, 1);
    }
    return result;
  }
  const s = new Date(event.start.dateTime);
  const e = new Date(event.end.dateTime);
  const result = [];
  const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  while (cur <= endDay) {
    result.push(dateToISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

export function groupEventsByDate(events) {
  const map = new Map();
  for (const ev of events) {
    for (const d of eventDateRange(ev)) {
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(ev);
    }
  }
  return map;
}

const PHOTO_HEADER = '📸 รูปภาพ:';

export function parsePhotoLinksFromDescription(desc) {
  if (!desc) return { userDesc: '', links: [] };
  const idx = desc.lastIndexOf(PHOTO_HEADER);
  if (idx === -1) return { userDesc: desc, links: [] };
  const userDesc = desc.slice(0, idx).replace(/\s+$/, '');
  const block = desc.slice(idx + PHOTO_HEADER.length);
  const links = block.split(/\r?\n/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
  return { userDesc, links };
}

export function extractDriveFileId(url) {
  if (!url) return null;
  let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  m = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  m = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return null;
}

export function daysInMonth(year, month0) {
  return new Date(year, month0 + 1, 0).getDate();
}

export function firstDayOfWeek(year, month0) {
  return new Date(year, month0, 1).getDay();
}

export async function compressImage(file, { maxDim = 2048, quality = 0.85, skipBelow = 1024 * 1024 } = {}) {
  if (!file || file.size < skipBelow || !file.type.startsWith('image/')) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('image_load_failed'));
      i.src = url;
    });
    const r = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.round(img.width * r);
    const height = Math.round(img.height * r);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const EVENT_COLORS = [
  { id: '1',  hex: '#7986CB', name: 'Lavender' },
  { id: '2',  hex: '#33B679', name: 'Sage' },
  { id: '3',  hex: '#8E24AA', name: 'Grape' },
  { id: '4',  hex: '#E67C73', name: 'Flamingo' },
  { id: '5',  hex: '#F6BF26', name: 'Banana' },
  { id: '6',  hex: '#F4511E', name: 'Tangerine' },
  { id: '7',  hex: '#039BE5', name: 'Peacock' },
  { id: '8',  hex: '#616161', name: 'Graphite' },
  { id: '9',  hex: '#3F51B5', name: 'Blueberry' },
  { id: '10', hex: '#0B8043', name: 'Basil' },
  { id: '11', hex: '#D50000', name: 'Tomato' },
];

export function eventColorHex(colorId) {
  return EVENT_COLORS.find(c => c.id === String(colorId))?.hex;
}

export function styleChip(el, bgColor) {
  const color = bgColor || '#C9A961';
  const h = color.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  el.style.background = `rgba(${r}, ${g}, ${b}, 0.15)`;
  el.style.borderColor = color;
}
