(function () {
  const DATA_KEY = 'navi.sharedData.v1';
  const TIME_KEY = 'navi.sharedDataTime.v1';
  const DIRECTORY_KEY = 'navi.agentDirectory.v2';
  const MAX_AGE = 10 * 60 * 1000;
  const FIREBASE_SCHEDULE_URL = 'https://navisuite-f116f-default-rtdb.europe-west1.firebasedatabase.app/public/schedule.json';
  let pending = null;
  let lastSource = 'local';

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  }

  function directoryFrom(data) {
    const byId = new Map();
    Object.entries(data?.residenze || {}).forEach(([residence, list]) => {
      (list || []).forEach(agent => {
        const qualifica = String(agent.qualifica || 'marinaio').trim();
        const item = {
          id:String(agent.id || ''),
          name:String(agent.agente || '').trim(),
          qualifica,
          residence,
          role:String(agent.role || '').trim().toLowerCase() || (qualifica.toLowerCase() === 'barista' ? 'barista' : '')
        };
        if (item.id && item.name) byId.set(item.id, item);
      });
    });

    const baristas = Array.isArray(data?.bariste) ? data.bariste : (Array.isArray(data?.barista) ? data.barista : []);
    baristas.forEach(record => {
      const name = String(record.barista || record.agente || record.nome || '').trim();
      if (!name) return;
      const generated = `BARISTA_${name.toLocaleUpperCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
      const id = String(record.id || generated);
      if (!byId.has(id)) byId.set(id, { id, name, qualifica:'barista', residence:'BARISTE', role:'barista' });
    });

    return [...byId.values()].sort((a, b) => {
      const baristaA = String(a.role || a.qualifica || '').toLowerCase() === 'barista' ? 1 : 0;
      const baristaB = String(b.role || b.qualifica || '').toLowerCase() === 'barista' ? 1 : 0;
      return baristaA - baristaB || a.name.localeCompare(b.name, 'it');
    });
  }

  function save(data) {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    localStorage.setItem(TIME_KEY, String(Date.now()));
    localStorage.setItem(DIRECTORY_KEY, JSON.stringify(directoryFrom(data)));
    return data;
  }

  function replaceByKey(base, additions, keyOf) {
    const map = new Map();
    (base || []).forEach(item => map.set(keyOf(item), item));
    (additions || []).forEach(item => map.set(keyOf(item), item));
    return [...map.values()];
  }

  async function mergeAdminUpdates(data) {
    const provider = window.NaviFirebase?.getAdminUpdates
      ? window.NaviFirebase
      : window.NaviAdminFirebase;
    if (!data || !provider?.getAdminUpdates) return data;
    try {
      await provider.ready;
      const updates = await provider.getAdminUpdates();
      const ods = [...(updates.odsVariations || []), ...(updates.manualVariations || [])];
      data.variazioni_ods = replaceByKey(
        data.variazioni_ods || [],
        ods,
        item => `${item?.data || ''}|${item?.id_agente || item?.agente || ''}|${item?.tipo || ''}|${item?.ods || ''}`
      ).sort((a, b) => {
        const priority = item => String(item?.tipo || '').toUpperCase() === 'MANUALE'
          ? (item?.requestId ? -1 : 1000000)
          : Number.parseInt(String(item?.ods || '').match(/\d+/)?.[0] || '0', 10);
        return priority(a) - priority(b);
      });
      data.bariste = replaceByKey(
        data.bariste || [],
        updates.baristas || [],
        item => `${item?.data || ''}|${item?.corsa || ''}|${String(item?.barista || item?.agente || item?.nome || '').trim().toLocaleUpperCase('it')}`
      );
      data.dismissedOdsApprovals = Array.isArray(updates.dismissedOdsApprovals) ? updates.dismissedOdsApprovals : [];
    } catch (error) {
      console.warn('Aggiornamenti amministrativi Firebase non disponibili.', error);
    }
    return data;
  }

  function cached(allowStale = false) {
    const data = read(DATA_KEY);
    const age = Date.now() - Number(localStorage.getItem(TIME_KEY) || 0);
    return data && (allowStale || age < MAX_AGE) ? data : null;
  }

  async function fetchJson(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
        cache:'no-store',
        signal:controller.signal
      });
      if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
      const data = await response.json();
      if (!data || typeof data !== 'object') throw new Error('Dati non validi');
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function load(url, { force = false } = {}) {
    if (!force) {
      const data = cached();
      if (data) { lastSource = 'local'; return data; }
    }
    if (pending) return pending;
    pending = fetchJson(FIREBASE_SCHEDULE_URL, 8000)
      .then(mergeAdminUpdates)
      .then(data => {
        lastSource = 'firebase';
        return save(data);
      })
      .catch(firebaseError => {
        console.warn('NaviSuite Database non disponibile; provo il servizio precedente.', firebaseError);
        return fetchJson(url, 10000).then(mergeAdminUpdates).then(data => {
          lastSource = 'network';
          return save(data);
        });
      })
      .catch(error => {
        const fallback = cached(true);
        if (fallback) { lastSource = 'local'; return fallback; }
        throw error;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  function directory() {
    return read(DIRECTORY_KEY) || directoryFrom(cached(true));
  }

  function clear() {
    localStorage.removeItem(DATA_KEY);
    localStorage.removeItem(TIME_KEY);
    localStorage.removeItem(DIRECTORY_KEY);
    localStorage.removeItem('navi.agentDirectory.v1');
  }

  window.NaviSharedData = {
    load,
    directory,
    clear,
    isFresh:() => !!cached(),
    source:() => lastSource,
    provider:() => lastSource === 'firebase' ? 'NaviSuite Database' : (lastSource === 'network' ? 'Apps Script' : 'Memoria locale')
  };
})();
