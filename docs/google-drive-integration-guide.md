# Google Drive Integration Guide

How to add Google Drive file picking to a Next.js app using the Google Picker API. Files are downloaded server-side and stored in GCS — no client-side Drive dependency at runtime.

---

## How it works

```
User clicks "Pick from Drive"
  → Client fetches short-lived access token from your server
  → Google Picker SDK opens (native Google UI)
  → User picks a file → Picker returns { fileId, name, mimeType }
  → Client POSTs that metadata to your server
  → Server downloads file from Drive using the access token
  → Server uploads to GCS
  → GCS URL returned — file is now fully independent of Drive
```

---

## Step 1: GCP Setup

### 1.1 Enable APIs
In [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Library**, enable:
- **Google Drive API**
- **Google Picker API**

### 1.2 Create OAuth 2.0 Client
1. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Add to **Authorized JavaScript origins**:
   - `http://localhost:3000`
   - Your production domain
4. Add to **Authorized redirect URIs**:
   - `https://developers.google.com/oauthplayground` ← needed to get the refresh token
   - Your production callback URL (if you add per-user auth later)
5. Save → note the **Client ID** and **Client Secret**

### 1.3 Get the Refresh Token (one-time)
This is for the **team Google account** that clients will share folders with.

1. Go to [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
2. Click the **gear icon** → check **"Use your own OAuth credentials"**
3. Enter your Client ID and Client Secret
4. In Step 1, select scope: `https://www.googleapis.com/auth/drive.readonly`
5. Click **Authorize APIs** → sign in with the team Google account
6. Click **Exchange authorization code for tokens**
7. Copy the **refresh_token** from the JSON response

### 1.4 Add env vars
```bash
GDRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GDRIVE_CLIENT_SECRET=GOCSPX-xxxxx
GDRIVE_REFRESH_TOKEN=1//0gxxxxx
```

---

## Step 2: Server-side helpers

**`src/lib/drive/client.ts`**

```typescript
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

// Exchange the stored refresh token for a short-lived access token
export async function exchangeRefreshToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GDRIVE_CLIENT_ID"),
      client_secret: requireEnv("GDRIVE_CLIENT_SECRET"),
      refresh_token: requireEnv("GDRIVE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Drive token exchange failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

// Download a Drive file's bytes using an access token
export async function fetchDriveFileBuffer(
  fileId: string,
  accessToken: string
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch Drive file ${fileId}: ${res.status}`);
  return {
    buffer: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}
```

---

## Step 3: API routes

### GET `/api/drive/picker-token`
Called by the client before opening the Picker. Returns a fresh access token.

```typescript
// src/app/api/drive/picker-token/route.ts
import { NextResponse } from "next/server";
import { exchangeRefreshToken } from "@/lib/drive/client";

export async function GET(req: Request) {
  // Basic same-origin guard (tighten when proper auth lands)
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && !origin.includes(host.split(":")[0])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const accessToken = await exchangeRefreshToken();
    return NextResponse.json(
      { accessToken, clientId: process.env.GDRIVE_CLIENT_ID ?? "" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Could not connect to Google Drive." },
      { status: 500 }
    );
  }
}
```

### POST `/api/nodes/[id]/file/drive`
Receives picked file metadata, downloads from Drive, uploads to your storage.

```typescript
// Key logic — adapt to your storage backend
const accessToken = await exchangeRefreshToken();
const { buffer } = await fetchDriveFileBuffer(driveFileId, accessToken);

// Validate size, then upload to GCS / S3 / etc.
const { url } = await uploadToStorage({ filename, buffer, contentType: driveMimeType });

// Return same shape as your regular file upload response
return { filename, fileUrl: url, fileKind, fileExt, driveFileId, driveFileName, driveMimeType };
```

**Supported MIME types** (match these on client and server):
| MIME | ext | kind |
|------|-----|------|
| `image/png` | png | image |
| `image/jpeg` | jpg | image |
| `image/webp` | webp | image |
| `application/pdf` | pdf | document |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | docx | document |
| `text/plain` | txt | text |

---

## Step 4: Client hook

Lazy-loads the Google Picker SDK and opens the native Drive UI.

**`src/hooks/use-google-picker.ts`**

```typescript
"use client";
import { useCallback, useRef } from "react";

export type DrivePickedFile = {
  driveFileId: string;
  driveFileName: string;
  driveMimeType: string;
};

const ALLOWED_MIME_TYPES = [
  "image/png", "image/jpeg", "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
].join(",");

function loadPickerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Not in browser"));
    if ((window as any).google?.picker) return resolve();
    const existing = document.getElementById("gapi-script");
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const script = document.createElement("script");
    script.id = "gapi-script";
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google API script"));
    document.head.appendChild(script);
  });
}

export function useGooglePicker(onPick: (file: DrivePickedFile) => void) {
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const openPicker = useCallback(async () => {
    await loadPickerScript();
    await new Promise<void>((resolve) => {
      (window as any).gapi.load("picker", { callback: resolve });
    });

    const tokenRes = await fetch("/api/drive/picker-token");
    if (!tokenRes.ok) throw new Error("Could not connect to Google Drive");
    const { accessToken, clientId } = await tokenRes.json();

    const google = (window as any).google;

    // My Drive with folder navigation
    const myDriveView = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMimeTypes(ALLOWED_MIME_TYPES);

    // Shared with me
    const sharedView = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setEnableDrives(true)
      .setMode(google.picker.DocsViewMode.LIST);

    // Shared / Team Drives
    const sharedDrivesView = new google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setEnableDrives(true)
      .setMimeTypes(ALLOWED_MIME_TYPES);

    new google.picker.PickerBuilder()
      .setTitle("Select a file")
      .addView(myDriveView)
      .addView(sharedView)
      .addView(sharedDrivesView)
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES, true)
      .setOAuthToken(accessToken)
      .setAppId(clientId)
      .setSelectableMimeTypes(ALLOWED_MIME_TYPES)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs[0];
          onPickRef.current({
            driveFileId: doc.id,
            driveFileName: doc.name,
            driveMimeType: doc.mimeType,
          });
        }
      })
      .build()
      .setVisible(true);
  }, []);

  return { openPicker };
}
```

---

## Step 5: UI button

Use Google's branding (white card, Drive triangle logo SVG) so users recognize it:

```tsx
<button
  type="button"
  onClick={handleOpenPicker}
  className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 active:scale-[0.99] transition-all"
>
  {/* Google Drive triangle SVG */}
  <svg width="18" height="18" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
  </svg>
  Pick from Google Drive
</button>
```

---

## Gotchas & notes

| Issue | Fix |
|-------|-----|
| `redirect_uri_mismatch` on OAuth Playground | Add `https://developers.google.com/oauthplayground` to Authorized redirect URIs in GCP Console |
| Picker shows flat file list, no folders | Use `DocsView` with `.setIncludeFolders(true)`, not plain `View` |
| "Shared with me" folders not showing | Add a second `DocsView` with `.setEnableDrives(true)` + `enableFeature(SUPPORT_DRIVES, true)` on the builder |
| `403 Google Drive API not enabled` | Enable **Google Drive API** in GCP Console → APIs & Services → Library (separate from Picker API) |
| Drive URLs not publicly accessible | Never store Drive URLs directly — always download server-side and re-upload to your own storage |
| Refresh token expires | It doesn't expire unless revoked. If it stops working, re-run the OAuth Playground flow |
| Access token leaked to client | Route returns the access token to the browser for Picker use — this is intentional and safe (read-only, 1h TTL, picker-only usage). Add a same-origin check on the endpoint |

---

## Workflow for client onboarding

1. Team creates a Google Drive folder
2. Share it with the team Google account (the one whose refresh token is in env vars)
3. Share the same folder with the client so they can upload their brand assets
4. Client uploads logos, product images, etc. to that folder
5. In CreativeOS, user clicks "Pick from Google Drive" → navigates to the shared folder → picks a file
6. File is imported into GCS and attached to the File node
