// The one public route prefix (D309). Used by the proxy test and AppHeader.
export function isPublicReviewPath(pathname: string): boolean {
  return pathname === "/r" || pathname.startsWith("/r/");
}

export function sharePathFor(token: string): string {
  return `/r/${token}`;
}
