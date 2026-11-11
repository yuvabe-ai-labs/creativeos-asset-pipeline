// D493 §6.3: a 403 from our API can mean the person's access changed mid-session (their owner
// unticked something). The two fetch funnels report every status here; AccessProvider listens and
// refreshes /api/me, so the screen catches up without a reload.
type Listener = () => void;

const listeners = new Set<Listener>();

export function onAccessDenied(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportStatus(status: number): void {
  if (status !== 403) return;
  for (const listener of [...listeners]) listener();
}
