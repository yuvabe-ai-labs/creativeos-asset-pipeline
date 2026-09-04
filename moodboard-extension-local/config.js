// LOCAL build — talks to a dev server on your machine. The sibling
// moodboard-extension/ folder is the production build that ships to clients.
//
// The origin here must ALSO appear in manifest.json "host_permissions" — that
// entry is what grants the CORS exemption. Both :3000 and :3001 are pre-listed
// there, because `next dev` takes 3001 when 3000 is already busy (e.g. a second
// checkout's server): if your dev server printed 3001, change the port below and
// reload the extension at chrome://extensions.
// No trailing slash: callers build `${APP_BASE_URL}/api/…`.
const APP_BASE_URL = "http://localhost:3000";
