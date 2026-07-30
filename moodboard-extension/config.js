// The origin where CreativeOS runs. Whatever you set here must ALSO appear in
// manifest.json "host_permissions" — that entry is what grants the extension its
// CORS exemption, without which both the board fetch and the item POST fail.
// No trailing slash: callers build `${APP_BASE_URL}/api/…`.
//
// Deliberately always production, even while developing locally. A moodboard item
// is just a row of URLs (D92) — no bytes, no storage path — so a capture written
// through production is instantly visible to a localhost app reading the same
// Supabase project. Only revisit this if local dev is ever pointed at a separate
// database, at which point captures would land in prod and vanish locally.
// const APP_BASE_URL = "https://creativeos-yuvabe.vercel.app";
// Local override for testing against a dev server. Both origins are listed in
// manifest.json "host_permissions", so switching is just moving the comment —
// no manifest edit needed. Reload the extension at chrome://extensions after.
const APP_BASE_URL = "http://localhost:3000";
