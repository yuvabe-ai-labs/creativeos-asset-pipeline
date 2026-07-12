"use client";

import { useCallback, useEffect, useRef } from "react";
import { loadPickerScript } from "@/lib/drive/picker-loader";

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

export function useGooglePicker(onPick: (file: DrivePickedFile) => void) {
  const onPickRef = useRef(onPick);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  const openPicker = useCallback(async () => {
    await loadPickerScript();

    await new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).gapi.load("picker", { callback: resolve });
    });

    const tokenRes = await fetch("/api/drive/picker-token");
    if (!tokenRes.ok) throw new Error("Could not connect to Google Drive");
    const { accessToken, clientId } = await tokenRes.json() as { accessToken: string; clientId: string };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google;

    // My Drive — full folder tree with Shared Drives support via SUPPORT_DRIVES flag
    const myDriveView = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMimeTypes(ALLOWED_MIME_TYPES);

    // Shared with me — files the team account doesn't own
    const sharedWithMeView = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setOwnedByMe(false)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMimeTypes(ALLOWED_MIME_TYPES);

    const picker = new google.picker.PickerBuilder()
      .setTitle("Select a file")
      .addView(myDriveView)
      .addView(sharedWithMeView)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED, false)
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES, true)
      .setOAuthToken(accessToken)
      .setAppId(clientId)
      .setSelectableMimeTypes(ALLOWED_MIME_TYPES)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
