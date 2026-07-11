"use client";

import { useCallback, useRef } from "react";

export type DrivePickedFile = {
  driveFileId: string;
  driveFileName: string;
  driveMimeType: string;
};

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
].join(",");

function loadPickerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Not in browser"));
    if ((window as any).google?.picker) return resolve();
    const existing = document.getElementById("gapi-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
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

    // Load the picker library
    await new Promise<void>((resolve) => {
      (window as any).gapi.load("picker", { callback: resolve });
    });

    // Fetch token from our server
    const tokenRes = await fetch("/api/drive/picker-token");
    if (!tokenRes.ok) throw new Error("Could not connect to Google Drive");
    const { accessToken, clientId } = await tokenRes.json();

    const google = (window as any).google;

    const picker = new google.picker.PickerBuilder()
      .addView(
        new google.picker.View(google.picker.ViewId.DOCS).setMimeTypes(ALLOWED_MIME_TYPES)
      )
      .setOAuthToken(accessToken)
      .setDeveloperKey("")
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
      .build();

    picker.setVisible(true);
  }, []);

  return { openPicker };
}
