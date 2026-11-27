// A one-time message shown as a toast on the next page, after a server action redirects (D598).
// A short-lived cookie rather than a query parameter, so it survives the redirects home may make
// (for example to /onboarding). FlashToast (src/components/layout/flash-toast.tsx) reads and
// deletes it.

export const FLASH_COOKIE = "creativeos-flash";
export const FLASH_MAX_AGE_SECONDS = 60;

export const FLASH_MESSAGES = {
  "password-set": "Your password is set.",
} as const;

export type FlashKey = keyof typeof FLASH_MESSAGES;

/** The message for a cookie value, or null for anything unknown (the cookie is browser-editable). */
export function flashMessage(value: string | undefined): string | null {
  return value && Object.hasOwn(FLASH_MESSAGES, value) ? FLASH_MESSAGES[value as FlashKey] : null;
}
