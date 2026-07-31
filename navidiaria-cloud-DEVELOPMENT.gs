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
  directorySheetName: "NAVI_UTENTI",
  telegramSheetName: "NAVI_TELEGRAM",
  changeRequestsSheetName: "NAVI_RICHIESTE_CAMBIO",
  weeksSheetName: "NAVI_SETTIMANE",
  documentsFolderName: "NaviDiaria - Documenti condivisi",
  adminAgentId: "91",
  adminAgentIds: ["91", "92"],
  movementAgentId: "MOVIMENTO",
  maxPayloadChars: 45000,
  maxPdfBytes: 10 * 1024 * 1024
};

function doPost(e) {
  try {
    const request = JSON.parse(e && e.postData && e.postData.contents || "{}");
    if (request && (request.update_id || request.message || request.callback_query)) {
      return jsonOutput(handleNaviTelegramWebhook_(request));
    }

    const action = String(request.action || "").trim().toLowerCase();
    if (!action) throw new Error("Azione mancante.");

    // Le letture non devono mai attendere LockService.
    // In questo modo più pagine/dispositivi possono caricare insieme senza timeout.
    if (action === "week_status_public") {
      return jsonOutput(listNaviWeekStatusPublic_());
    }

    const readSheets = getNavidiariaCloudSheets_();
    if (action === "directory") {
      return jsonOutput(listNaviPublicDirectory_(readSheets.directory));
    }
    if (action === "list_change_requests") {
      return jsonOutput(listNaviChangeRequests_(readSheets.changeRequests, request.agentId));
    }

    // Login e operazioni di scrittura: blocco breve e circoscritto.
    if (isNaviCloudWriteAction_(action)) {
      return jsonOutput(withNaviCloudWriteLock_(function() {
        const sheets = ensureNavidiariaCloudSheets_();
        if (action === "auth") return authNavidiaria_(sheets, request);
        if (action === "save_change_request") return saveNaviChangeRequest_(sheets.changeRequests, request);
        if (action === "delete_change_request") return deleteNaviChangeRequest_(sheets.changeRequests, request);
        if (action === "save_week_status") {
          const user = authenticateNavidiaria_(sheets.users, request.agentId, request.pinHash);
          return saveNaviWeekStatus_(sheets.weeks, user, request.statuses);
        }

        const user = authenticateNavidiaria_(sheets.users, request.agentId, request.pinHash);
        if (action === "save_diaria") return saveNavidiaria_(sheets.data, user, request.entries);
        if (action === "update_user") return updateNaviDirectoryUser_(sheets.directory, user, request);
        if (action === "reset_pin") return resetNavidiariaPin_(sheets.users, user, request.targetAgentId);
        if (action === "change_pin") return changeNavidiariaPin_(sheets.users, user, request.newPinHash);
        if (action === "reset_own_pin") return resetNavidiariaOwnPin_(sheets.users, user);
        if (action === "telegram_link") return createNaviTelegramLink_(sheets.telegram, user);
        if (action === "telegram_preferences") return saveNaviTelegramPreferences_(sheets.telegram, user, request);
        if (action === "telegram_disconnect") return disconnectNaviTelegram_(sheets.telegram, user);
        if (action === "upload_document") return uploadNaviDocument_(sheets.documents, user, request);
        if (action === "delete_document") return deleteNaviDocument_(sheets.documents, user, request.documentId);
        throw new Error("Azione di scrittura non riconosciuta: " + action);
      }));
    }

    // Letture autenticate, sempre senza lock.
    const user = authenticateNavidiaria_(readSheets.users, request.agentId, request.pinHash);
    if (action === "load_diaria") return jsonOutput(loadNavidiaria_(readSheets.data, user));
    if (action === "list_users") return jsonOutput(listNavidiariaUsers_(readSheets.users, user));
    if (action === "list_week_status") { requireNavidiariaAdmin_(user); return jsonOutput(listNaviWeekStatus_(readSheets.weeks)); }
    if (action === "admin_directory") return jsonOutput(listNaviAdminDirectory_(readSheets.directory, user));
    if (action === "telegram_status") return jsonOutput(getNaviTelegramStatus_(readSheets.telegram, user));
    if (action === "list_documents") return jsonOutput(listNaviDocuments_(readSheets.documents));
    if (action === "variation_status") return jsonOutput(getNaviVariationStatus_(readSheets.documents));

    throw new Error("Azione non riconosciuta: " + action);
  } catch (error) {
    return jsonOutput({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function isNaviCloudWriteAction_(action) {
  return [
    "auth",
    "save_change_request",
    "delete_change_request",
    "save_week_status",
    "save_diaria",
    "update_user",
    "reset_pin",
    "change_pin",
    "reset_own_pin",
    "telegram_link",
    "telegram_preferences",
    "telegram_disconnect",
    "upload_document",
    "delete_document"
  ].indexOf(action) !== -1;
}

function withNaviCloudWriteLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error("Archivio momentaneamente occupato. Riprova tra qualche secondo.");
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function getNavidiariaCloudSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    users: ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.usersSheetName),
    data: ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.dataSheetName),
    documents: ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.documentsSheetName),
    directory: ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.directorySheetName),
    telegram: ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.telegramSheetName),
    changeRequests: ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.changeRequestsSheetName),
    weeks: ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.weeksSheetName)
  };
}

function listNaviWeekStatusPublic_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.weeksSheetName);
  return listNaviWeekStatus_(sheet);
}

function listNaviWeekStatus_(weeksSheet) {
  const available = buildNaviWeeksFromFoglio1_();
  const saved = {};
  if (weeksSheet && weeksSheet.getLastRow() > 1) {
    const rows = weeksSheet.getRange(2, 1, weeksSheet.getLastRow() - 1, 5).getDisplayValues();
    rows.forEach(function(row) {
      const start = String(row[0] || "").trim();
      const state = normalizeNaviWeekState_(row[2]);
      if (start && state) saved[start] = state;
    });
  }
  return {
    ok: true,
    weeks: available.map(function(week) {
      return { start:week.start, end:week.end, days:week.days, state:saved[week.start] || "ufficiale" };
    })
  };
}

function saveNaviWeekStatus_(weeksSheet, user, statusesValue) {
  requireNavidiariaAdmin_(user);
  if (!Array.isArray(statusesValue)) throw new Error("Calendario settimane non valido.");
  const available = buildNaviWeeksFromFoglio1_();
  const allowed = {};
  available.forEach(function(week) { allowed[week.start] = week; });
  const now = new Date();
  const rows = statusesValue.map(function(item) {
    const start = String(item && item.start || "").trim();
    const week = allowed[start];
    const state = normalizeNaviWeekState_(item && item.state);
    if (!week || !state) throw new Error("Settimana o stato non valido: " + start);
    return [week.start, week.end, state, now, user.id];
  });
  if (weeksSheet.getLastRow() > 1) weeksSheet.getRange(2, 1, weeksSheet.getLastRow() - 1, 5).clearContent();
  if (rows.length) weeksSheet.getRange(2, 1, rows.length, 5).setValues(rows);
  return { ok:true, saved:rows.length, updatedAt:formatNavidiariaDate_(now) };
}

function normalizeNaviWeekState_(value) {
  const state = String(value || "").trim().toLowerCase();
  return ["ufficiale", "bozza", "nascosta"].indexOf(state) >= 0 ? state : "";
}

function buildNaviWeeksFromFoglio1_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NAVITURNI_CONFIG.sheetName);
  if (!sheet || sheet.getLastColumn() < 5) return [];
  const headers = sheet.getRange(1, 5, 1, sheet.getLastColumn() - 4).getDisplayValues()[0];
  const yearFallback = new Date().getFullYear();
  const dates = [];
  headers.forEach(function(header) {
    const match = String(header || "").trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?/);
    if (!match) return;
    const date = new Date(Number(match[3] || yearFallback), Number(match[2]) - 1, Number(match[1]), 12, 0, 0);
    if (isNaN(date.getTime())) return;
    dates.push(date);
  });
  const groups = {};
  dates.forEach(function(date) {
    const monday = new Date(date);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - ((day + 6) % 7));
    const key = Utilities.formatDate(monday, Session.getScriptTimeZone() || "Europe/Rome", "yyyy-MM-dd");
    if (!groups[key]) groups[key] = [];
    groups[key].push(date);
  });
  return Object.keys(groups).sort().map(function(start) {
    const days = groups[start].sort(function(a,b){ return a-b; });
    return {
      start:start,
      end:Utilities.formatDate(days[days.length - 1], Session.getScriptTimeZone() || "Europe/Rome", "yyyy-MM-dd"),
      days:days.length
    };
  });
}

function getNaviVariationStatus_(documentsSheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NAVITURNI_CONFIG.variationsSheetName);
  if (!sheet || sheet.getLastRow() < 2) return { ok:true, variationStatus:null };
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getDisplayValues();
  const counts = {};
  rows.forEach(function(row) {
    if (String(row[0] || "").trim().toUpperCase() === "NO") return;
    const ods = String(row[6] || "").trim();
    if (!ods) return;
    counts[ods] = (counts[ods] || 0) + 1;
  });
  const candidates = Object.keys(counts).filter(function(ods) { return counts[ods] > 1; }).map(function(ods) {
    const match = ods.match(/(\d{1,3})(?:\s*\/\s*(20\d{2}))?/);
    return { ods:ods, number:match ? Number(match[1]) : 0, year:match && match[2] ? Number(match[2]) : 0, count:counts[ods] };
  }).sort(function(a, b) { return b.year - a.year || b.number - a.number; });
  if (!candidates.length) return { ok:true, variationStatus:null };
  const latest = candidates[0];
  let date = "";
  if (documentsSheet && documentsSheet.getLastRow() > 1) {
    const documents = documentsSheet.getRange(2, 1, documentsSheet.getLastRow() - 1, 6).getValues();
    for (let index = documents.length - 1; index >= 0; index--) {
      if (String(documents[index][1] || "").toLowerCase() !== "ods") continue;
      const title = String(documents[index][2] || "");
      const number = (title.match(/(?:o\.?d\.?s\.?|servizio|n)[^0-9]{0,12}(\d{1,3})/i) || title.match(/(\d{1,3})/));
      if (!number || Number(number[1]) !== latest.number) continue;
      const titleDate = title.match(/(\d{2})[-_.](\d{2})[-_.](20\d{2})/);
      if (titleDate) date = titleDate[1] + "/" + titleDate[2] + "/" + titleDate[3];
      else if (documents[index][3] instanceof Date) date = Utilities.formatDate(documents[index][3], Session.getScriptTimeZone() || "Europe/Rome", "dd/MM/yyyy");
      break;
    }
  }
  return { ok:true, variationStatus:{ ods:latest.ods, number:latest.number, date:date, count:latest.count } };
}

function ensureNavidiariaCloudSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let users = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.usersSheetName);
  let data = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.dataSheetName);
  let documents = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.documentsSheetName);
  let directory = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.directorySheetName);
  let telegram = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.telegramSheetName);
  let changeRequests = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.changeRequestsSheetName);
  let weeks = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.weeksSheetName);

  if (!users) users = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.usersSheetName);
  if (!data) data = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.dataSheetName);
  if (!documents) documents = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.documentsSheetName);
  if (!directory) directory = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.directorySheetName);
  if (!telegram) telegram = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.telegramSheetName);
  if (!changeRequests) changeRequests = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.changeRequestsSheetName);
  if (!weeks) weeks = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.weeksSheetName);

  ensureNavidiariaHeader_(users, ["ID_AGENTE", "AGENTE", "PIN_HASH", "REGISTRATO_IL", "ULTIMO_ACCESSO"]);
  ensureNavidiariaHeader_(data, ["ID_AGENTE", "JSON_DATI", "VERSIONE", "AGGIORNATO_IL"]);
  ensureNavidiariaHeader_(documents, ["ID_FILE", "TIPO", "TITOLO", "CREATO_IL", "CARICATO_DA", "URL"]);
  ensureNavidiariaHeader_(directory, ["ID", "NOME", "RUOLO", "QUALIFICA", "RESIDENZA", "ATTIVO", "REGISTRATO", "REGISTRATO_IL", "ULTIMO_ACCESSO"]);
  ensureNavidiariaHeader_(telegram, ["ID_AGENTE", "AGENTE", "CHAT_ID", "USERNAME", "ATTIVO", "ORA_INVIO", "RESIDENZA", "COLLEGATO_IL", "ULTIMO_INVIO"]);
  ensureNavidiariaHeader_(changeRequests, ["ID_RICHIESTA", "ID_AGENTE", "AGENTE", "ID_COLLEGA", "COLLEGA", "INVIATA_IL", "CAMBI_JSON", "TESTO_MAIL"]);
  ensureNavidiariaHeader_(weeks, ["INIZIO", "FINE", "STATO", "AGGIORNATO_IL", "AGGIORNATO_DA"]);

  syncNaviDirectory_(ss, directory, users);

  users.hideColumns(3);
  users.setFrozenRows(1);
  data.setFrozenRows(1);
  documents.setFrozenRows(1);
  directory.setFrozenRows(1);
  telegram.setFrozenRows(1);
  changeRequests.setFrozenRows(1);
  weeks.setFrozenRows(1);
  return { users: users, data: data, documents: documents, directory: directory, telegram: telegram, changeRequests: changeRequests, weeks: weeks };
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

  const directoryAgent = findNaviDirectoryUser_(sheets.directory, agentId);
  if (!directoryAgent) throw new Error("Utente non presente oppure disattivato in NAVI_UTENTI.");

  const found = findNavidiariaRow_(sheets.users, agentId);
  const now = new Date();
  if (!found) {
    sheets.users.appendRow([agentId, directoryAgent.name, pinHash, now, now]);
    updateNaviDirectoryRegistration_(sheets.directory, agentId, true, formatNavidiariaDate_(now), formatNavidiariaDate_(now));
    return { ok: true, registered: false, firstAccess: true, agent: directoryAgent };
  }

  const savedHash = String(found.values[2] || "");
  if (savedHash && savedHash !== pinHash) throw new Error("PIN non corretto.");
  sheets.users.getRange(found.row, 2, 1, 4).setValues([[
    directoryAgent.name,
    pinHash,
    found.values[3] || now,
    now
  ]]);
  updateNaviDirectoryRegistration_(sheets.directory, agentId, true, formatNavidiariaDate_(found.values[3] || now), formatNavidiariaDate_(now));
  return { ok: true, registered: true, firstAccess: !savedHash, agent: directoryAgent };
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


function listNaviPublicDirectory_(directorySheet) {
  if (!directorySheet || directorySheet.getLastRow() < 2) return { ok: true, users: [] };
  const rows = directorySheet.getRange(2, 1, directorySheet.getLastRow() - 1, 9).getDisplayValues();
  return {
    ok: true,
    users: rows
      .filter(function(row) {
        return row[0] && !/^(no|false|0)$/i.test(String(row[5] || "").trim());
      })
      .map(function(row) {
        return {
          id: cleanNavidiariaId_(row[0]),
          name: String(row[1] || "").trim(),
          role: String(row[2] || "agent").trim().toLowerCase(),
          qualifica: String(row[3] || "").trim().toLowerCase(),
          residence: String(row[4] || "").trim().toUpperCase(),
          registered: /^(si|true|1)$/i.test(String(row[6] || "").trim())
        };
      })
  };
}

function listNaviAdminDirectory_(directorySheet, user) {
  requireNavidiariaAdmin_(user);
  if (!directorySheet || directorySheet.getLastRow() < 2) return { ok: true, users: [] };
  const rows = directorySheet.getRange(2, 1, directorySheet.getLastRow() - 1, 9).getDisplayValues();
  return {
    ok: true,
    users: rows.filter(function(row) { return row[0]; }).map(function(row) {
      return {
        id: cleanNavidiariaId_(row[0]),
        name: String(row[1] || "").trim(),
        role: String(row[2] || "agent").trim().toLowerCase(),
        qualifica: String(row[3] || "").trim().toLowerCase(),
        residence: String(row[4] || "").trim().toUpperCase(),
        active: !/^(no|false|0)$/i.test(String(row[5] || "").trim()),
        registered: /^(si|true|1)$/i.test(String(row[6] || "").trim()),
        registeredAt: String(row[7] || "").trim(),
        lastAccess: String(row[8] || "").trim()
      };
    })
  };
}

function updateNaviDirectoryUser_(directorySheet, user, request) {
  requireNavidiariaAdmin_(user);
  const targetId = cleanNavidiariaId_(request.targetAgentId);
  if (!targetId) throw new Error("Utente da modificare non valido.");
  if (!directorySheet || directorySheet.getLastRow() < 2) throw new Error("Directory utenti non disponibile.");

  const allowedRoles = ["agent", "admin", "barista"];
  const role = String(request.role || "agent").trim().toLowerCase();
  if (allowedRoles.indexOf(role) < 0) throw new Error("Ruolo non valido.");

  const qualifica = String(request.qualifica || "").trim().toLowerCase().slice(0, 60);
  if (!qualifica) throw new Error("Grado o qualifica mancante.");

  const active = request.active === true || /^(si|true|1)$/i.test(String(request.active || ""));
  const ids = directorySheet.getRange(2, 1, directorySheet.getLastRow() - 1, 1).getDisplayValues();

  for (let i = 0; i < ids.length; i++) {
    if (cleanNavidiariaId_(ids[i][0]) !== targetId) continue;
    directorySheet.getRange(i + 2, 3, 1, 4).setValues([[
      role,
      qualifica,
      String(request.residence || directorySheet.getRange(i + 2, 5).getDisplayValue()).trim().toUpperCase(),
      active ? "SI" : "NO"
    ]]);
    return { ok: true, id: targetId };
  }
  throw new Error("Utente non trovato in NAVI_UTENTI.");
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
  const directory = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NAVIDIARIA_CLOUD_CONFIG.directorySheetName);
  updateNaviDirectoryRegistration_(directory, targetAgentId, false, "", "");
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
  const directory = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NAVIDIARIA_CLOUD_CONFIG.directorySheetName);
  updateNaviDirectoryRegistration_(directory, user.id, false, "", "");
  return { ok: true };
}

/**
 * Eseguire una sola volta dall'editor Apps Script dopo aver creato il bot con BotFather.
 * Il token resta nelle Proprietà dello script e non viene mai inviato al browser.
 */
function configuraNaviTelegramBot(tokenValue, usernameValue) {
  const token = String(tokenValue || "").trim();
  const username = String(usernameValue || "").trim().replace(/^@/, "");
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error("Token Telegram non valido.");
  if (!/^[A-Za-z0-9_]{5,}$/.test(username)) throw new Error("Username del bot non valido.");
  const webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl) throw new Error("Pubblica prima il progetto come Web App.");
  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({ NAVI_TELEGRAM_TOKEN: token, NAVI_TELEGRAM_USERNAME: username });
  return attivaNaviTelegramWebhook();
}

/** Eseguibile dal menu Run dopo aver inserito le due Proprietà dello script. */
function attivaNaviTelegramWebhook() {
  const config = getNaviTelegramConfig_();
  if (!config.token || !config.username) throw new Error("Imposta NAVI_TELEGRAM_TOKEN e NAVI_TELEGRAM_USERNAME nelle Proprietà dello script.");
  const webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl) throw new Error("Pubblica prima il progetto come Web App.");
  const response = UrlFetchApp.fetch("https://api.telegram.org/bot" + config.token + "/setWebhook", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ url: webAppUrl, allowed_updates: ["message"] }),
    muteHttpExceptions: true
  });
  const result = JSON.parse(response.getContentText() || "{}");
  if (!result.ok) throw new Error(result.description || "Webhook Telegram non configurato.");
  return "Bot @" + config.username + " collegato alla Web App.";
}

function getNaviTelegramConfig_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    token: String(properties.getProperty("NAVI_TELEGRAM_TOKEN") || "").trim(),
    username: String(properties.getProperty("NAVI_TELEGRAM_USERNAME") || "").trim().replace(/^@/, "")
  };
}

function findNaviTelegramRow_(sheet, agentIdValue) {
  const agentId = cleanNavidiariaId_(agentIdValue);
  if (!agentId || !sheet || sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  for (let i = 0; i < values.length; i++) {
    if (cleanNavidiariaId_(values[i][0]) === agentId) return { row: i + 2, values: values[i] };
  }
  return null;
}

function getNaviTelegramStatus_(sheet, user) {
  const config = getNaviTelegramConfig_();
  const found = findNaviTelegramRow_(sheet, user.id);
  return {
    ok: true,
    configured: Boolean(config.token && config.username),
    botUsername: config.username,
    connected: Boolean(found && String(found.values[2] || "").trim()),
    enabled: found ? /^(si|true|1)$/i.test(String(found.values[4] || "")) : false,
    sendTime: found ? String(found.values[5] || "20:00") : "20:00",
    residence: found ? String(found.values[6] || "DESENZANO") : "DESENZANO"
  };
}

function createNaviTelegramLink_(sheet, user) {
  const config = getNaviTelegramConfig_();
  if (!config.token || !config.username) throw new Error("Il bot Telegram non è ancora configurato.");
  const linkToken = Utilities.getUuid().replace(/-/g, "");
  CacheService.getScriptCache().put("telegram_link_" + linkToken, String(user.id), 21600);
  return {
    ok: true,
    botUsername: config.username,
    url: "https://t.me/" + config.username + "?start=" + linkToken
  };
}

function saveNaviTelegramPreferences_(sheet, user, request) {
  const found = findNaviTelegramRow_(sheet, user.id);
  if (!found || !String(found.values[2] || "").trim()) throw new Error("Collega prima Telegram.");
  const sendTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(request.sendTime || "")) ? String(request.sendTime) : "20:00";
  const residence = String(request.residence || "DESENZANO").trim().toUpperCase().slice(0, 40);
  const enabled = request.enabled === true || /^(si|true|1)$/i.test(String(request.enabled || ""));
  sheet.getRange(found.row, 5, 1, 3).setValues([[enabled ? "SI" : "NO", sendTime, residence]]);
  return getNaviTelegramStatus_(sheet, user);
}

function disconnectNaviTelegram_(sheet, user) {
  const found = findNaviTelegramRow_(sheet, user.id);
  if (found) sheet.getRange(found.row, 3, 1, 7).clearContent();
  return { ok: true, connected: false };
}

function handleNaviTelegramWebhook_(update) {
  const message = update && update.message;
  const text = String(message && message.text || "").trim();
  const chatId = message && message.chat && message.chat.id;
  if (!chatId) return { ok: true };
  const start = text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{16,64})$/i);
  if (!start) {
    sendNaviTelegramMessage_(chatId, "Apri NaviTurni e usa Impostazioni → Collega Telegram.");
    return { ok: true };
  }
  const linkToken = start[1];
  const cache = CacheService.getScriptCache();
  const agentId = cache.get("telegram_link_" + linkToken);
  if (!agentId) {
    sendNaviTelegramMessage_(chatId, "Questo collegamento è scaduto. Generane uno nuovo da NaviTurni.");
    return { ok: true };
  }
  const sheets = ensureNavidiariaCloudSheets_();
  const registered = findNavidiariaRow_(sheets.users, agentId);
  if (!registered || !registered.values[2]) {
    sendNaviTelegramMessage_(chatId, "Profilo NaviTurni non registrato.");
    return { ok: true };
  }
  const directoryUser = findNaviDirectoryUser_(sheets.directory, agentId);
  const name = directoryUser && directoryUser.name || String(registered.values[1] || agentId);
  const username = String(message.from && message.from.username || "");
  const now = new Date();
  const found = findNaviTelegramRow_(sheets.telegram, agentId);
  const row = [agentId, name, String(chatId), username, "SI", "20:00", directoryUser && directoryUser.residence || "DESENZANO", now, ""];
  if (found) sheets.telegram.getRange(found.row, 1, 1, 9).setValues([row]);
  else sheets.telegram.appendRow(row);
  cache.remove("telegram_link_" + linkToken);
  sendNaviTelegramMessage_(chatId, "✅ Telegram collegato a NaviTurni per " + name + ".");
  return { ok: true };
}

function sendNaviTelegramMessage_(chatId, text) {
  const config = getNaviTelegramConfig_();
  if (!config.token) throw new Error("Bot Telegram non configurato.");
  const response = UrlFetchApp.fetch("https://api.telegram.org/bot" + config.token + "/sendMessage", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: String(chatId), text: String(text || ""), disable_web_page_preview: true }),
    muteHttpExceptions: true
  });
  const result = JSON.parse(response.getContentText() || "{}");
  if (!result.ok) throw new Error(result.description || "Invio Telegram non riuscito.");
  return result;
}

function requireNavidiariaAdmin_(user) {
  const id = String(user.id);
  const configuredAdmins = NAVIDIARIA_CLOUD_CONFIG.adminAgentIds || [NAVIDIARIA_CLOUD_CONFIG.adminAgentId];
  const directory = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NAVIDIARIA_CLOUD_CONFIG.directorySheetName);
  const directoryUser = findNaviDirectoryUser_(directory, id);
  const isAdminRole = String(directoryUser && directoryUser.role || "").toLowerCase() === "admin";
  if (configuredAdmins.indexOf(id) < 0 && id !== NAVIDIARIA_CLOUD_CONFIG.movementAgentId && !isAdminRole) {
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
  const now = new Date();
  let analysis = null;
  let title = String(request.title || "").trim().replace(/\*/g, "").replace(/\s+/g, "_").slice(0, 180);
  if (type !== "ods") title = normalizeNaviShiftTitle_(title, type) || title;
  if (type === "ods" && request.analysis) {
    analysis = sanitizeNaviPdfAnalysis_(request.analysis);
    const numberMatch = String(analysis.ods || title).match(/\d{1,3}/);
    const dateMatch = String(analysis.documentDate || title).match(/(\d{1,2})[\/.\-_](\d{1,2})[\/.\-_](20\d{2})/);
    const date = dateMatch
      ? String(dateMatch[1]).padStart(2, "0") + "-" + String(dateMatch[2]).padStart(2, "0") + "-" + dateMatch[3]
      : Utilities.formatDate(now, Session.getScriptTimeZone() || "Europe/Rome", "dd-MM-yyyy");
    if (numberMatch) title = "Ordine_di_servizio_n._" + numberMatch[0] + "_-_" + date + ".pdf";
  }
  if (!title || !/\.pdf$/i.test(title)) throw new Error("Il file deve mantenere l'estensione .pdf.");
  const base64 = String(request.base64 || "").replace(/^data:application\/pdf;base64,/i, "");
  if (!base64) throw new Error("Contenuto PDF mancante.");
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > NAVIDIARIA_CLOUD_CONFIG.maxPdfBytes) throw new Error("Il PDF non può superare 10 MB.");
  let fileId = "";
  let url = "";
  if (documentsSheet.getLastRow() > 1) {
    const existing = documentsSheet.getRange(2, 1, documentsSheet.getLastRow() - 1, 6).getValues().find(function(row) {
      return String(row[1]).toLowerCase() === type && String(row[2]) === title;
    });
    if (existing) { fileId = String(existing[0]); url = String(existing[5]); }
  }
  if (!fileId) {
    const folder = getNaviDocumentsFolder_();
    const file = folder.createFile(Utilities.newBlob(bytes, MimeType.PDF, title));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    fileId = file.getId();
    url = "https://drive.google.com/file/d/" + fileId + "/view";
    documentsSheet.appendRow([fileId, type, title, now, user.id, url]);
  }
  let imported = null;
  let analysisError = "";
  if (type === "ods" && request.analysis) {
    try {
      if (typeof importaOdsDaPdf !== "function") throw new Error("Importatore ODS non disponibile nel progetto Apps Script.");
      prepareNaviOdsImport_();
      const robustVariations = importNaviVariationsRobust_(analysis.text, analysis.ods);
      imported = importaOdsDaPdf(analysis.text, analysis.pages, analysis.ods, title);
      imported.variazioni = robustVariations;
    } catch (error) {
      analysisError = error && error.message ? error.message : String(error);
    }
  }
  return {
    ok: true,
    document: { id: fileId, type: type, title: title, createdAt: formatNavidiariaDate_(now), uploadedBy: user.id, url: url },
    imported: imported,
    analysisError: analysisError
  };
}

function importNaviVariationsRobust_(text, ods) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NAVITURNI_CONFIG.variationsSheetName);
  if (!sheet) throw new Error("Tab VARIAZIONI_ODS non trovato.");
  const months = { GENNAIO:1, FEBBRAIO:2, MARZO:3, APRILE:4, MAGGIO:5, GIUGNO:6, LUGLIO:7, AGOSTO:8, SETTEMBRE:9, OTTOBRE:10, NOVEMBRE:11, DICEMBRE:12 };
  const lines = String(text || "").split(/\r?\n/).map(function(line) { return line.replace(/\s+/g, " ").trim(); }).filter(Boolean);
  const normalize = function(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); };
  const originalShifts = buildNaviOriginalShiftLookup_();
  const rows = [];
  let type = "", date = "";
  lines.forEach(function(line) {
    const normalized = normalize(line);
    if (normalized.indexOf("VARIAZIONI TURNI DA UFFICIO") >= 0) { type = "D'UFFICIO"; return; }
    if (normalized.indexOf("VARIAZIONI TURNI VOLONTARI") >= 0) { type = "VOLONTARIA"; return; }
    if (/^(COMITIVE O\.?D\.?S|TURNO NAVI)/.test(normalized)) { type = ""; return; }
    const dateMatch = normalized.match(/^(?:DA\s+)?(?:LUNEDI|MARTEDI|MERCOLEDI|MEROLEDI|GIOVEDI|VENERDI|SABATO|DOMENICA)[’'`´\s]*(\d{1,2})\s+([A-Z]+)\s+(20\d{2})/);
    if (dateMatch && months[dateMatch[2]]) {
      date = dateMatch[3] + "-" + String(months[dateMatch[2]]).padStart(2, "0") + "-" + String(dateMatch[1]).padStart(2, "0");
      return;
    }
    if (!type || !date) return;
    const variation = line.match(/^([^:]+):\s*(.+)$/);
    if (!variation || variation[1].indexOf(",") >= 0) return;
    let shift = variation[2].replace(/[“”"]/g, "").trim();
    if (/^={3,}$/.test(shift)) shift = "RIP";
    const takesShift = shift.match(/PRENDE IL TURNO N\.?\s*(\d+)/i);
    if (takesShift) shift = takesShift[1];
    const instructor = /ISTRUTTORE/i.test(shift);
    shift = shift.replace(/\bISTRUTTORE\b/ig, "").replace(/\([^)]*\)/g, "").trim().toUpperCase();
    if (!/^(?:D[1-4]|R[1-4]|T[1-2]|M1|P[1-3]|CAP|SR1|BIS|AGB|AGM|AGT|DT|POND|PONM|RIP|L\.D\.|I\.E\.|CONG|\d+)\*?$/i.test(shift)) return;
    if (instructor && shift !== "RIP" && !/\*$/.test(shift)) shift += "*";
    const agent = resolveNaviVariationAgent_(variation[1]);
    const originalShift = originalShifts[date + "|" + agent.id] || originalShifts[date + "|" + normalize(agent.name)] || "";
    rows.push(["SÌ", date, agent.id, agent.name, originalShift, shift, ods, type, instructor ? "ISTRUTTORE" : ""]);
  });
  const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getDisplayValues() : [];
  const keys = new Set(existing.map(function(row) { return [row[1], normalize(row[3]), String(row[6]).trim()].join("|"); }));
  const unique = rows.filter(function(row) { const key = [row[1], normalize(row[3]), row[6]].join("|"); if (keys.has(key)) return false; keys.add(key); return true; });
  if (unique.length) sheet.getRange(sheet.getLastRow() + 1, 1, unique.length, 9).setValues(unique);
  return { inserite: unique.length, duplicate: rows.length - unique.length };
}

function buildNaviOriginalShiftLookup_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(getNaviTurnSheetName_());
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 5) return {};
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getDisplayValues();
  const headers = values[0];
  const year = new Date().getFullYear();
  const normalizeName = function(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase(); };
  const normalizeShift = function(value) {
    const shift = String(value || "").trim().toUpperCase();
    if (shift === "RIP" || shift === "RIPOSO") return "RIP";
    return shift;
  };
  const lookup = {};
  for (let column = 4; column < headers.length; column++) {
    const match = String(headers[column] || "").trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?$/);
    if (!match) continue;
    const date = (match[3] || year) + "-" + String(match[2]).padStart(2, "0") + "-" + String(match[1]).padStart(2, "0");
    for (let row = 1; row < values.length; row++) {
      const shift = normalizeShift(values[row][column]);
      if (!shift) continue;
      const id = String(values[row][1] || "").trim();
      const name = normalizeName(values[row][3]);
      if (id) lookup[date + "|" + id] = shift;
      if (name) lookup[date + "|" + name] = shift;
    }
  }
  return lookup;
}

function resolveNaviVariationAgent_(value) {
  const raw = String(value || "").trim();
  const normalize = function(text) { return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.’'`´]/g, "").replace(/\s+/g, " ").trim().toUpperCase(); };
  const wanted = normalize(raw);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(getNaviTurnSheetName_());
  if (!sheet || sheet.getLastRow() < 2) return { id:"", name:raw };
  const directory = sheet.getRange(2, 2, sheet.getLastRow() - 1, 3).getDisplayValues().map(function(row) { return { id:String(row[0] || ""), name:String(row[2] || "").trim(), normalized:normalize(row[2]) }; });
  const exact = directory.find(function(agent) { return agent.normalized === wanted; });
  if (exact) return exact;
  const surnameMatches = directory.filter(function(agent) { return agent.normalized === wanted || agent.normalized.indexOf(wanted + " ") === 0; });
  return surnameMatches.length === 1 ? surnameMatches[0] : { id:"", name:raw };
}

function normalizeNaviShiftTitle_(value, type) {
  const match = String(value || "").match(/dal[^0-9]*(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](20\d{2}))?[^0-9]*?(?:al|a)[^0-9]*(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})/i);
  if (!match) return "";
  const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
  const fromMonth = months[Number(match[2]) - 1];
  const toMonth = months[Number(match[5]) - 1];
  if (!fromMonth || !toMonth) return "";
  const prefix = type === "bozza" ? "Bozza" : "Turno";
  return prefix + "_dal_" + Number(match[1]) + "_" + fromMonth + "_al_" + Number(match[4]) + "_" + toMonth + "_" + match[6] + ".pdf";
}

/** Uniforma i nomi dei turni e delle bozze già presenti nell'archivio condiviso. */
function normalizzaTitoliTurniCondivisi() {
  const sheets = ensureNavidiariaCloudSheets_();
  const sheet = sheets.documents;
  if (sheet.getLastRow() < 2) return { aggiornati: 0 };
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  let updated = 0;
  rows.forEach(function(row, index) {
    const type = String(row[1] || "").toLowerCase();
    if (type !== "turno" && type !== "bozza") return;
    const title = normalizeNaviShiftTitle_(row[2], type);
    if (!title || title === String(row[2])) return;
    try { DriveApp.getFileById(String(row[0])).setName(title); } catch (error) { /* Aggiorna almeno il titolo in archivio. */ }
    sheet.getRange(index + 2, 3).setValue(title);
    updated++;
  });
  return { aggiornati: updated };
}

function prepareNaviOdsImport_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const variations = ss.getSheetByName(NAVITURNI_CONFIG.variationsSheetName);
  const ships = ss.getSheetByName(NAVITURNI_CONFIG.shipsSheetName);
  if (variations) {
    variations.getRange(1, 5).setValue("TURNO");
    variations.showColumns(5);
    if (variations.getMaxRows() > 1) variations.getRange(2, 7, variations.getMaxRows() - 1, 1).clearDataValidations();
  }
  if (ships && ships.getMaxRows() > 1) ships.getRange(2, 1, ships.getMaxRows() - 1, 9).clearDataValidations();
}

/** Normalizza i nomi degli ODS già caricati, usando numero e data di caricamento. */
function normalizzaTitoliOdsCondivisi() {
  const sheets = ensureNavidiariaCloudSheets_();
  const sheet = sheets.documents;
  if (sheet.getLastRow() < 2) return { aggiornati: 0 };
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  let updated = 0;
  rows.forEach(function(row, index) {
    if (String(row[1]).toLowerCase() !== "ods") return;
    const currentTitle = String(row[2] || "");
    const match = currentTitle.match(/(?:o\.?d\.?s\.?|servizio|n)[^0-9]{0,12}(\d{1,3})/i) || currentTitle.match(/(\d{1,3})/);
    if (!match) return;
    const date = row[3] instanceof Date ? Utilities.formatDate(row[3], Session.getScriptTimeZone() || "Europe/Rome", "dd-MM-yyyy") : "16-07-2026";
    const title = "Ordine_di_servizio_n._" + match[1] + "_-_" + date + ".pdf";
    try { DriveApp.getFileById(String(row[0])).setName(title); } catch (error) { /* Aggiorna almeno il titolo in archivio. */ }
    sheet.getRange(index + 2, 3).setValue(title);
    updated++;
  });
  return { aggiornati: updated };
}

function sanitizeNaviPdfAnalysis_(value) {
  if (!value || typeof value !== "object") throw new Error("Analisi PDF mancante.");
  const text = String(value.text || "").slice(0, 250000);
  const ods = String(value.ods || "").trim().slice(0, 80);
  const documentDate = String(value.documentDate || "").trim().slice(0, 20);
  const pages = (Array.isArray(value.pages) ? value.pages : []).slice(0, 20).map(function(page) {
    return {
      items: (page && Array.isArray(page.items) ? page.items : []).slice(0, 5000).map(function(item) {
        return { x: Number(item.x) || 0, y: Number(item.y) || 0, s: String(item.s || "").slice(0, 200) };
      })
    };
  });
  if (!text) throw new Error("Il PDF non contiene testo leggibile.");
  return { text: text, pages: pages, ods: ods, documentDate: documentDate };
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

/** Eseguire manualmente dall'editor Apps Script per autorizzare l'accesso a Drive. */
function autorizzaDriveNavi() {
  const folder = getNaviDocumentsFolder_();
  return { id: folder.getId(), name: folder.getName() };
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

function getNaviTurnSheetName_() {
  if (typeof NAVITURNI_CONFIG !== "undefined" && NAVITURNI_CONFIG && NAVITURNI_CONFIG.sheetName) {
    return NAVITURNI_CONFIG.sheetName;
  }
  return "Foglio1";
}

function getNaviDefaultYear_() {
  if (typeof NAVITURNI_CONFIG !== "undefined" && NAVITURNI_CONFIG && NAVITURNI_CONFIG.defaultYear) {
    return Number(NAVITURNI_CONFIG.defaultYear) || new Date().getFullYear();
  }
  return new Date().getFullYear();
}

/**
 * Sincronizza la directory comune NAVI_UTENTI.
 *
 * - importa gli agenti presenti in Foglio1;
 * - importa le bariste presenti nel tab BARISTA;
 * - aggiunge Ufficio Movimento;
 * - conserva eventuali utenti aggiunti manualmente;
 * - non riattiva automaticamente una riga impostata manualmente su NO.
 */
function syncNaviDirectory_(ss, directorySheet, authUsersSheet) {
  const existing = {};
  if (directorySheet.getLastRow() > 1) {
    directorySheet
      .getRange(2, 1, directorySheet.getLastRow() - 1, 9)
      .getDisplayValues()
      .forEach(function(row) {
        const id = cleanNavidiariaId_(row[0]);
        if (!id) return;
        existing[id] = {
          id: id,
          name: String(row[1] || "").trim(),
          role: String(row[2] || "").trim().toLowerCase(),
          qualifica: String(row[3] || "").trim(),
          residence: String(row[4] || "").trim().toUpperCase(),
          active: !/^(no|false|0)$/i.test(String(row[5] || "").trim()),
          registered: !/^(no|false|0|)$/i.test(String(row[6] || "").trim()),
          registeredAt: String(row[7] || "").trim(),
          lastAccess: String(row[8] || "").trim()
        };
      });
  }

  const registrationInfo = {};
  if (authUsersSheet && authUsersSheet.getLastRow() > 1) {
    authUsersSheet
      .getRange(2, 1, authUsersSheet.getLastRow() - 1, 5)
      .getValues()
      .forEach(function(row) {
        const id = cleanNavidiariaId_(row[0]);
        const pinHash = String(row[2] || "").trim();
        if (!id) return;
        registrationInfo[id] = {
          registered: Boolean(pinHash),
          registeredAt: pinHash ? formatNavidiariaDate_(row[3]) : "",
          lastAccess: pinHash ? formatNavidiariaDate_(row[4]) : ""
        };
      });
  }

  const imported = {};

  imported[NAVIDIARIA_CLOUD_CONFIG.movementAgentId] = {
    id: NAVIDIARIA_CLOUD_CONFIG.movementAgentId,
    name: "Ufficio Movimento",
    role: "admin",
    qualifica: "ufficio",
    residence: "UFFICIO MOVIMENTO",
    active: true
  };

  const turnSheet = ss.getSheetByName(getNaviTurnSheetName_());
  if (turnSheet && turnSheet.getLastRow() > 1) {
    const rows = turnSheet.getRange(2, 1, turnSheet.getLastRow() - 1, 4).getDisplayValues();
    rows.forEach(function(row) {
      const id = cleanNavidiariaId_(row[1]);
      const name = String(row[3] || "").trim();
      if (!id || !name) return;
      imported[id] = {
        id: id,
        name: name,
        role: (NAVIDIARIA_CLOUD_CONFIG.adminAgentIds || [NAVIDIARIA_CLOUD_CONFIG.adminAgentId]).indexOf(id) >= 0 ? "admin" : "agent",
        qualifica: typeof normalizzaQualifica === "function"
          ? normalizzaQualifica(row[2])
          : String(row[2] || "marinaio").trim().toLowerCase(),
        residence: String(row[0] || "").trim().toUpperCase(),
        active: true
      };
    });
  }

  const baristas = readNaviBaristaDirectory_(ss);
  Object.keys(baristas).forEach(function(id) {
    imported[id] = baristas[id];
  });

  const merged = {};
  Object.keys(existing).forEach(function(id) {
    const registration = registrationInfo[id] || {};
    merged[id] = {
      id: existing[id].id,
      name: existing[id].name,
      role: existing[id].role,
      qualifica: existing[id].qualifica,
      residence: existing[id].residence,
      active: existing[id].active,
      registered: Boolean(registration.registered),
      registeredAt: registration.registeredAt || "",
      lastAccess: registration.lastAccess || ""
    };
  });
  Object.keys(imported).forEach(function(id) {
    const old = existing[id];
    const registration = registrationInfo[id] || {};
    merged[id] = {
      id: id,
      name: imported[id].name || (old && old.name) || "",
      role: imported[id].role || (old && old.role) || "agent",
      qualifica: imported[id].qualifica || (old && old.qualifica) || "",
      residence: imported[id].residence || (old && old.residence) || "",
      active: old ? old.active : true,
      registered: Boolean(registration.registered),
      registeredAt: registration.registeredAt || "",
      lastAccess: registration.lastAccess || ""
    };
  });

  const rows = Object.keys(merged)
    .sort(function(a, b) {
      const roleOrder = { admin: 0, agent: 1, barista: 2 };
      const aa = merged[a], bb = merged[b];
      return (roleOrder[aa.role] || 9) - (roleOrder[bb.role] || 9) ||
        aa.name.localeCompare(bb.name, "it");
    })
    .map(function(id) {
      const user = merged[id];
      return [
        user.id,
        user.name,
        user.role,
        user.qualifica,
        user.residence,
        user.active ? "SI" : "NO",
        user.registered ? "SI" : "NO",
        user.registeredAt || "",
        user.lastAccess || ""
      ];
    });

  if (directorySheet.getLastRow() > 1) {
    directorySheet.getRange(2, 1, directorySheet.getLastRow() - 1, 9).clearContent();
  }
  if (rows.length) directorySheet.getRange(2, 1, rows.length, 9).setValues(rows);
}

/** Eseguire manualmente quando si vuole forzare la ricostruzione di NAVI_UTENTI. */
function sincronizzaNaviUtenti() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.directorySheetName);
  if (!sheet) sheet = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.directorySheetName);
  ensureNavidiariaHeader_(sheet, ["ID", "NOME", "RUOLO", "QUALIFICA", "RESIDENZA", "ATTIVO", "REGISTRATO", "REGISTRATO_IL", "ULTIMO_ACCESSO"]);
  let authUsers = ss.getSheetByName(NAVIDIARIA_CLOUD_CONFIG.usersSheetName);
  if (!authUsers) authUsers = ss.insertSheet(NAVIDIARIA_CLOUD_CONFIG.usersSheetName);
  ensureNavidiariaHeader_(authUsers, ["ID_AGENTE", "AGENTE", "PIN_HASH", "REGISTRATO_IL", "ULTIMO_ACCESSO"]);
  syncNaviDirectory_(ss, sheet, authUsers);
  return { aggiornati: Math.max(0, sheet.getLastRow() - 1) };
}


/**
 * Legge soltanto l'elenco dei nominativi dal foglio BARISTA.
 * Non interpreta date o turni e non dipende da parseHeaderDate(),
 * formatDateISO(), leggiBariste() o NAVITURNI_CONFIG.
 *
 * Formati riconosciuti:
 * 1. colonna BARISTA / AGENTE / NOME / NOMINATIVO;
 * 2. colonne D2, D3, P2 e P3 contenenti i nomi;
 * 3. prima colonna con i nomi e date nelle colonne successive.
 */
function readNaviBaristaDirectory_(ss) {
  const sheet = ss.getSheetByName("BARISTA");
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return {};

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(normalizeNaviDirectoryHeader_);
  const result = {};

  function addBarista(nameValue, idValue, activeValue) {
    const name = String(nameValue || "").replace(/\s+/g, " ").trim();
    if (!name) return;

    const activeText = String(activeValue === undefined ? "" : activeValue).trim();
    if (/^(no|false|0|disattiva|disattivo)$/i.test(activeText)) return;

    const id = cleanNavidiariaId_(idValue) || buildNaviBaristaId_(name);
    if (!id) return;

    result[id] = {
      id: id,
      name: name,
      role: "barista",
      qualifica: "barista",
      residence: "BARISTE",
      active: true
    };
  }

  function findColumn(names) {
    for (let i = 0; i < names.length; i++) {
      const index = headers.indexOf(names[i]);
      if (index >= 0) return index;
    }
    return -1;
  }

  const colName = findColumn(["BARISTA", "AGENTE", "NOME", "NOMINATIVO"]);
  const colId = findColumn(["ID", "ID_BARISTA"]);
  const colActive = findColumn(["ATTIVA", "ATTIVO"]);
  const shiftColumns = ["D2", "D3", "P2", "P3"]
    .map(function(shift) {
      return { shift: shift, index: headers.indexOf(shift) };
    })
    .filter(function(item) {
      return item.index >= 0;
    });

  // Formato con una colonna nominativo.
  if (colName >= 0) {
    values.slice(1).forEach(function(row) {
      addBarista(
        row[colName],
        colId >= 0 ? row[colId] : "",
        colActive >= 0 ? row[colActive] : ""
      );
    });
  }

  // Formato DATA | D2 | D3 | P2 | P3.
  if (shiftColumns.length) {
    values.slice(1).forEach(function(row) {
      shiftColumns.forEach(function(item) {
        addBarista(
          row[item.index],
          "",
          colActive >= 0 ? row[colActive] : ""
        );
      });
    });
  }

  // Formato BARISTA nella prima colonna e date nelle colonne successive.
  // Viene usato solo quando non è stata individuata una colonna nominativo.
  if (colName < 0 && shiftColumns.length === 0) {
    values.slice(1).forEach(function(row) {
      const firstCell = String(row[0] || "").trim();
      if (!firstCell) return;

      const hasShift = row.slice(1).some(function(cell) {
        return /^(D2|D3|P2|P3)$/i.test(String(cell || "").trim());
      });
      if (hasShift) addBarista(firstCell, "", "");
    });
  }

  return result;
}

function normalizeNaviDirectoryHeader_(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildNaviBaristaId_(name) {
  const normalized = String(name || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized ? "BARISTA_" + normalized : "";
}

function updateNaviDirectoryRegistration_(directorySheet, agentIdValue, registered, registeredAt, lastAccess) {
  const agentId = cleanNavidiariaId_(agentIdValue);
  if (!directorySheet || !agentId || directorySheet.getLastRow() < 2) return;
  const ids = directorySheet
    .getRange(2, 1, directorySheet.getLastRow() - 1, 1)
    .getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (cleanNavidiariaId_(ids[i][0]) !== agentId) continue;
    directorySheet.getRange(i + 2, 7, 1, 3).setValues([[
      registered ? "SI" : "NO",
      registered ? (registeredAt || "") : "",
      registered ? (lastAccess || "") : ""
    ]]);
    return;
  }
}

function findNaviDirectoryUser_(directorySheet, agentIdValue) {
  const agentId = cleanNavidiariaId_(agentIdValue);
  if (!agentId || !directorySheet || directorySheet.getLastRow() < 2) return null;
  const rows = directorySheet.getRange(2, 1, directorySheet.getLastRow() - 1, 9).getDisplayValues();
  for (let i = 0; i < rows.length; i++) {
    if (cleanNavidiariaId_(rows[i][0]) !== agentId) continue;
    if (/^(no|false|0)$/i.test(String(rows[i][5] || "").trim())) return null;
    return {
      id: agentId,
      name: String(rows[i][1] || "").trim(),
      role: String(rows[i][2] || "agent").trim().toLowerCase(),
      qualifica: String(rows[i][3] || "").trim().toLowerCase(),
      residence: String(rows[i][4] || "").trim().toUpperCase()
    };
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


function saveNaviChangeRequest_(sheet, request) {
  const agentId = cleanNavidiariaId_(request.agentId);
  if (!agentId) throw new Error("Agente non riconosciuto.");
  const changes = Array.isArray(request.changes) ? request.changes.map(function(item){
    return {date:String(item.date||"").slice(0,10),from:String(item.from||"RIP").toUpperCase(),to:String(item.to||"RIP").toUpperCase()};
  }).filter(function(item){return /^\d{4}-\d{2}-\d{2}$/.test(item.date);}) : [];
  if (!changes.length) throw new Error("Nessuna giornata valida nella richiesta.");
  const duplicateKey = agentId + "|" + String(request.colleagueId||"") + "|" + JSON.stringify(changes);
  if (sheet.getLastRow() > 1) {
    const rows = sheet.getRange(2,1,sheet.getLastRow()-1,8).getDisplayValues();
    for (let i=0;i<rows.length;i++) {
      const key = cleanNavidiariaId_(rows[i][1]) + "|" + String(rows[i][3]||"") + "|" + String(rows[i][6]||"");
      if (key === duplicateKey) return {ok:true, duplicate:true, id:rows[i][0]};
    }
  }
  const id = Utilities.getUuid();
  sheet.appendRow([id,agentId,String(request.agentName||""),String(request.colleagueId||""),String(request.colleagueName||""),new Date(),JSON.stringify(changes),String(request.mailText||"")]);
  return {ok:true,id:id};
}

function listNaviChangeRequests_(sheet, agentIdValue) {
  const agentId = cleanNavidiariaId_(agentIdValue);
  if (!agentId || !sheet || sheet.getLastRow() < 2) return {ok:true,requests:[]};
  const rows = sheet.getRange(2,1,sheet.getLastRow()-1,8).getValues();
  const requests = rows.filter(function(row){return cleanNavidiariaId_(row[1])===agentId;}).map(function(row){
    let changes=[]; try{changes=JSON.parse(String(row[6]||"[]"));}catch(e){}
    return {id:String(row[0]||""),agentId:cleanNavidiariaId_(row[1]),agentName:String(row[2]||""),colleagueId:String(row[3]||""),colleagueName:String(row[4]||""),sentAt:formatNavidiariaDate_(row[5]),changes:changes,mailText:String(row[7]||"")};
  }).sort(function(a,b){return String(b.sentAt).localeCompare(String(a.sentAt));});
  return {ok:true,requests:requests};
}


function deleteNaviChangeRequest_(sheet, request) {
  const agentId = cleanNavidiariaId_(request.agentId);
  const requestId = String(request.requestId || "").trim();
  if (!agentId || !requestId) throw new Error("Richiesta non valida.");
  if (!sheet || sheet.getLastRow() < 2) return { ok:true, deleted:false };

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getDisplayValues();
  for (let index = 0; index < rows.length; index++) {
    if (String(rows[index][0] || "").trim() !== requestId) continue;
    if (cleanNavidiariaId_(rows[index][1]) !== agentId) {
      throw new Error("Non puoi eliminare una richiesta di un altro agente.");
    }
    sheet.deleteRow(index + 2);
    return { ok:true, deleted:true };
  }
  return { ok:true, deleted:false };
}
