import "server-only";

export type Email = { to: string[]; subject: string; text: string; html: string };
export type EmailResult = { sent: true } | { sent: false; reason: "not_configured" | "failed" };

// Spec §6.7: email through Resend's HTTP API (no SDK). Without RESEND_API_KEY and a verified
// EMAIL_FROM nothing is sent and the caller shows the link to copy instead. A failed send never
// fails the action that asked for it: the invite or the access change has already happened.
export async function sendEmail(email: Email): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.text, html: email.html }),
    });
    if (!res.ok) {
      console.error("[email] send refused", res.status, await res.text().catch(() => ""));
      return { sent: false, reason: "failed" };
    }
    return { sent: true };
  } catch (e) {
    console.error("[email] send failed", e);
    return { sent: false, reason: "failed" };
  }
}
