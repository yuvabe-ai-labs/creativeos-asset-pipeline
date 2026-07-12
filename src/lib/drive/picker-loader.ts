// src/lib/drive/picker-loader.ts

let pendingLoad: Promise<void> | null = null;

export function loadPickerScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Not in browser"));
  }
  if ((window as any).google?.picker) {
    return Promise.resolve();
  }
  if (pendingLoad) return pendingLoad;

  pendingLoad = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("gapi-script");
    if (existing) {
      // Script tag exists — may have already loaded
      if ((window as any).gapi) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => {
        pendingLoad = null;
        reject(new Error("Failed to load Google API script"));
      });
      return;
    }
    const script = document.createElement("script");
    script.id = "gapi-script";
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => resolve();
    script.onerror = () => {
      pendingLoad = null;
      reject(new Error("Failed to load Google API script"));
    };
    document.head.appendChild(script);
  });

  return pendingLoad;
}
