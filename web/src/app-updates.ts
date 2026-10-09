const CHECK_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

// Compare with the version embedded in this page, including on the first check:
// the server may already have been updated before this tab starts polling.
export function watchForUpdates(currentVersion: string, onUpdate: () => void): () => void {
  let stopped = false;
  let pending: AbortController | undefined;
  let timeout: number | undefined;

  async function check() {
    if (stopped || pending || document.hidden) return;
    const controller = new AbortController();
    pending = controller;
    timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/version', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const value: unknown = await response.json();
      if (!stopped && value && typeof value === 'object' && 'version' in value
        && typeof value.version === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value.version)
        && value.version !== currentVersion) {
        stop();
        onUpdate();
      }
    } catch {
      // Offline tabs, failed deployments and older servers retry quietly.
    } finally {
      window.clearTimeout(timeout);
      timeout = undefined;
      pending = undefined;
    }
  }

  function resume() { void check(); }
  function stop() {
    stopped = true;
    window.clearInterval(interval);
    window.clearTimeout(timeout);
    pending?.abort();
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('focus', resume);
    window.removeEventListener('online', resume);
  }

  const interval = window.setInterval(resume, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('focus', resume);
  window.addEventListener('online', resume);
  resume();
  return stop;
}
