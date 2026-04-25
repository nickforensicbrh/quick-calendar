# Quick Calendar PWA — Setup Guide

This guide walks through all prerequisite setup before Claude Code starts implementation.

**What you need:** 2 Google accounts (yours + wife's), a GitHub account, a web browser.
**Total time:** ~45 minutes.

---

## Part 1 — Google Cloud Console (~15 min)

### 1.1 Create Project

1. Go to https://console.cloud.google.com
2. Click the project dropdown (top left) → **New Project**
3. Name: `Quick Calendar`
4. Click **Create**

### 1.2 Enable APIs

1. From the left menu: **APIs & Services → Library**
2. Search and enable each of the following:
   - **Google Calendar API**
   - **Google Drive API**

### 1.3 Configure OAuth Consent Screen

1. **APIs & Services → OAuth consent screen**
2. **User Type:** External → Create
3. Fill in:
   - **App name:** Quick Calendar
   - **User support email:** your email
   - **Developer contact email:** your email
4. Save and continue to **Scopes** → **Add or Remove Scopes** → add:
   - `.../auth/calendar` (See, edit, share, and permanently delete all the calendars)
   - `.../auth/drive.file` (See, edit, create, and delete only the specific Google Drive files you use with this app)
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
5. Continue to **Test users** → add both your email AND your wife's email
6. Save

> **Note:** While the app is in "Testing" mode, only the listed test users can sign in. This is fine for personal use — no need to go through Google's verification process.

### 1.4 Create OAuth Client ID

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. **Application type:** Web application
3. **Name:** Quick Calendar Web
4. **Authorized JavaScript origins** — add all of:
   - `http://localhost:8000`
   - `http://localhost:3000`
   - `https://YOUR-GITHUB-USERNAME.github.io` (add the exact GitHub Pages URL later in Part 4)
5. **Authorized redirect URIs:** leave empty (we use implicit token flow)
6. **Create**
7. **Copy the Client ID** — it looks like `1234567890-abc...xyz.apps.googleusercontent.com`. You'll paste it into `js/config.js` later.

---

## Part 2 — Calendar Sharing (~10 min)

Both accounts need to share calendars with each other with **"Make changes to events"** permission, so either person can create, edit, or delete events on any of the 3 calendars.

### 2.1 From Wife's Account

1. Sign in to https://calendar.google.com as wife
2. Left sidebar → find her calendar (e.g., "ปฏิทินภรรยา") → hover → **⋮ (three dots) → Settings and sharing**
3. Scroll to **Share with specific people or groups → Add people and groups**
4. Enter your email
5. Permissions dropdown → **"Make changes to events"**
6. Send

### 2.2 From Your Account

Repeat the above, sharing these calendars with wife's email (each with "Make changes to events"):

1. Your personal calendar (e.g., "ปฏิทินของฉัน")
2. Kid's calendar (e.g., "ปฏิทินลูก")

### 2.3 Accept Share Invitations

Each account receives an email. Open Gmail → find the "invited you" email from Google Calendar → click the link → accept.

**Verify:** in each account's Calendar, the left sidebar under **"Other calendars"** should show the shared ones. Events from all 3 calendars should appear in the main view.

---

## Part 3 — Shared Drive Folder (~5 min)

All photos attached to events will be uploaded here.

### 3.1 Create Folder

1. Go to https://drive.google.com (signed in as you)
2. **+ New → Folder** → name it `Quick Calendar Photos`
3. Right-click the folder → **Share**
4. Add wife's email → permission: **Editor** → Share

### 3.2 Get Folder ID

1. Open the folder (double-click)
2. Look at the URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
3. **Copy the FOLDER_ID** — the long alphanumeric string after `/folders/`. You'll paste it into `js/config.js`.

---

## Part 4 — GitHub (~5 min)

### 4.1 Create Repository

1. https://github.com → **New repository**
2. **Repository name:** `quick-calendar` (or your choice)
3. **Public** (GitHub Pages on free accounts requires public; Private needs GitHub Pro)
4. Check **Add a README file**
5. **Create repository**

### 4.2 Enable GitHub Pages

1. Repo page → **Settings → Pages**
2. **Source:** Deploy from a branch
3. **Branch:** `main` → folder: `/ (root)` → **Save**
4. Wait ~1 minute. The page will show the live URL:
   `https://YOUR-USERNAME.github.io/quick-calendar/`
5. **Copy this URL** and go back to **Part 1.4 step 4** to add it to Authorized JavaScript origins.

---

## Part 5 — Configuration File

Once Claude Code starts implementation, it will create `js/config.js`. The contents should look like this:

```javascript
// js/config.js
export const CONFIG = {
  OAUTH_CLIENT_ID: 'PASTE_FROM_PART_1.4.apps.googleusercontent.com',
  DRIVE_FOLDER_ID: 'PASTE_FROM_PART_3.2',
  SCOPES: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' '),
};
```

> **Security note:** OAuth Client ID for public web apps is **not a secret** — it's safe to commit to a public repo. Anyone who has it still needs to go through Google's consent flow, and the test-user restriction (Part 1.3) limits who can actually authenticate.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Error 403: access_denied` during sign-in | Email not in test users list | Part 1.3 → add email to test users |
| `origin_mismatch` error | Current URL not in authorized origins | Part 1.4 → add URL |
| Calendar dropdown missing shared calendars | Sharing invitation not accepted | Part 2.3 |
| Photos fail to upload, `403 Forbidden` | `drive.file` scope only allows app-created files | Ensure app is uploading (not referencing arbitrary files) |
| `401 Unauthorized` on API calls | Access token expired | App should auto-refresh; if stuck, sign out/in |
| Events don't save | Calendar permission is "See only" | Part 2 → re-share with "Make changes to events" |

---

## Next Steps

After completing this guide, you should have:

- ✅ Google Cloud project with Calendar + Drive APIs enabled
- ✅ OAuth Client ID (copy into config)
- ✅ OAuth consent screen configured with both emails as test users
- ✅ All 3 calendars shared between both accounts
- ✅ Shared Drive folder with folder ID
- ✅ GitHub repo with Pages enabled
- ✅ GitHub Pages URL added to authorized origins

Then:

1. Clone the empty GitHub repo locally
2. Start Claude Code in that directory
3. Provide `SPEC.md` and `prototype.html` as context
4. Claude Code will scaffold and implement the app iteratively
