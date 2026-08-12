const GCS_PREFIX = "https://storage.googleapis.com/";

// GCS public objects send no CORS headers, so loading one with crossOrigin set (required
// for the exporter's canvas readback) fails and toBlob() throws SecurityError. Routing
// through the existing same-origin proxy (built for D37's annotation canvas; reused per
// D105 §11) makes canvas readback work with no bucket-CORS change. Every image layer
// AND the export path must use this — never render a raw GCS url directly.
export function proxyImageSrc(url: string): string {
  if (!url.startsWith(GCS_PREFIX)) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}
