// PRODUCTION build — the folder that ships to clients. For development against a
// dev server, load the sibling moodboard-extension-local/ folder instead of
// editing this one.
//
// The origin here must ALSO appear in manifest.json "host_permissions" — that
// entry is what grants the CORS exemption, without which both the board fetch and
// the item POST fail. No trailing slash: callers build `${APP_BASE_URL}/api/…`.
//
// A moodboard item is just a row of URLs (D92) — no bytes, no storage path — so a
// capture written through production is instantly visible to a localhost app
// reading the same Supabase project.
const APP_BASE_URL = "https://creativeos-yuvabe.vercel.app";
