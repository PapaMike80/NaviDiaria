(function () {
  const STORAGE_KEY = 'navi.shiftRequests.cache.v1';
  const TIME_KEY = 'navi.shiftRequests.cacheTime.v1';
  const CHANNEL_NAME = 'navi.shiftRequestsChannel.v1';
  const UPDATE_EVENT = 'navi-shift-requests-updated';
  const MAX_AGE_MS = 60 * 1000;
  const channel = typeof BroadcastChannel === 'function'
    ? new BroadcastChannel(CHANNEL_NAME)
    : null;
  let pending = null;

  function readJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function cached(allowStale = false) {
    const requests = readJson(STORAGE_KEY, []);
    const age = Date.now() - Number(localStorage.getItem(TIME_KEY) || 0);
    return requests && (allowStale || age < MAX_AGE_MS) ? requests : null;
  }

  function session() {
    let agent = null;
    try {
      agent = JSON.parse(
        localStorage.getItem('navidiaria.activeAgent') ||
        localStorage.getItem('naviturni_logged_agent') ||
        'null'
      );
    } catch {
      agent = null;
    }
    const agentId = String(agent?.id || '').trim();
    const pinHash = agentId ? String(localStorage.getItem(`navidiaria.pin.${agentId}`) || '').trim() : '';
    return { agent, agentId, pinHash };
  }

  function sortRequests(requests) {
    return [...(Array.isArray(requests) ? requests : [])].sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
  }

  function emitUpdate(reason, requests, source = 'local') {
    try {
      window.dispatchEvent(new CustomEvent(UPDATE_EVENT, {
        detail: { reason, requests, source }
      }));
    } catch (error) {
      console.warn('[shift-request-sync] Impossibile notificare l\'aggiornamento UI:', error);
    }
  }

  function saveCache(requests, { announce = true, source = 'network' } = {}) {
    const sorted = sortRequests(requests);
    const nextRaw = JSON.stringify(sorted);
    const previousRaw = localStorage.getItem(STORAGE_KEY) || '[]';
    localStorage.setItem(STORAGE_KEY, nextRaw);
    localStorage.setItem(TIME_KEY, String(Date.now()));
    if (announce && nextRaw !== previousRaw) {
      emitUpdate('save', sorted, source);
      channel?.postMessage({ type: 'shift-requests-updated', source });
    }
    return sorted;
  }

  async function list({ force = false } = {}) {
    const local = cached(!force);
    if (!force && local) return local;
    const { agentId, pinHash } = session();
    if (!agentId || !pinHash || !window.NaviCloud?.request) return cached(true) || [];
    if (pending && !force) return pending;
    pending = window.NaviCloud.request('list_shift_requests', { agentId, pinHash })
      .then(result => saveCache(result.requests || [], { announce: true, source: 'network' }))
      .catch(error => {
        const fallback = cached(true);
        if (fallback) return fallback;
        throw error;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  async function save(requestPayload) {
    const { agentId, pinHash } = session();
    if (!agentId || !pinHash || !window.NaviCloud?.request) {
      throw new Error('Sessione cloud non disponibile. Accedi di nuovo.');
    }
    const result = await window.NaviCloud.request('save_shift_request', {
      agentId,
      pinHash,
      request: requestPayload
    });
    const requests = saveCache(result.requests || [], { announce: true, source: 'network' });
    return { ...result, requests };
  }

  function subscribe({ intervalMs = 15000, onUpdate = null, onError = null, immediate = true } = {}) {
    let disposed = false;
    let timerId = null;

    const handleLocalUpdate = event => {
      onUpdate?.(event?.detail?.requests || cached(true) || [], event?.detail || { reason: 'event', source: 'local' });
    };

    const handleStorage = event => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      onUpdate?.(readJson(STORAGE_KEY, []), { reason: 'storage', source: 'local' });
    };

    const schedule = () => {
      if (disposed) return;
      timerId = window.setTimeout(runPoll, intervalMs);
    };

    const runPoll = async () => {
      if (disposed) return;
      if (document.visibilityState === 'hidden') {
        schedule();
        return;
      }
      try {
        await list({ force: true });
      } catch (error) {
        onError?.(error);
      } finally {
        schedule();
      }
    };

    const handleVisibility = () => {
      if (disposed || document.visibilityState === 'hidden') return;
      window.clearTimeout(timerId);
      runPoll();
    };

    window.addEventListener(UPDATE_EVENT, handleLocalUpdate);
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);

    const initial = cached(true) || [];
    if (immediate) onUpdate?.(initial, { reason: 'initial', source: 'local' });
    schedule();

    return () => {
      disposed = true;
      window.clearTimeout(timerId);
      window.removeEventListener(UPDATE_EVENT, handleLocalUpdate);
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }

  channel?.addEventListener('message', event => {
    if (event?.data?.type !== 'shift-requests-updated') return;
    emitUpdate('broadcast', cached(true) || [], event.data.source || 'local');
  });

  window.NaviShiftRequests = {
    cached: () => cached(true) || [],
    list,
    save,
    session,
    subscribe
  };
})();