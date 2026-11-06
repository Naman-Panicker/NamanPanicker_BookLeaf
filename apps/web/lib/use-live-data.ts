import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError } from '@/lib/api';

// Often enough that a reply feels live, and each page only asks for what it shows.
const POLL_MS = 5000;

// Loads a page's data, then keeps it fresh for as long as the page is open and its tab is showing.
// load has to be stable, so wrap it in useCallback. A new load starts again from scratch.
export function useLiveData<T>(load: () => Promise<T>) {
  const [loaded, setLoaded] = useState<{ data: T; version: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState(false);
  // Going up reloads now, for after a change the person just made.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // Set once this load or version is out of date, so a slow answer can't overwrite a newer one.
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // The next round only starts when this one has finished, so a slow API never has requests pile up.
    async function refresh() {
      running = true;
      try {
        const data = await load();
        if (stopped) return;
        setLoaded({ data, version });
        setFailed(false);
      } catch (error) {
        if (stopped) return;
        if (error instanceof ApiRequestError && error.status === 404) {
          setMissing(true);
          return;
        }
        // Keep what's on screen and try again next round. A failed first load recovers the same way.
        setFailed(true);
      } finally {
        running = false;
      }
      if (!document.hidden) timer = setTimeout(refresh, POLL_MS);
    }

    function handleVisibilityChange() {
      clearTimeout(timer);
      if (!document.hidden && !running) void refresh();
    }

    void refresh();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [load, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return {
    data: loaded?.data ?? null,
    // True from a reload until its answer arrives. Background refreshes don't count, so nothing flickers.
    updating: loaded !== null && loaded.version !== version,
    // Only matters while there's nothing to show.
    loadFailed: failed && loaded === null,
    missing,
    reload,
  };
}
