/**
 * NAVIDIARIA — estensione cloud per la Web App NAVITURNI.
 *
 * Incollare questo file nello stesso progetto Apps Script che contiene
 * generaNaviturni(), jsonOutput(), NAVITURNI_CONFIG e Foglio1.
 * Le schede NAVIDIARIA_UTENTI e NAVIDIARIA_DATI vengono create automaticamente.
 */

const NAVIDIARIA_CLOUD_CONFIG = {
  usersSheetName: "NAVIDIARIA_UTENTI",
  dataSheetName: "NAVIDIARIA_DATI",
  documentsSheetName: "NAVI_DOCUMENTI",
  documentsFolderName: "NaviDiaria - Documenti condivisi",
  adminAgentId: "92",
  movementAgentId: "MOVIMENTO",
  maxPayloadChars: 45000,
  maxPdfBytes: 10 * 1024 * 1024
};

function doPost(e) {
  try {
    const request = JSON.parse(e && e.postData && e.postData.contents || "{}");
    const action = String(request.action || "").trim().toLowerCase();
    if (!action) throw new Error("Azione mancante.");

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const sheets = ensureNavidiariaCloudSheets_();
      if (action === "auth") return jsonOutput(authNavidiaria_(sheets, request));

      const user = authenticateNavidiaria_(sheets.users, request.agentId, request.pinHash);
      if (action === "load_diaria") return jsonOutput(loadNavidiaria_(sheets.data, user));
      if (action === "save_diaria") return jsonOutput(saveNavidiaria_(sheets.data, user, request.entries));
      if (action === "list_users") return jsonOutput(listNavidiariaUsers_(sheets.users, user));
      if (action === "reset_pin") return jsonOutput(resetNavidiariaPin_(sheets.users, user, request.targetAgentId));
      if (action === "change_pin") return jsonOutput(changeNavidiariaPin_(sheets.users, user, request.newPinHash));
      if (action === "reset_own_pin") return jsonOutput(resetNavidiariaOwnPin_(sheets.users, user));
      if (action === "list_documents") return jsonOutput(listNaviDocuments_(sheets.documents));
      if (action === "upload_document") return jsonOutput(uploadNaviDocument_(sheets.documents, user, request));
      if (action === "delete_document") return jsonOutput(deleteNaviDocument_(sheets.documents, user, request.documentId));
      throw new Error("Azione non riconosciuta: " + action);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonOutput({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function ensureNavidiariaCloudSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let users = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.usersSheetName);
  let data = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.dataSheetName);
  let documents = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.documentsSheetName);

  if (!users) users = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.usersSheetName);
  if (!data) data = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.dataSheetName);
  if (!documents) documents = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.documentsSheetName);

  ensureNavidiariaHeader_(users, ["ID_AGENTE", "AGENTE", "PIN_HASH", "REGISTRATO_IL", "ULTIMO_ACCESSO"]);
  ensureNavidiariaHeader_(data, ["ID_AGENTE", "JSON_DATI", "VERSIONE", "AGGIORNATO_IL"]);
  ensureNavidiariaHeader_(documents, ["ID_FILE", "TIPO", "TITOLO", "CREATO_IL", "CARICATO_DA", "URL"]);
  users.hideColumns(3);
  users.setFrozenRows(1);
  data.setFrozenRows(1);
  documents.setFrozenRows(1);
  return { users: users, data: data, documents: documents };
}

function ensureNavidiariaHeader_(sheet, headers) {
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const current = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (current.join("|") !== headers.join("|")) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setBackground("#15313d").setFontColor("#ffffff").setFontWeight("bold");
}

function authNavidiaria_(sheets, request) {
  const agentId = cleanNavidiariaId_(request.agentId);
  const pinHash = cleanNavidiariaHash_(request.pinHash);
  if (!agentId || !pinHash) throw new Error("ID agente o PIN non valido.");

  const directoryAgent = agentId === NAVIDIARIA_CLOUD_CONFIG.movementAgentId
    ? { id: agentId, name: "Movimento", qualifica: "amministratore", residence: "UFFICIO MOVIMENTO", role: "admin" }
    : findNavidiariaDirectoryAgent_(agentId);
  if (!directoryAgent) throw new Error("Agente non presente in Foglio1.");

  const found = findNavidiariaRow_(sheets.users, agentId);
  const now = new Date();
  if (!found) {
    sheets.users.appendRow([agentId, directoryAgent.name, pinHash, now, now]);
    return { ok: true, registered: true, agent: directoryAgent };
  }

  const savedHash = String(found.values[2] || "");
  if (savedHash && savedHash !== pinHash) throw new Error("PIN non corretto.");
  sheets.users.getRange(found.row, 2, 1, 4).setValues([[
    directoryAgent.name,
    pinHash,
    found.values[3] || now,
    now
  ]]);
  return { ok: true, registered: !savedHash, agent: directoryAgent };
}

function authenticateNavidiaria_(usersSheet, agentIdValue, pinHashValue) {
  const agentId = cleanNavidiariaId_(agentIdValue);
  const pinHash = cleanNavidiariaHash_(pinHashValue);
  const found = findNavidiariaRow_(usersSheet, agentId);
  if (!found || !found.values[2] || String(found.values[2]) !== pinHash) throw new Error("Sessione non valida: accedi nuovamente.");
  return { id: agentId, name: String(found.values[1] || "") };
}

function loadNavidiaria_(dataSheet, user) {
  const found = findNavidiariaRow_(dataSheet, user.id);
  if (!found) return { ok: true, entries: [], version: 0, updatedAt: "" };
  let entries = [];
  try { entries = JSON.parse(String(found.values[1] || "[]")); } catch (error) { throw new Error("Archivio Diaria online non leggibile."); }
  return {
    ok: true,
    entries: Array.isArray(entries) ? entries : [],
    version: Number(found.values[2]) || 0,
    updatedAt: formatNavidiariaDate_(found.values[3])
  };
}

function saveNavidiaria_(dataSheet, user, entriesValue) {
  if (!Array.isArray(entriesValue)) throw new Error("Dati Diaria non validi.");
  if (entriesValue.length > 2000) throw new Error("Il registro contiene troppe righe.");
  const entries = entriesValue.map(sanitizeNavidiariaEntry_);
  const json = JSON.stringify(entries);
  if (json.length > NAVIDIARIA_CLOUD_CONFIG.maxPayloadChars) throw new Error("Archivio troppo grande per una singola scheda: contatta l’amministratore.");

  const found = findNavidiariaRow_(dataSheet, user.id);
  const version = found ? (Number(found.values[2]) || 0) + 1 : 1;
  const now = new Date();
  const row = [user.id, json, version, now];
  if (found) dataSheet.getRange(found.row, 1, 1, 4).setValues([row]);
  else dataSheet.appendRow(row);
  return { ok: true, version: version, updatedAt: formatNavidiariaDate_(now) };
}

function listNavidiariaUsers_(usersSheet, user) {
  requireNavidiariaAdmin_(user);
  if (usersSheet.getLastRow() < 2) return { ok: true, users: [] };
  const values = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 5).getValues();
  return {
    ok: true,
    users: values.filter(function(row) { return row[0] && row[2]; }).map(function(row) {
      return {
        id: cleanNavidiariaId_(row[0]),
        name: String(row[1] || ""),
        registeredAt: formatNavidiariaDate_(row[3]),
        lastAccess: formatNavidiariaDate_(row[4])
      };
    })
  };
}

function resetNavidiariaPin_(usersSheet, user, targetAgentIdValue) {
  requireNavidiariaAdmin_(user);
  const targetAgentId = cleanNavidiariaId_(targetAgentIdValue);
  const found = findNavidiariaRow_(usersSheet, targetAgentId);
  if (!found) throw new Error("Utente non registrato.");
  usersSheet.getRange(found.row, 3).clearContent();
  return { ok: true };
}

function changeNavidiariaPin_(usersSheet, user, newPinHashValue) {
  const newPinHash = cleanNavidiariaHash_(newPinHashValue);
  if (!newPinHash) throw new Error("Nuovo PIN non valido.");
  const found = findNavidiariaRow_(usersSheet, user.id);
  if (!found) throw new Error("Utente non registrato.");
  usersSheet.getRange(found.row, 3).setValue(newPinHash);
  return { ok: true };
}

function resetNavidiariaOwnPin_(usersSheet, user) {
  const found = findNavidiariaRow_(usersSheet, user.id);
  if (!found) throw new Error("Utente non registrato.");
  usersSheet.getRange(found.row, 3).clearContent();
  return { ok: true };
}

function requireNavidiariaAdmin_(user) {
  const id = String(user.id);
  if (id !== NAVIDIARIA_CLOUD_CONFIG.adminAgentId && id !== NAVIDIARIA_CLOUD_CONFIG.movementAgentId) {
    throw new Error("Operazione riservata all’amministratore.");
  }
}

function listNaviDocuments_(documentsSheet) {
  if (documentsSheet.getLastRow() < 2) return { ok: true, documents: [] };
  const rows = documentsSheet.getRange(2, 1, documentsSheet.getLastRow() - 1, 6).getValues();
  return {
    ok: true,
    documents: rows.filter(function(row) { return row[0] && row[5]; }).map(function(row) {
      return {
        id: String(row[0]), type: String(row[1] || "turno"), title: String(row[2] || "Documento.pdf"),
        createdAt: formatNavidiariaDate_(row[3]), uploadedBy: String(row[4] || ""), url: String(row[5] || "")
      };
    })
  };
}

function uploadNaviDocument_(documentsSheet, user, request) {
  requireNavidiariaAdmin_(user);
  const type = String(request.documentType || "").trim().toLowerCase();
  if (["turno", "bozza", "ods"].indexOf(type) < 0) throw new Error("Tipo documento non valido.");
  const title = String(request.title || "").trim().replace(/\s+/g, "_").slice(0, 180);
  if (!title || !/\.pdf$/i.test(title)) throw new Error("Il file deve mantenere l'estensione .pdf.");
  const base64 = String(request.base64 || "").replace(/^data:application\/pdf;base64,/i, "");
  if (!base64) throw new Error("Contenuto PDF mancante.");
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > NAVIDIARIA_CLOUD_CONFIG.maxPdfBytes) throw new Error("Il PDF non può superare 10 MB.");
  const folder = getNaviDocumentsFolder_();
  const file = folder.createFile(Utilities.newBlob(bytes, MimeType.PDF, title));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const now = new Date();
  const url = "https://drive.google.com/file/d/" + file.getId() + "/view";
  documentsSheet.appendRow([file.getId(), type, title, now, user.id, url]);
  let imported = null;
  let analysisError = "";
  if (type === "ods" && request.analysis) {
    try {
      if (typeof importaOdsDaPdf !== "function") throw new Error("Importatore ODS non disponibile nel progetto Apps Script.");
      const analysis = sanitizeNaviPdfAnalysis_(request.analysis);
      imported = importaOdsDaPdf(analysis.text, analysis.pages, analysis.ods, title);
    } catch (error) {
      analysisError = error && error.message ? error.message : String(error);
    }
  }
  return {
    ok: true,
    document: { id: file.getId(), type: type, title: title, createdAt: formatNavidiariaDate_(now), uploadedBy: user.id, url: url },
    imported: imported,
    analysisError: analysisError
  };
}

function sanitizeNaviPdfAnalysis_(value) {
  if (!value || typeof value !== "object") throw new Error("Analisi PDF mancante.");
  const text = String(value.text || "").slice(0, 250000);
  const ods = String(value.ods || "").trim().slice(0, 80);
  const pages = (Array.isArray(value.pages) ? value.pages : []).slice(0, 20).map(function(page) {
    return {
      items: (page && Array.isArray(page.items) ? page.items : []).slice(0, 5000).map(function(item) {
        return { x: Number(item.x) || 0, y: Number(item.y) || 0, s: String(item.s || "").slice(0, 200) };
      })
    };
  });
  if (!text) throw new Error("Il PDF non contiene testo leggibile.");
  return { text: text, pages: pages, ods: ods };
}

function deleteNaviDocument_(documentsSheet, user, documentIdValue) {
  requireNavidiariaAdmin_(user);
  const documentId = String(documentIdValue || "").trim();
  if (!documentId) throw new Error("Documento non valido.");
  const found = findNavidiariaRow_(documentsSheet, documentId);
  if (!found) throw new Error("Documento non trovato.");
  try { DriveApp.getFileById(documentId).setTrashed(true); } catch (error) { /* Rimuove comunque la voce. */ }
  documentsSheet.deleteRow(found.row);
  return { ok: true };
}

function getNaviDocumentsFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty("NAVI_DOCUMENTS_FOLDER_ID");
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (error) { properties.deleteProperty("NAVI_DOCUMENTS_FOLDER_ID"); }
  }
  const folders = DriveApp.getFoldersByName(NAVIDIARIA_CLOUD_CONFIG.documentsFolderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(NAVIDIARIA_CLOUD_CONFIG.documentsFolderName);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  properties.setProperty("NAVI_DOCUMENTS_FOLDER_ID", folder.getId());
  return folder;
}

function sanitizeNavidiariaEntry_(entry) {
  if (!entry || typeof entry !== "object") throw new Error("Riga Diaria non valida.");
  const output = {};
  Object.keys(entry).slice(0, 30).forEach(function(key) {
    const value = entry[key];
    if (["string", "number", "boolean"].indexOf(typeof value) >= 0 || value === null) output[String(key).slice(0, 40)] = value;
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(output.date || ""))) throw new Error("Data Diaria non valida.");
  return output;
}

function findNavidiariaDirectoryAgent_(agentId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NAVITURNI_CONFIG.sheetName);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getDisplayValues();
  for (let i = 0; i < rows.length; i++) {
    if (cleanNavidiariaId_(rows[i][1]) === agentId) {
      return {
        id: agentId,
        name: String(rows[i][3] || "").trim(),
        qualifica: typeof normalizzaQualifica === "function" ? normalizzaQualifica(rows[i][2]) : String(rows[i][2] || "marinaio"),
        residence: String(rows[i][0] || "").trim().toUpperCase()
      };
    }
  }
  return null;
}

function findNavidiariaRow_(sheet, agentId) {
  if (!agentId || sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (cleanNavidiariaId_(values[i][0]) === agentId) return { row: i + 2, values: values[i] };
  }
  return null;
}

function cleanNavidiariaId_(value) {
  return String(value === null || value === undefined ? "" : value).trim().replace(/\.0$/, "");
}

function cleanNavidiariaHash_(value) {
  const hash = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : "";
}

function formatNavidiariaDate_(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "";
  return Utilities.formatDate(date, Session.getScriptTimeZone() || "Europe/Rome", "yyyy-MM-dd'T'HH:mm:ss");
}
