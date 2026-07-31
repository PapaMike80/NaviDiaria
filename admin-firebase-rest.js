(function () {
  const API_KEY = "AIzaSyBfJZWHjr3AIANDBj2p8uQ0_hbcHdmnSiE";
  const DATABASE_URL = "https://navisuite-f116f-default-rtdb.europe-west1.firebasedatabase.app";
  const AUTH_KEY = "navisuite.adminFirebaseAuth.v1";

  function readAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); }
    catch (_) { return null; }
  }

  function saveAuth(value) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(value));
    return value;
  }

  async function signUp() {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(API_KEY)}`,
      {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({returnSecureToken:true})
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "Autenticazione Firebase non riuscita");
    return saveAuth({
      uid:data.localId,
      idToken:data.idToken,
      refreshToken:data.refreshToken,
      expiresAt:Date.now() + Number(data.expiresIn || 3600) * 1000
    });
  }

  async function refreshAuth(auth) {
    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(API_KEY)}`,
      {
        method:"POST",
        headers:{"Content-Type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({
          grant_type:"refresh_token",
          refresh_token:auth.refreshToken
        })
      }
    );
    const data = await response.json();
    if (!response.ok) return signUp();
    return saveAuth({
      uid:data.user_id,
      idToken:data.id_token,
      refreshToken:data.refresh_token,
      expiresAt:Date.now() + Number(data.expires_in || 3600) * 1000
    });
  }

  async function ensureAuth() {
    const auth = readAuth();
    if (auth?.idToken && auth?.uid && Number(auth.expiresAt || 0) > Date.now() + 60000) return auth;
    if (auth?.refreshToken) return refreshAuth(auth);
    return signUp();
  }

  async function databaseRequest(path, options = {}) {
    const auth = await ensureAuth();
    const url = `${DATABASE_URL}/${String(path).replace(/^\/+/, "")}.json?auth=${encodeURIComponent(auth.idToken)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        ...options,
        signal:controller.signal,
        headers:{"Content-Type":"application/json", ...(options.headers || {})}
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.error || `Firebase HTTP ${response.status}`;
        throw new Error(message === "Permission denied" ? "Permesso negato dalle regole Firebase" : message);
      }
      return { data, auth };
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Firebase non risponde entro 15 secondi");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  const ready = ensureAuth().then(auth => ({ uid:auth.uid }));

  function normalizeChangeRequest(id, value) {
    return { ...(value || {}), id:String(value?.id || id) };
  }

  async function listChangeRequests(agentId) {
    const [result, deletedResult] = await Promise.all([
      databaseRequest("private/changeRequests"),
      databaseRequest("private/adminUpdates/deletedChangeRequests")
    ]);
    const target = String(agentId || "");
    const deleted = new Set(Object.entries(deletedResult.data || {}).flatMap(([id, value]) => [String(id), String(value?.requestId || "")]).filter(Boolean));
    return Object.entries(result.data || {})
      .map(([id, value]) => normalizeChangeRequest(id, value))
      .filter(item => !deleted.has(String(item.id)))
      .filter(item => !target || String(item.agentId || "") === target || String(item.colleagueId || "") === target)
      .sort((a, b) => String(b.sentAt || "").localeCompare(String(a.sentAt || "")));
  }

  async function saveChangeRequest(payload = {}) {
    const auth = await ensureAuth();
    const id = `REQ_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const item = {
      ...payload,
      action:undefined,
      id,
      ownerUid:auth.uid,
      sentAt:payload.sentAt || new Date().toISOString()
    };
    Object.keys(item).forEach(key => item[key] === undefined && delete item[key]);
    await databaseRequest(`private/changeRequests/${id}`, {
      method:"PUT",
      body:JSON.stringify(item)
    });
    return normalizeChangeRequest(id, item);
  }

  async function deleteChangeRequest(requestId) {
    const id = String(requestId);
    try {
      await databaseRequest(`private/changeRequests/${encodeURIComponent(id)}`, { method:"DELETE" });
    } catch (error) {
      if (!/permesso|permission/i.test(String(error?.message || ""))) throw error;
      const safeId = id.replace(/[.#$\[\]/]/g, "_");
      await databaseRequest(`private/adminUpdates/deletedChangeRequests/${safeId}`, {
        method:"PUT",
        body:JSON.stringify({requestId:id,deletedAt:new Date().toISOString()})
      });
    }
    return true;
  }

  async function getAdminUpdates() {
    const [owner, updated, ods, manual, baristas, approvals, dismissedOds] = await Promise.all([
      databaseRequest("private/adminUpdates/ownerUid"),
      databaseRequest("private/adminUpdates/updatedAt"),
      databaseRequest("private/adminUpdates/odsVariations"),
      databaseRequest("private/adminUpdates/manualVariations"),
      databaseRequest("private/adminUpdates/baristas"),
      databaseRequest("private/adminUpdates/approvedChangeRequests"),
      databaseRequest("private/adminUpdates/dismissedOdsApprovals")
    ]);
    const asArray = input => Array.isArray(input) ? input.filter(Boolean) : Object.values(input || {});
    return {
      ownerUid:String(owner.data || ""),
      currentUid:owner.auth.uid,
      updatedAt:String(updated.data || ""),
      odsVariations:asArray(ods.data),
      manualVariations:asArray(manual.data),
      baristas:asArray(baristas.data),
      approvedChangeRequests:asArray(approvals.data),
      dismissedOdsApprovals:asArray(dismissedOds.data)
    };
  }

  async function saveAdminUpdates(payload = {}) {
    const auth = await ensureAuth();
    const item = {
      ownerUid:auth.uid,
      updatedAt:new Date().toISOString(),
      odsVariations:Array.isArray(payload.odsVariations) ? payload.odsVariations : [],
      manualVariations:Array.isArray(payload.manualVariations) ? payload.manualVariations : [],
      baristas:Array.isArray(payload.baristas) ? payload.baristas : [],
      approvedChangeRequests:Array.isArray(payload.approvedChangeRequests) ? payload.approvedChangeRequests : [],
      dismissedOdsApprovals:Array.isArray(payload.dismissedOdsApprovals) ? payload.dismissedOdsApprovals : []
    };
    await databaseRequest("private/adminUpdates", {
      method:"PATCH",
      body:JSON.stringify(item)
    });
    return { ...item, currentUid:auth.uid };
  }

  async function getAdminDocuments() {
    const result = await databaseRequest("private/adminUpdates/documentsMeta");
    return Object.entries(result.data || {}).map(([id, value]) => ({ ...(value || {}), id:String(value?.id || id) }));
  }

  async function getAdminDocumentFile(documentId) {
    const result = await databaseRequest(`private/adminUpdates/documentsFiles/${encodeURIComponent(String(documentId))}`);
    return String(result.data?.dataUrl || "");
  }

  async function saveAdminDocument(metadata, dataUrl) {
    const auth = await ensureAuth();
    const id = String(metadata?.id || `DOC_${Date.now()}`).replace(/[.#$\[\]/]/g, "_");
    await databaseRequest("private/adminUpdates", {
      method:"PATCH",
      body:JSON.stringify({
        ownerUid:auth.uid,
        updatedAt:new Date().toISOString(),
        [`documentsMeta/${id}`]:{...metadata,id,ownerUid:auth.uid,uploadedAt:new Date().toISOString()},
        [`documentsFiles/${id}`]:{dataUrl:String(dataUrl||"")}
      })
    });
    return id;
  }

  async function deleteAdminDocument(documentId) {
    const id = String(documentId).replace(/[.#$\[\]/]/g, "_");
    await databaseRequest("private/adminUpdates", {
      method:"PATCH",
      body:JSON.stringify({
        [`documentsMeta/${id}`]:null,
        [`documentsFiles/${id}`]:null
      })
    });
    return true;
  }

  window.NaviAdminFirebase = {
    ready,
    listChangeRequests,
    saveChangeRequest,
    deleteChangeRequest,
    getAdminUpdates,
    saveAdminUpdates,
    getAdminDocuments,
    getAdminDocumentFile,
    saveAdminDocument,
    deleteAdminDocument,
    provider:"Firebase REST"
  };
})();
