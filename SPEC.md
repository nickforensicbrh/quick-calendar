# Quick Calendar PWA — Technical Specification

## 1. Overview

### Problem
Google Calendar's native photo attachment flow requires users to upload to Google Drive first, then attach by URL — a 3-4 step process. This is especially painful on mobile when the user just wants to snap a photo of a flyer and create a calendar event quickly.

### Users
- **Primary:** Husband (you) and wife, each using their own Google account on their own phone.
- **Calendars:** 3 total — Me (primary, on husband's account), Kid (secondary, on husband's account), Wife (primary, on wife's account).
- **Goal:** Either person can create / edit / delete events on any of the 3 calendars from their own device, with photos attached in one flow.

### Success Criteria
- Creating an event with photo takes ≤ 30 seconds on mobile.
- PWA is installable to home screen on iOS and Android.
- Works from either user's device with their own Google account.
- Photos attached appear in the Google Calendar event description (as shareable links).

### Non-Goals (Phase 2)
- Telegram notifications — an existing Google Apps Script already handles this; do not duplicate.
- Event templates or recurring events.
- Event search.
- Push notifications.
- Multi-user collaborative editing indicators.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────┐
│  PWA (static, hosted on GitHub Pages)             │
│  HTML + CSS + Vanilla JS                          │
│  Service Worker for offline shell                 │
└──────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────┐
│  Google Identity Services (GIS)                   │
│  OAuth 2.0 Token Flow — in-browser                │
└──────────────────────────────────────────────────┘
                        │
                        ▼ (access_token in Authorization header)
┌──────────────────────────────────────────────────┐
│  Google Calendar API v3                           │
│  Google Drive API v3                              │
└──────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Client-only, no backend.** All logic runs in the browser. No server code, no cold starts, no hosting costs beyond GitHub Pages (free).
- **OAuth implicit flow via GIS.** The user authenticates directly with Google; access tokens live in memory only. PKCE is not needed because Google handles the flow entirely in the GIS library.
- **Calendar sharing, not account impersonation.** The app never "logs in as someone else." Each user signs in with their own account. Cross-account calendar access is made possible by Google Calendar's native sharing (set up in `SETUP.md` Part 2).
- **Scope minimization.** Use `drive.file` (app-created files only) instead of `drive` (full Drive access).
- **No data storage besides Google's.** The app holds no database. All state is either (a) derived from Google Calendar / Drive, (b) in-memory, or (c) in `sessionStorage` for ephemeral UI state.

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Hosting | GitHub Pages | Free, static, HTTPS included |
| Markup | HTML5 | No templating engine |
| Styles | Hand-written CSS | No framework. Keep all styles in `css/styles.css`. |
| Script | Vanilla ES modules | No bundler, no build step. Deploy source as-is. |
| Auth | Google Identity Services (GIS) | Load from `https://accounts.google.com/gsi/client` |
| APIs | Google Calendar API v3, Drive API v3 | Called directly via `fetch()` with access token |
| PWA | Web App Manifest + Service Worker | Hand-written, no Workbox |
| Dev server | `python3 -m http.server 8000` or `npx serve` | For local testing |

**No dependencies** except the GIS client library. Everything else is native browser APIs.

---

## 4. File Structure

```
/
├── index.html                  # Entry point — single-page app
├── manifest.json               # PWA manifest
├── sw.js                       # Service worker (app shell cache)
├── offline.html                # Static page shown when offline + no cache hit
├── css/
│   └── styles.css              # All styles
├── js/
│   ├── config.js               # User-provided constants (gitignored? see below)
│   ├── app.js                  # Entry point, routing, state management
│   ├── auth.js                 # GIS setup, token handling, sign in/out
│   ├── calendar.js             # Calendar API wrapper
│   ├── drive.js                # Drive API wrapper (upload, delete, get link)
│   ├── ui.js                   # Screen rendering, DOM updates
│   └── util.js                 # Helpers: date formatting, validation, image compression
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable.png
└── README.md                   # Points to SETUP.md and this spec
```

### About `js/config.js`

Contains:
- `OAUTH_CLIENT_ID` — a *public* identifier, safe to commit even in public repos
- `DRIVE_FOLDER_ID` — identifies a shared folder; accessible only to users the folder is shared with, so also safe to commit
- `SCOPES` — static

**Recommendation:** commit `js/config.js`. Do NOT gitignore it. The OAuth Client ID must be in the bundle at runtime; a separate config fetched at runtime adds complexity without security benefit.

---

## 5. Design System

### 5.1 Color Tokens

```css
/* Brand */
--navy:          #1A2744;
--navy-dark:     #0F1829;
--gold:          #C9A961;
--gold-hover:    #D4AF37;
--gold-border:   #B08F4A;
--ivory:         #F5F1E8;
--ivory-dark:    #E8E2D4;
--white:         #FFFFFF;

/* Calendar color coding */
--chip-me-bg:      #E6F1FB;
--chip-me-border:  #185FA5;
--chip-kid-bg:     #EAF3DE;
--chip-kid-border: #3B6D11;
--chip-wife-bg:    #FBEAF0;
--chip-wife-border:#993556;

/* Semantic */
--success:       #0F6E56;
--danger:        #A32D2D;
--danger-bg:     #FCEBEB;
```

**Important**: calendar chip colors should map by calendar identity, NOT by hardcoded labels. Read the calendar's color from Google Calendar API (`colorId` / `backgroundColor`) when possible; otherwise fall back to a deterministic color based on calendar ID hash.

### 5.2 Typography

- **Font family:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Thai', sans-serif`
- **Sizes:** 11, 12, 13, 14, 15, 16, 18, 20, 44 (for time picker display)
- **Weights:** 400 (regular), 500 (medium). Never 600+.
- **Line height:** 1.5 for body, 1.2 for headings

### 5.3 Spacing Scale

4px base — spacing uses 4, 6, 8, 10, 12, 14, 16, 20, 24px.

### 5.4 Radius

- `--radius-sm: 6px` — small pills, thumbnails
- `--radius-md: 8px` — buttons, inputs, cards (default)
- `--radius-lg: 12px` — modals, phone frame

### 5.5 Shadows (for "luxury" feel — used sparingly)

- `--shadow-sm: 0 1px 2px rgba(201, 169, 97, 0.12)` — subtle lift on inputs
- `--shadow-md: 0 2px 4px rgba(201, 169, 97, 0.22)` — buttons
- `--shadow-lg: 0 3px 8px rgba(201, 169, 97, 0.35)` — hover states
- `--shadow-modal: 0 8px 24px rgba(0, 0, 0, 0.3)` — modal overlays

### 5.6 Components

Match the prototype exactly. See `prototype.html` for pixel-accurate reference. Key components:

- **Button (primary)** — ivory bg, gold border 1px, gold shadow, navy text, 500 weight
- **Button (danger)** — white bg, danger-colored border + text
- **Button (icon, settings)** — gold circular bg, navy icon, on dark navy header
- **Input** — white bg, gold 1px border, navy text 13px
- **Select** — same as input, with custom SVG dropdown arrow (navy)
- **Date/Time picker trigger** — same style as input, button element; shows value + icon; opens modal screen
- **Chip (calendar)** — pill with bg + border color per calendar, navy text
- **Card** — white bg, 0.5px border, 12px padding, 8px radius
- **Modal** — absolute positioning inside phone container (never `position: fixed`), semi-transparent overlay, white rounded box centered

---

## 6. Screens

The app is a single-page state machine. There are 8 screens; only one is visible at a time. Transitions update `display` on screen containers and optionally push state to history.

### 6.1 Home
**Purpose:** Entry point after sign-in. Show upcoming events, offer Add and Edit/Delete actions.

**Layout:**
- Navy header with gold title "Quick calendar" and gold circular Settings icon (top right)
- Email chip showing current user
- Greeting text
- Primary button: `+ เพิ่ม` → navigates to Add Event
- Primary button: `แก้ไข / ลบ` → navigates to Edit Date Selector
- Section: "Event เร็วๆ นี้" (Upcoming events)
  - Cards showing 5-10 upcoming events (next 30 days)
  - Each card: title, date + time, calendar chip (color-coded)

**Data source:**
- `GET /calendar/v3/users/me/calendarList` → for calendar metadata
- `GET /calendar/v3/calendars/{id}/events` for each of 3 calendars with `timeMin=now&timeMax=now+30d&singleEvents=true&orderBy=startTime&maxResults=10`
- Merge results, sort by start time, take first 10.

**State:** `upcomingEvents: Event[]`, `userEmail: string`

### 6.2 Add/Edit Event Form
**Purpose:** Create a new event or edit an existing one. Same UI; title changes to "เพิ่ม event" vs "แก้ไข event".

**Fields:**
| Field | Type | Required | Notes |
|---|---|---|---|
| title | text input | ✓ | |
| calendar | select | ✓ | Populated from `calendarList` with write access (`accessRole` = `owner` or `writer`) |
| startDate | date picker trigger | ✓ | Opens Date Picker screen |
| endDate | date picker trigger | ✓ | Must be >= startDate |
| allDay | checkbox | | If checked, hides time inputs |
| startTime | time picker trigger | ✓ if !allDay | Opens Time Picker screen |
| endTime | time picker trigger | ✓ if !allDay | Must be >= startTime if same day |
| location | text input | | |
| description | textarea | | Free-form notes |
| reminder | select | | Options: แจ้งเตือน / 10 min / 30 min / 1 hour / 1 day before |
| photos | file input (multiple) | | Multiple photos; image/* accept; capture="environment" on camera button |

**Validation (client-side):**
- title non-empty
- endDate >= startDate
- if same day and !allDay: endTime >= startTime
- at least one writable calendar available

**Auto-Adjust Rules (silent — no user-facing notifications):**

These rules are enforced at the moment the user confirms (`ตกลง`) in a picker. No toasts, banners, or alerts — the UI just updates and the user returns to the form.

1. **Start date confirmed.** If `endDate < startDate`, set `endDate = startDate`. Update the end-date button label silently.
2. **End date picker opened.** Before rendering the grid, if `endDate < startDate`, set `endDate = startDate` (pre-position the selection). In the rendered grid, mark every day `< startDate` as disabled: gray text, line-through decoration, `cursor: not-allowed`, no click handler attached. Disabled days cannot be selected.
3. **Start time confirmed.** Always set `endTime = startTime + 1 hour`. If start is 23:xx, clamp end to 23:59 (same-day constraint for prototype; real implementation can bump end date instead). Update the end-time button label silently.
4. **End time confirmed.** If `startDate == endDate` AND `endTime <= startTime` (after the user's choice), overwrite the user's choice with `startTime + 1 hour` (same clamp rule). Otherwise accept the user's choice as-is.
5. **All-day toggled on.** Hide time pickers; clear start/end time from the payload. When submitting, use `start.date` / `end.date` instead of `dateTime` (see Section 7.1).
6. **All-day toggled off.** Restore the last known start/end time, or default to 10:00 / 11:00 if none.

**Rationale:** silent auto-correction keeps the form in a valid state at all times without interrupting the user's flow. The only constraint that requires visible feedback is the disabled-day styling in the end-date picker, because clicks on those cells must do nothing — the strikethrough is the affordance.

**Submit flow ("บันทึก event"):**
Navigate to Loading screen; execute:

1. For each new photo: upload to Drive (Section 8.3), get shareable `webContentLink`.
2. Build event description: user's text + appended photo links (1 per line, separated by blank line).
3. Build event payload (Section 7.1).
4. `POST` (new) or `PATCH` (edit) to Calendar API.
5. On success → Success screen. On error → surface error to form and return to form.

**Pre-fill on edit:**
When entering edit mode, populate all fields from the event. For existing photos in the description, parse Drive links and show them in the photo grid with a "remove" button. When a photo is removed in edit mode, it's added to a `photosToDelete` list; on save, these are deleted from Drive.

### 6.3 Date Picker (modal screen)
**Purpose:** Pick a date for startDate or endDate field.

**Layout:**
- Navy header: back arrow + "เลือกวันที่"
- White card with month grid: prev/next arrows (gold circular buttons), month label, day-of-week row, date grid
- Selected date: navy filled circle
- Action row: ยกเลิก (cancel, returns to form without saving) | ตกลง (save, update field, return to form)

**State:** `{target: 'start'|'end', month: YYYY-MM, selectedDay: number}`

### 6.4 Time Picker (modal screen)
**Purpose:** Pick a time in 24-hour format. No AM/PM.

**Layout:**
- Navy header: back arrow + "Select time"
- HH:MM display at top (two clickable boxes switching between hour and minute mode)
- Clock face:
  - Outer ring: 00, 01, 02, ..., 11 (at 12 positions; 00 at top, clockwise)
  - Inner ring: 12, 13, ..., 23 (aligned with outer positions)
  - In minute mode, outer ring shows 00, 05, 10, ..., 55
- Clock hand: gold line from center to selected number
- Action row: ยกเลิก | ตกลง

**Interaction:**
- Click hour on face → select + auto-switch to minute mode
- Click minute → just select, stay in minute mode
- HH/MM display boxes → manual mode switch
- ตกลง → save (state.formData.startTime/endTime), return to form

### 6.5 Edit Date Selector
**Purpose:** Pick a date to see which events are on it.

**Layout:** Same calendar as Date Picker, but:
- Days with events show gold dot underneath
- Clicking a day with events navigates to Edit List
- Clicking a day without events does nothing

**Data source:** fetch events for the visible month from all 3 calendars; mark days that have any event.

### 6.6 Edit List
**Purpose:** Show events for a selected date, with edit/delete actions.

**Layout:**
- Header: back arrow + the selected date (e.g., "24 เมษายน 2569")
- Cards: one per event on this day, each with:
  - Title, time range, calendar chip
  - Button row: `แก้ไข` (primary) | `ลบ` (danger)
- Note at bottom: "ดูรายละเอียดเต็มได้ที่ Google Calendar" (since users can open native Google Calendar for full detail view)

**Interactions:**
- Edit → navigate to Add/Edit form in edit mode (Section 6.2 pre-fill)
- Delete → show inline modal confirmation
  - Confirm modal has: title "ยืนยันการลบ event", message including event title, actions ยกเลิก / ลบ
  - On confirm: delete photos from Drive, delete event from Calendar, toast "ลบแล้ว", refresh list

### 6.7 Loading
**Purpose:** Show progress during multi-step save (upload → create → notify).

**Layout:**
- Spinner (gold)
- Step list with icons:
  - ◉ อัปโหลดรูปภาพ (done / active / pending)
  - ◉ สร้าง event
  - ◉ เสร็จสิ้น (not Telegram — that's out of scope)

### 6.8 Success
**Purpose:** Confirm save, offer next actions.

**Layout:**
- Navy circle with gold check icon
- "บันทึกสำเร็จ"
- Summary card: title, date/time, calendar, photo count
- Buttons: `+ เพิ่มอีก event` → new Add form | `กลับหน้าแรก` → Home

---

## 7. Data Models

### 7.1 Event (Google Calendar API format)

```typescript
interface CalendarEvent {
  id?: string;                // present on read, omitted on create
  summary: string;            // title
  description?: string;       // may contain photo URLs appended as lines
  location?: string;
  start: {
    dateTime?: string;        // ISO 8601, e.g. "2026-04-25T10:00:00+07:00"
    date?: string;            // YYYY-MM-DD (all-day only)
    timeZone?: string;        // IANA, e.g. "Asia/Bangkok"
  };
  end: { /* same shape */ };
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: 'popup' | 'email', minutes: number }>;
  };
  // No attachments field on create — Calendar API only supports attachments
  // via Drive file IDs with specific setup. Use description links instead.
}
```

**All-day events:** use `start.date` and `end.date` (YYYY-MM-DD). `end.date` is exclusive, so a single-day all-day event has `end.date = start.date + 1`.

**Timed events:** use `dateTime` + `timeZone`. Default `timeZone` to `Intl.DateTimeFormat().resolvedOptions().timeZone` (usually `Asia/Bangkok` for users in Thailand).

### 7.2 Calendar

```typescript
interface Calendar {
  id: string;                 // e.g. "user@gmail.com" or "abc123@group.calendar.google.com"
  summary: string;            // display name
  description?: string;
  backgroundColor?: string;   // hex
  foregroundColor?: string;   // hex
  accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
  primary?: boolean;
  selected?: boolean;
}
```

Only calendars with `accessRole` `owner` or `writer` are shown in the Add form's calendar dropdown. All 3 (from both accounts) should qualify after Part 2 of SETUP.

### 7.3 App State (recommended shape)

```typescript
interface AppState {
  user: { email: string; name: string; } | null;
  accessToken: string | null;
  tokenExpiresAt: number | null;  // epoch ms
  calendars: Calendar[];
  currentScreen: ScreenName;
  formMode: 'create' | 'edit';
  editingEvent: CalendarEvent | null;
  formData: FormData;
  datePickerTarget: 'start' | 'end' | 'filter';
  timePickerTarget: 'start' | 'end';
  editListDate: string;  // YYYY-MM-DD
  upcomingEvents: CalendarEvent[];
  monthEvents: Map<string, CalendarEvent[]>;  // 'YYYY-MM-DD' → events
}
```

Keep state in a single module-scoped object, expose via getter/setter functions. No framework state management needed.

---

## 8. API Integration

### 8.1 Authentication (Google Identity Services)

**Library:** `<script src="https://accounts.google.com/gsi/client" async defer></script>`

**Init flow:**

```javascript
const tokenClient = google.accounts.oauth2.initTokenClient({
  client_id: CONFIG.OAUTH_CLIENT_ID,
  scope: CONFIG.SCOPES,
  callback: (response) => {
    if (response.error) {
      // surface error
      return;
    }
    state.accessToken = response.access_token;
    state.tokenExpiresAt = Date.now() + response.expires_in * 1000;
    onAuthenticated();
  },
});

// To request token:
tokenClient.requestAccessToken({ prompt: '' }); // silent if previously granted
// Or with consent:
tokenClient.requestAccessToken({ prompt: 'consent' });
```

**User info:** after getting a token, fetch user profile for email:
```javascript
fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
  headers: { Authorization: `Bearer ${accessToken}` }
}).then(r => r.json())
```

**Token refresh:** GIS doesn't provide refresh tokens in implicit flow. When a 401 occurs:
1. Call `tokenClient.requestAccessToken({ prompt: '' })` — this is silent if the session is still valid.
2. If that fails, prompt user to sign in again with `prompt: 'consent'`.

**Sign out:**
```javascript
google.accounts.oauth2.revoke(accessToken, () => { /* clear state */ });
```

**Scopes:**
```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/userinfo.profile
```

### 8.2 Calendar API Wrapper

**Base URL:** `https://www.googleapis.com/calendar/v3`

**All requests:** include `Authorization: Bearer ${accessToken}` header.

| Operation | Method + Path | Notes |
|---|---|---|
| List calendars | `GET /users/me/calendarList` | For initial calendar dropdown |
| List events (date range) | `GET /calendars/{calendarId}/events` with query `timeMin`, `timeMax`, `singleEvents=true`, `orderBy=startTime` | For home upcoming + edit month view |
| Create event | `POST /calendars/{calendarId}/events` | Body = CalendarEvent (minus id) |
| Update event | `PATCH /calendars/{calendarId}/events/{eventId}` | Partial update |
| Delete event | `DELETE /calendars/{calendarId}/events/{eventId}` | |

**Important:** `calendarId` must be URL-encoded (emails contain `@`).

### 8.3 Drive API Wrapper

**Base URL:** `https://www.googleapis.com/drive/v3` (metadata) and `https://www.googleapis.com/upload/drive/v3` (upload).

#### Upload a photo

Use multipart upload with metadata + media in one request:

```javascript
async function uploadPhoto(file, accessToken, folderId) {
  const metadata = {
    name: `qcal-${Date.now()}-${file.name}`,
    parents: [folderId],
    mimeType: file.type,
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );
  const data = await res.json();
  return data; // { id, webViewLink, webContentLink }
}
```

#### Make the file viewable by link

After upload, set permission so the link works for anyone who opens the calendar event:

```javascript
await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ role: 'reader', type: 'anyone' }),
});
```

#### Delete a file

```javascript
await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

When an event is deleted, parse photo URLs from its description and delete each Drive file. Photos can be identified because their filenames start with `qcal-`.

### 8.4 Image Compression (recommended)

Before upload, compress large images client-side to save upload time and Drive quota:

- Skip if file size < 1 MB
- Otherwise: draw into `<canvas>` scaled so max dimension = 2048 px, export as JPEG quality 0.85
- Use `canvas.toBlob()` and create a new File from it before upload

Implementation hint: do this in `js/util.js`.

### 8.5 Error Handling

| HTTP status | Meaning | User-facing action |
|---|---|---|
| 401 | Token expired/invalid | Auto-retry with silent token refresh; if fails, show "Please sign in again" |
| 403 | Forbidden (e.g., calendar not shared with write access) | Show: "You don't have permission to modify this calendar. Check sharing settings." |
| 404 | Event was deleted elsewhere | Show: "This event no longer exists." Refresh the list. |
| 429 | Rate limited | Exponential backoff: 1s, 2s, 4s, 8s (max 3 retries) |
| 5xx | Google server error | Retry once; if still fails, show: "Google is having trouble. Try again later." |
| Network error | Offline | Show: "No connection. Check your internet." Queue writes for retry (optional; see 9.1). |

---

## 9. Core User Flows

### 9.1 First Launch (Sign In)

1. User opens PWA URL.
2. If no valid token → show welcome screen with "Sign in with Google" button.
3. Click → GIS `requestAccessToken({ prompt: 'consent' })` → Google consent page (first time) or silent grant (subsequent).
4. On callback with token:
   a. Fetch `/oauth2/v3/userinfo` for email + name.
   b. Fetch `calendarList` for available calendars.
   c. Filter calendars with write access.
   d. Fetch upcoming events for each.
   e. Render Home screen.

### 9.2 Create Event (happy path)

1. Home → click `+ เพิ่ม`
2. Fill form, pick dates via Date Picker, times via Time Picker, reminder (optional), photos (optional).
3. Click `บันทึก event`.
4. Loading screen:
   - Step A: compress + upload each photo in parallel; get Drive file IDs and webViewLinks.
   - Step B: set each file's permission to `anyone: reader`.
   - Step C: build event description = user's description + `\n\n📸 รูปภาพ:\n` + links joined by newline.
   - Step D: `POST` to `/calendars/{id}/events`.
5. Success screen with summary.

### 9.3 Edit Event

1. Home → `แก้ไข / ลบ` → Edit Date Selector → click date with events → Edit List.
2. Click `แก้ไข` on event.
3. Form opens in edit mode, title shows "แก้ไข event", all fields pre-filled.
4. Photos section: show existing photos from description (parsed from Drive links).
5. User modifies fields; can add new photos or remove existing.
6. Click `บันทึก event`.
7. Loading:
   - For each new photo: upload + set permission.
   - For each removed existing photo: delete from Drive.
   - Build updated description.
   - `PATCH` the event.
8. Success.

### 9.4 Delete Event

1. From Edit List → click `ลบ`.
2. Inline modal: "ยืนยันการลบ event — [title] จะถูกลบถาวร". Buttons: ยกเลิก / ลบ.
3. Click `ลบ`:
   - Parse photo Drive IDs from event description.
   - Delete each photo from Drive (best effort — continue on individual failure).
   - `DELETE` the event from Calendar.
   - Show toast "ลบแล้ว".
   - Return to Edit Date Selector; refresh event markers.

### 9.5 Multi-Day Event

- All-day: `start.date = 2026-04-25`, `end.date = 2026-04-28` (end is exclusive — so this is Apr 25-27 inclusive).
- Timed: `start.dateTime = 2026-04-25T10:00:00+07:00`, `end.dateTime = 2026-04-27T15:00:00+07:00`.
- Display in cards: if `start.date != end.date` (or same for dateTime day comparison), show "25-27 เม.ย. 2569 · 10:00 — 15:00".

---

## 10. PWA Configuration

### 10.1 `manifest.json`

```json
{
  "name": "Quick Calendar",
  "short_name": "QuickCal",
  "description": "Fast event creation with photo attachments for shared family calendars",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#1A2744",
  "background_color": "#F5F1E8",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### 10.2 Service Worker (`sw.js`)

- **Strategy:** Cache-first for app shell (HTML, CSS, JS, icons); network-only for Google API calls.
- **Cache name:** `qcal-v{N}` (bump N on each deploy to invalidate).
- **Install event:** pre-cache shell files.
- **Activate event:** delete old caches.
- **Fetch event:**
  - If request is to `googleapis.com` → bypass cache, pass through.
  - If request matches shell → cache-first.
  - If offline and not in cache → return `offline.html`.

Keep `sw.js` under 100 lines. No Workbox.

### 10.3 Install Prompt

```javascript
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallBanner();
});

// When user clicks install in the banner:
deferredPrompt.prompt();
const { outcome } = await deferredPrompt.userChoice;
// dismiss banner, save dismissal in sessionStorage
```

On iOS (Safari doesn't fire `beforeinstallprompt`): show a one-time tutorial with "Tap Share → Add to Home Screen" instructions.

---

## 11. Deployment

### 11.1 Local Development

From project root:
```bash
python3 -m http.server 8000
# or
npx serve -p 8000
```

Visit `http://localhost:8000`. This origin must be in Google Cloud's Authorized JavaScript origins.

### 11.2 GitHub Pages

GitHub Pages serves from the `main` branch root. To deploy:
```bash
git add .
git commit -m "Deploy"
git push origin main
```

Wait ~30 seconds. Site is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

### 11.3 Testing Checklist

Before considering done, verify manually:

- [ ] Sign in with husband account; see all 3 calendars in dropdown.
- [ ] Sign in with wife account on different device; see all 3 calendars.
- [ ] Create an all-day event with no photo.
- [ ] Create a timed event with 1 photo → photo link opens in event.
- [ ] Create a timed event with 3 photos.
- [ ] Create a multi-day all-day event (Apr 25-27).
- [ ] Create a multi-day timed event (Apr 25 10:00 to Apr 27 15:00).
- [ ] Edit event title → saves and reflects on Home.
- [ ] Edit event: remove a photo → photo deleted from Drive.
- [ ] Edit event: add a photo to existing event.
- [ ] Delete event → event gone, photos gone from Drive.
- [ ] Reminder dropdown — event has reminder set correctly in Google Calendar.
- [ ] Works offline: app shell loads; API calls fail gracefully with message.
- [ ] Install to home screen on iPhone Safari.
- [ ] Install to home screen on Android Chrome.
- [ ] Sign out → token revoked → can't access APIs.

---

## 12. Security

- **OAuth Client ID is public.** Safe to commit. It's not a secret.
- **Access tokens:** in-memory only. Never `localStorage` or `sessionStorage`. Lost on tab close (acceptable; silent re-auth on reload).
- **Scope minimization:** only request what's needed. `drive.file` (not `drive`), `calendar` (not `calendar.readonly` + separate write scopes).
- **CSP (optional but recommended):** add meta tag:
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://accounts.google.com; connect-src 'self' https://*.googleapis.com https://accounts.google.com; img-src 'self' data: https://*.googleusercontent.com; style-src 'self' 'unsafe-inline';">
  ```
- **No XSS:** sanitize all user-entered text when inserting into DOM. Use `textContent` (not `innerHTML`) for user strings.
- **No CSRF:** stateless API calls with bearer tokens; no cookies involved.

---

## 13. Implementation Order (recommended)

Build in this order so the app is testable end-to-end as early as possible:

1. **Scaffold** — `index.html`, `styles.css` with design tokens, `app.js` skeleton, empty screen containers.
2. **Auth** — GIS integration, sign in / sign out, render Home with user email.
3. **Read Calendar** — fetch and display upcoming events on Home.
4. **Add Event (no photos)** — form, Date Picker, Time Picker, submit to Calendar API.
5. **Multi-day and all-day support.**
6. **Add Event with photos** — Drive upload, permissions, description with links.
7. **Edit Event** — pre-fill form, PATCH API, photo diff.
8. **Edit Date Selector + Edit List + Delete** — with confirm modal.
9. **PWA** — manifest, service worker, install prompt.
10. **Polish** — error handling, empty states, offline fallback, loading states.

---

## 14. References

- Prototype HTML: see `prototype.html` — pixel-accurate UI reference.
- Setup guide: `SETUP.md`.
- Google Identity Services: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Calendar API v3: https://developers.google.com/calendar/api/v3/reference
- Drive API v3 upload: https://developers.google.com/drive/api/guides/manage-uploads
- PWA manifest: https://developer.mozilla.org/en-US/docs/Web/Manifest
