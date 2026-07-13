function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export async function exchangeRefreshToken(): Promise<string> {
  const clientId = requireEnv("GDRIVE_CLIENT_ID");
  const clientSecret = requireEnv("GDRIVE_CLIENT_SECRET");
  const refreshToken = requireEnv("GDRIVE_REFRESH_TOKEN");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive token exchange failed: ${text}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

export async function fetchDriveFileBuffer(
  fileId: string,
  accessToken: string
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Drive file ${fileId}: ${res.status} ${text}`);
  }

  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  return { buffer, contentType };
}
