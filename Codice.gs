/**
 * NAVITURNI — Web App Google Apps Script
 *
 * Struttura attesa di Foglio1:
 * A Residenza | B ID | C QUALIFICA | D Agente | colonne successive con date
 *
 * Le colonne senza una data valida nell'intestazione vengono ignorate.
 * Le date fino al 26/07/2026 sono ufficiali.
 * Dal 27/07/2026 in poi sono bozza.
 */

const NAVITURNI_CONFIG = {
  sheetName: "Foglio1",
  variationsSheetName: "VARIAZIONI_ODS",
  shipsSheetName: "TURNI_NAVI",
  defaultYear: 2026,
  bozzaDal: "2026-07-27",
  titolo: "NAVITURNI — TURNO DEL PERSONALE"
};

function doGet() {
  try {
    const dati = generaNaviturni();
    return jsonOutput(dati);
  } catch (errore) {
    return jsonOutput({
      errore: true,
      messaggio: errore && errore.message
        ? errore.message
        : String(errore)
    });
  }
}

function generaNaviturni() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NAVITURNI_CONFIG.sheetName);

  if (!sheet) {
    throw new Error(
      'Foglio "' + NAVITURNI_CONFIG.sheetName + '" non trovato. ' +
      "Fogli disponibili: " +
      ss.getSheets().map(function(s) { return s.getName(); }).join(", ")
    );
  }

  const data = sheet.getDataRange().getDisplayValues();

  if (!data || data.length < 2) {
    throw new Error("Foglio1 è vuoto o non contiene righe dati.");
  }

  const header = data[0];
  const rows = data.slice(1);

  const COL_RESIDENZA = 0;
  const COL_ID = 1;
  const COL_QUALIFICA = 2;
  const COL_AGENTE = 3;
  const PRIMA_COLONNA_DATE = 4;

  const colonneDate = [];

  for (let col = PRIMA_COLONNA_DATE; col < header.length; col++) {
    const dataColonna = parseHeaderDate(
      header[col],
      NAVITURNI_CONFIG.defaultYear
    );

    if (!dataColonna) continue;

    colonneDate.push({
      colIndex: col,
      iso: formatDateISO(dataColonna),
      label: formatDateLabel(dataColonna),
      giorno: formatDayShort(dataColonna),
      numero: dataColonna.getDate(),
      mese: dataColonna.getMonth() + 1,
      anno: dataColonna.getFullYear(),
      stato: formatDateISO(dataColonna) >= NAVITURNI_CONFIG.bozzaDal
        ? "bozza"
        : "ufficiale"
    });
  }

  if (!colonneDate.length) {
    throw new Error(
      "Non è stata trovata nessuna intestazione data valida da colonna E in poi."
    );
  }

  colonneDate.sort(function(a, b) {
    return a.iso.localeCompare(b.iso);
  });

  // Elimina eventuali date duplicate, tenendo l'ultima colonna trovata.
  const dateUnicheMap = {};
  colonneDate.forEach(function(item) {
    dateUnicheMap[item.iso] = item;
  });

  const dateUniche = Object.keys(dateUnicheMap)
    .sort()
    .map(function(iso) {
      return dateUnicheMap[iso];
    });

  const residenze = {};
  const agentiPerChiave = {};

  rows.forEach(function(row) {
    const residenza = pulisciTesto(row[COL_RESIDENZA]).toUpperCase();
    const id = pulisciId(row[COL_ID]);
    const qualifica = normalizzaQualifica(row[COL_QUALIFICA]);
    const agente = pulisciTesto(row[COL_AGENTE]);

    if (!residenza || !agente) return;
    const chiave = creaChiavePersona(residenza, agente);

    const turni = {};

    dateUniche.forEach(function(infoData) {
      turni[infoData.iso] = normalizzaTurno(
        row[infoData.colIndex]
      );
    });

    const record = {
      id: id,
      agente: agente,
      qualifica: qualifica,
      turni: turni
    };

    /*
     * Il nome è l'identità stabile.
     * Se per errore esistono righe duplicate della stessa persona,
     * la riga più in basso aggiorna ID, qualifica e turni valorizzati.
     */
    if (agentiPerChiave[chiave]) {
      const esistente = agentiPerChiave[chiave];

      if (id) esistente.id = id;
      if (qualifica) esistente.qualifica = qualifica;

      Object.keys(turni).forEach(function(iso) {
        if (turni[iso] !== "rip") {
          esistente.turni[iso] = turni[iso];
        }
      });

      return;
    }

    if (!residenze[residenza]) {
      residenze[residenza] = [];
    }

    residenze[residenza].push(record);
    agentiPerChiave[chiave] = record;
  });

  Object.keys(residenze).forEach(function(residenza) {
    residenze[residenza].sort(ordinaAgenti);
  });

  let presenzeBariste = leggiBariste(ss);
  aggiungiBaristeDaAnagrafica_(ss, residenze, dateUniche, presenzeBariste);
  presenzeBariste = completaPresenzeBaristeDaTurni_(
    presenzeBariste,
    residenze.BARISTE || [],
    dateUniche
  );

  const primaData = dateUniche[0].iso;
  const ultimaData = dateUniche[dateUniche.length - 1].iso;

  return {
    titolo: NAVITURNI_CONFIG.titolo,
    periodo: creaPeriodo(primaData, ultimaData),
    data_inizio: primaData,
    data_fine: ultimaData,
    bozza_dal: NAVITURNI_CONFIG.bozzaDal,
    variazioni_ods: leggiVariazioniOds(ss),
    turni_navi: leggiTurniNavi(ss),
    bariste: presenzeBariste,
    aggiornato_il: Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || "Europe/Rome",
      "yyyy-MM-dd'T'HH:mm:ss"
    ),
    date: dateUniche.map(function(d) {
      return {
        iso: d.iso,
        label: d.label,
        giorno: d.giorno,
        numero: d.numero,
        mese: d.mese,
        anno: d.anno,
        stato: d.stato
      };
    }),
    residenze: residenze
  };
}

/**
 * Usa le righe BARISTE di Foglio1 come fonte principale delle assegnazioni.
 * Il vecchio tab BARISTA resta supportato, ma non è più obbligatorio.
 */
function completaPresenzeBaristeDaTurni_(presenze, bariste, dateUniche) {
  const output = Array.isArray(presenze) ? presenze.slice() : [];
  const seen = {};

  output.forEach(function(record) {
    const key = [
      normalizzaNome(record.barista || record.agente || record.nome),
      String(record.data || "").slice(0, 10),
      String(record.corsa || "").trim().toUpperCase()
    ].join("|");
    seen[key] = true;
  });

  (bariste || []).forEach(function(barista) {
    (dateUniche || []).forEach(function(info) {
      const corsa = normalizzaTurno(barista.turni && barista.turni[info.iso]);
      if (!corsa || corsa === "rip") return;
      const key = [normalizzaNome(barista.agente), info.iso, corsa.toUpperCase()].join("|");
      if (seen[key]) return;
      seen[key] = true;
      output.push({
        attiva: true,
        data: info.iso,
        corsa: corsa.toUpperCase(),
        id: String(barista.id || ""),
        barista: barista.agente,
        note: ""
      });
    });
  });

  output.sort(function(a, b) {
    return String(a.data || "").localeCompare(String(b.data || "")) ||
      String(a.barista || "").localeCompare(String(b.barista || ""), "it");
  });
  return output;
}

/**
 * Aggiunge al JSON pubblico soltanto le bariste attive presenti in NAVI_UTENTI
 * che hanno almeno un'assegnazione reale nel tab BARISTA.
 */
function aggiungiBaristeDaAnagrafica_(ss, residenze, dateUniche, presenzeBariste) {
  const directory = ss.getSheetByName("NAVI_UTENTI");
  if (!directory || directory.getLastRow() < 2) return;

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const activeAssignments = (presenzeBariste || []).filter(function(record) {
    return record && record.attiva !== false &&
      !/^(no|false|0)$/i.test(String(record.attiva || "")) &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(record.data || "").slice(0, 10)) &&
      String(record.corsa || "").trim() &&
      String(record.barista || record.agente || record.nome || "").trim();
  });

  const scheduleRows = Array.isArray(residenze.BARISTE) ? residenze.BARISTE.slice() : [];
  const rows = directory.getRange(2, 1, directory.getLastRow() - 1, 9).getDisplayValues();
  const bariste = [];

  rows.forEach(function(row) {
    const id = pulisciId(row[0]);
    const name = pulisciTesto(row[1]);
    const role = pulisciTesto(row[2]).toLowerCase();
    const qualifica = pulisciTesto(row[3]).toLowerCase();
    const active = !/^(no|false|0)$/i.test(pulisciTesto(row[5]));
    if (!id || !name || !active || (role !== "barista" && qualifica !== "barista")) return;
    if (/^(CORSA|TURNO|SERVIZIO|D2|D3|P1|P2|P3)$/i.test(name)) return;

    const normalizedName = normalizeName(name);
    const assignments = activeAssignments.filter(function(record) {
      return normalizeName(record.barista || record.agente || record.nome) === normalizedName;
    });
    const schedule = scheduleRows.find(function(agent) {
      return normalizeName(agent.agente) === normalizedName;
    });
    const turni = schedule && schedule.turni ? Object.assign({}, schedule.turni) : {};
    dateUniche.forEach(function(info) {
      if (!Object.prototype.hasOwnProperty.call(turni, info.iso)) turni[info.iso] = "rip";
    });
    assignments.forEach(function(record) {
      const iso = String(record.data).slice(0, 10);
      if (Object.prototype.hasOwnProperty.call(turni, iso)) {
        turni[iso] = String(record.corsa || "rip").trim().toUpperCase();
      }
    });

    bariste.push({
      id: id,
      agente: name,
      qualifica: "barista",
      turni: turni
    });
  });

  if (bariste.length) {
    bariste.sort(function(a, b) {
      return a.agente.localeCompare(b.agente, "it");
    });
    residenze.BARISTE = bariste;
  }
}

function leggiVariazioniOds(ss) {
  const sheet = ss.getSheetByName(NAVITURNI_CONFIG.variationsSheetName);
  if (!sheet) return [];

  const data = sheet.getDataRange().getDisplayValues();
  if (!data || data.length < 2) return [];

  const header = data[0].map(function(valore) {
    return pulisciTesto(valore).toUpperCase().replace(/\s+/g, "_");
  });

  function indice(nome) {
    return header.indexOf(nome);
  }

  const colAttiva = indice("ATTIVA");
  const colData = indice("DATA");
  const colId = indice("ID_AGENTE");
  const colAgente = indice("AGENTE");
  const colOriginale = indice("TURNO_ORIGINALE");
  const colNuovo = indice("TURNO_NUOVO");
  const colOds = indice("ODS");
  const colTipo = indice("TIPO");
  const colNote = indice("NOTE");

  if (colData < 0 || colAgente < 0 || colNuovo < 0) return [];

  return data.slice(1).map(function(row) {
    const dataVariazione = parseHeaderDate(row[colData], NAVITURNI_CONFIG.defaultYear);
    const agente = pulisciTesto(row[colAgente]);
    const turnoNuovo = normalizzaTurno(row[colNuovo]);
    const attivaTesto = colAttiva >= 0 ? pulisciTesto(row[colAttiva]).toLowerCase() : "";
    const attiva = ["no", "false", "0", "disattiva", "disattivata"].indexOf(attivaTesto) < 0;

    if (!dataVariazione || !agente || !pulisciTesto(row[colNuovo])) return null;

    return {
      attiva: attiva,
      data: formatDateISO(dataVariazione),
      id_agente: colId >= 0 ? pulisciId(row[colId]) : "",
      agente: agente,
      turno_originale: colOriginale >= 0 ? normalizzaTurno(row[colOriginale]) : "",
      turno_nuovo: turnoNuovo,
      ods: colOds >= 0 ? pulisciTesto(row[colOds]) : "",
      tipo: colTipo >= 0 ? pulisciTesto(row[colTipo]) : "",
      note: colNote >= 0 ? pulisciTesto(row[colNote]) : ""
    };
  }).filter(function(item) {
    return item !== null;
  });
}

function creaChiavePersona(residenza, agente) {
  return normalizzaNome(residenza) + "|" + normalizzaNome(agente);
}

function normalizzaNome(valore) {
  return String(valore || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’`]/g, "")
    .replace(/\s+/g, " ");
}

function normalizzaQualifica(valore) {
  const q = normalizzaNome(valore);

  const mappa = {
    "capitano": "capitano",
    "comandante": "capitano",
    "capo timoniere": "capo timoniere",
    "capotimoniere": "capo timoniere",
    "timoniere": "timoniere",
    "motorista": "motorista",
    "aiuto motorista": "aiuto motorista",
    "aiutomotorista": "aiuto motorista",
    "marinaio": "marinaio",
    "operaio": "operaio"
  };

  return mappa[q] || (q || "marinaio");
}

function normalizzaTurno(valore) {
  const originale = pulisciTesto(valore);
  const v = originale.toLowerCase();

  if (
    !v ||
    v === "-" ||
    v === "--" ||
    v === "---" ||
    v === "----" ||
    /^={3,}$/.test(v) ||
    v === "rip." ||
    v === "riposo"
  ) {
    return "rip";
  }

  return originale;
}

function parseHeaderDate(valore, defaultYear) {
  if (valore instanceof Date && !isNaN(valore.getTime())) {
    return new Date(
      valore.getFullYear(),
      valore.getMonth(),
      valore.getDate()
    );
  }

  const testo = pulisciTesto(valore);

  if (!testo) return null;

  // Accetta anche il formato ISO usato dal tab VARIAZIONI_ODS: 2026-07-27.
  const isoMatch = testo.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const annoIso = Number(isoMatch[1]);
    const meseIso = Number(isoMatch[2]);
    const giornoIso = Number(isoMatch[3]);
    const dataIso = new Date(annoIso, meseIso - 1, giornoIso);
    if (
      dataIso.getFullYear() === annoIso &&
      dataIso.getMonth() === meseIso - 1 &&
      dataIso.getDate() === giornoIso
    ) return dataIso;
  }

  // Accetta: 27/07, 27/07 Lun, 27-07-2026, ecc.
  const match = testo.match(
    /^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/
  );

  if (!match) return null;

  const giorno = Number(match[1]);
  const mese = Number(match[2]);
  let anno = match[3] ? Number(match[3]) : defaultYear;

  if (anno < 100) anno += 2000;

  const d = new Date(anno, mese - 1, giorno);

  if (
    d.getFullYear() !== anno ||
    d.getMonth() !== mese - 1 ||
    d.getDate() !== giorno
  ) {
    return null;
  }

  return d;
}

function ordinaAgenti(a, b) {
  const ordine = {
    "capitano": 1,
    "capo timoniere": 2,
    "timoniere": 3,
    "motorista": 4,
    "aiuto motorista": 5,
    "marinaio": 6,
    "operaio": 7
  };

  const gradoA = ordine[a.qualifica] || 99;
  const gradoB = ordine[b.qualifica] || 99;

  if (gradoA !== gradoB) return gradoA - gradoB;

  return String(a.agente).localeCompare(
    String(b.agente),
    "it"
  );
}

function creaPeriodo(dataInizioIso, dataFineIso) {
  const a = parseIsoDate(dataInizioIso);
  const b = parseIsoDate(dataFineIso);

  return (
    "DAL " +
    pad(a.getDate()) + "-" + pad(a.getMonth() + 1) +
    " AL " +
    pad(b.getDate()) + "-" + pad(b.getMonth() + 1) +
    "-" + b.getFullYear()
  );
}

function formatDateLabel(d) {
  const giorni = [
    "Domenica", "Lunedì", "Martedì", "Mercoledì",
    "Giovedì", "Venerdì", "Sabato"
  ];

  const mesi = [
    "gennaio", "febbraio", "marzo", "aprile",
    "maggio", "giugno", "luglio", "agosto",
    "settembre", "ottobre", "novembre", "dicembre"
  ];

  return (
    giorni[d.getDay()] + " " +
    d.getDate() + " " +
    mesi[d.getMonth()]
  );
}

function formatDayShort(d) {
  return ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"][d.getDay()];
}

function formatDateISO(d) {
  return (
    d.getFullYear() + "-" +
    pad(d.getMonth() + 1) + "-" +
    pad(d.getDate())
  );
}

function parseIsoDate(iso) {
  const p = String(iso).split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function pulisciTesto(valore) {
  return String(
    valore === null || valore === undefined ? "" : valore
  ).trim();
}

function pulisciId(valore) {
  const testo = pulisciTesto(valore);
  if (!testo) return "";
  return testo.replace(/\.0$/, "");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function configuraFoglioVariazioniOds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NAVITURNI_CONFIG.variationsSheetName);
  const source = ss.getSheetByName(NAVITURNI_CONFIG.sheetName);
  if (!sheet || !source) throw new Error("Foglio ODS o Foglio1 non trovato.");

  const maxRows = Math.max(sheet.getMaxRows(), 500);
  if (sheet.getMaxRows() < maxRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), maxRows - sheet.getMaxRows());
  }

  sheet.setFrozenRows(1);
  sheet.getRange("A1:I1")
    .setBackground("#15313d")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.setColumnWidth(1, 75);
  sheet.setColumnWidth(2, 105);
  sheet.setColumnWidth(3, 85);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(7, 95);
  sheet.setColumnWidth(8, 120);
  sheet.setColumnWidth(9, 140);
  sheet.hideColumns(3);
  sheet.hideColumns(5);
  sheet.getRange("B2:B" + maxRows).setNumberFormat("yyyy-mm-dd");

  const activeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["SÌ", "NO"], true)
    .setAllowInvalid(false)
    .build();
  const agentRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(source.getRange("D2:D" + source.getLastRow()), true)
    .setAllowInvalid(true)
    .build();
  const shiftRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      "D1", "D2", "D3", "D4", "BIS", "AGB", "DT", "POND",
      "T1", "T2", "M1", "R1", "R2", "R3", "R4", "CAR",
      "P1", "P2", "P3", "CAP", "SR1", "RIP", "L.D.", "CONG"
    ], true)
    .setAllowInvalid(true)
    .build();
  const typeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["D'UFFICIO", "VOLONTARIA"], true)
    .setAllowInvalid(false)
    .build();
  const noteRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["ISTRUTTORE"], true)
    .setAllowInvalid(true)
    .build();

  sheet.getRange("A2:A" + maxRows).setDataValidation(activeRule);
  sheet.getRange("D2:D" + maxRows).setDataValidation(agentRule);
  sheet.getRange("F2:F" + maxRows).setDataValidation(shiftRule);
  sheet.getRange("H2:H" + maxRows).setDataValidation(typeRule);
  sheet.getRange("I2:I" + maxRows).setDataValidation(noteRule);

  const incompleteRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND(COUNTA($A2:$I2)>0,OR($B2="",$D2="",$F2="",$G2=""))')
    .setBackground("#f4cccc")
    .setRanges([sheet.getRange("A2:I" + maxRows)])
    .build();
  sheet.setConditionalFormatRules([incompleteRule]);

  if (!sheet.getFilter()) sheet.getRange(1, 1, maxRows, 9).createFilter();
  sheet.getRange("A1:I" + maxRows).setVerticalAlignment("middle");
  sheet.getRange("A2:I" + maxRows).setBorder(false, false, true, false, false, false, "#d9e2f3", SpreadsheetApp.BorderStyle.SOLID);
}

function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();

  if (sheet.getName() === "INSERIMENTO_TURNO" &&
      e.range.getA1Notation() === "B13" &&
      String(e.value).toUpperCase() === "TRUE") {
    salvaNuovoTurnoNave_(sheet);
    return;
  }
  if (sheet.getName() !== NAVITURNI_CONFIG.variationsSheetName || e.range.getRow() < 2) return;

  const row = e.range.getRow();
  const activeCell = sheet.getRange(row, 1);
  const dateCell = sheet.getRange(row, 2);
  const agentCell = sheet.getRange(row, 4);
  const shiftCell = sheet.getRange(row, 6);
  const odsCell = sheet.getRange(row, 7);
  const noteCell = sheet.getRange(row, 9);

  if (!activeCell.getValue() && (dateCell.getValue() || agentCell.getValue() || shiftCell.getValue())) {
    activeCell.setValue("SÌ");
  }

  if (!odsCell.getValue() && row > 2) {
    const previousOds = sheet.getRange(row - 1, 7).getDisplayValue();
    if (previousOds) odsCell.setValue(previousOds);
  }

  if (String(noteCell.getValue()).trim().toUpperCase() === "ISTRUTTORE") {
    const shift = String(shiftCell.getValue()).trim().toUpperCase();
    if (shift && shift !== "RIP" && !shift.endsWith("*")) shiftCell.setValue(shift + "*");
  }
}


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("ODS")
    .addItem("Importa PDF ODS", "mostraImportazioneOds")
    .addItem("Configura tab variazioni", "configuraFoglioVariazioniOds")
    .addSeparator()
    .addItem("Apri inserimento turno nave", "apriMascheraTurnoNave")
    .addToUi();
}

function mostraImportazioneOds() {
  const html = HtmlService.createHtmlOutput(`
<!doctype html><html><head><base target="_top">
<style>
body{font-family:Arial,sans-serif;background:#071923;color:#e5f3f7;padding:18px}h2{color:#2dd4bf;margin-top:0}
label{display:block;margin:12px 0 6px;font-weight:700}input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid #315665;background:#102b36;color:#fff}
button{margin-top:16px;padding:11px 16px;border:0;border-radius:9px;background:#2dd4bf;color:#062027;font-weight:900;cursor:pointer}
button:disabled{opacity:.5}.status{margin-top:14px;white-space:pre-wrap;line-height:1.4}.hint{color:#9db5be;font-size:12px}
</style></head><body>
<h2>Importa ODS</h2>
<p class="hint">Seleziona il PDF: verranno importate sia le variazioni del personale sia le assegnazioni delle navi.</p>
<label>File PDF</label><input id="pdf" type="file" accept="application/pdf">
<label>Numero ODS</label><input id="ods" placeholder="es. 27/2026">
<button id="go" onclick="importa()">Importa ODS</button>
<div id="status" class="status"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<script>
if(typeof pdfjsLib!=='undefined')pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const fileInput=document.getElementById('pdf'), odsInput=document.getElementById('ods'), statusEl=document.getElementById('status'), button=document.getElementById('go');
fileInput.addEventListener('change',()=>{const m=(fileInput.files[0]?.name||'').match(/n\\.?\\s*(\\d+)[^0-9]+(20\\d{2})/i);if(m&&!odsInput.value)odsInput.value=m[1]+'/'+m[2];});
async function importa(){
 const file=fileInput.files[0]; if(!file){statusEl.textContent='Seleziona un PDF.';return}
 if(!odsInput.value.trim()){statusEl.textContent='Indica il numero ODS.';return}
 button.disabled=true; statusEl.textContent='Lettura del PDF…';
 try{
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise; let pages=[], structured=[];
  for(let p=1;p<=pdf.numPages;p++){
   const page=await pdf.getPage(p), content=await page.getTextContent(), lines={};
   content.items.forEach(item=>{const y=Math.round(item.transform[5]);(lines[y]||(lines[y]=[])).push({x:item.transform[4],s:item.str})});
   const pageText=Object.keys(lines).map(Number).sort((a,b)=>b-a).map(y=>lines[y].sort((a,b)=>a.x-b.x).map(v=>v.s).join(' ').replace(/ +/g,' ').trim()).filter(Boolean).join(String.fromCharCode(10));
   pages.push(pageText);
   if(pageText.toUpperCase().indexOf('TURNO NAVI')>=0) structured.push({items:content.items.map(item=>({x:item.transform[4],y:item.transform[5],s:item.str}))});
  }
  statusEl.textContent='Analisi e inserimento…';
  google.script.run.withSuccessHandler(r=>{const v=r.variazioni||{},n=r.navi||{};statusEl.textContent='Completato. Variazioni: '+(v.inserite||0)+' inserite, '+(v.duplicate||0)+' già presenti.'+String.fromCharCode(10)+'Turni nave: '+(n.inserite||0)+' inseriti, '+(n.aggiornate||0)+' aggiornati, '+(n.duplicate||0)+' invariati.';button.disabled=false})
   .withFailureHandler(e=>{statusEl.textContent='Errore: '+e.message;button.disabled=false})
   .importaOdsDaPdf(pages.join('\\n'),structured,odsInput.value.trim(),file.name);
 }catch(e){statusEl.textContent='Errore nella lettura: '+e.message;button.disabled=false}
}
<\/script></body></html>`).setWidth(520).setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, "Importa ODS");
}

function importaOdsDaPdf(testo, pagineStrutturate, ods, nomeFile) {
  const ss = SpreadsheetApp.getActive();
  const variationsSheet = ss.getSheetByName(NAVITURNI_CONFIG.variationsSheetName);
  const shipsSheet = ss.getSheetByName(NAVITURNI_CONFIG.shipsSheetName);
  if (!variationsSheet) throw new Error("Tab VARIAZIONI_ODS non trovato");
  if (!shipsSheet) throw new Error("Tab TURNI_NAVI non trovato");

  const variationRows = analizzaVariazioniOds_(testo, ods);
  const shipRows = analizzaTurniNaviOds_(pagineStrutturate || [], ods);
  if (!variationRows.length && !shipRows.length) {
    throw new Error("Nel PDF non sono state riconosciute variazioni o assegnazioni nave");
  }

  const existingVariations = variationsSheet.getLastRow() > 1
    ? variationsSheet.getRange(2, 1, variationsSheet.getLastRow() - 1, 9).getDisplayValues()
    : [];
  const variationKeys = new Set(existingVariations.map(function(row) {
    return [row[1], String(row[3]).trim().toUpperCase(), String(row[6]).trim()].join("|");
  }));
  const uniqueVariations = variationRows.filter(function(row) {
    const key = [row[1], String(row[3]).trim().toUpperCase(), row[6]].join("|");
    if (variationKeys.has(key)) return false;
    variationKeys.add(key);
    return true;
  });
  if (uniqueVariations.length) {
    variationsSheet.getRange(variationsSheet.getLastRow() + 1, 1, uniqueVariations.length, 9)
      .setValues(uniqueVariations);
  }

  const shipResult = aggiornaTurniNaviDaOds_(shipsSheet, shipRows);
  return {
    variazioni: {
      inserite: uniqueVariations.length,
      duplicate: variationRows.length - uniqueVariations.length
    },
    navi: shipResult,
    file: nomeFile
  };
}

function importaVariazioniOdsDaTesto(testo, ods, nomeFile) {
  return importaOdsDaPdf(testo, [], ods, nomeFile).variazioni;
}

function analizzaTurniNaviOds_(pages, ods) {
  const mesi = {
    GENNAIO:0, FEBBRAIO:1, MARZO:2, APRILE:3, MAGGIO:4, GIUGNO:5,
    LUGLIO:6, AGOSTO:7, SETTEMBRE:8, OTTOBRE:9, NOVEMBRE:10, DICEMBRE:11
  };
  const courseMap = {
    D1:"DESENZANO", D2:"DESENZANO", D3:"DESENZANO", D4:"DESENZANO", BIS:"DESENZANO",
    T1:"MADERNO", T2:"MADERNO", M1:"MADERNO",
    R1:"RIVA", R2:"RIVA", R3:"RIVA", R4:"RIVA", CAR:"RIVA", CAR1:"RIVA",
    P1:"PESCHIERA", P2:"PESCHIERA", P3:"PESCHIERA", CAP:"PESCHIERA", CAP1:"PESCHIERA", SR1:"PESCHIERA"
  };
  const normalize = function(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  };
  const iso = function(date) {
    return Utilities.formatDate(date, Session.getScriptTimeZone() || "Europe/Rome", "yyyy-MM-dd");
  };
  const output = [];

  (pages || []).forEach(function(page) {
    const items = (page.items || []).map(function(item) {
      return { x:Number(item.x) || 0, y:Number(item.y) || 0, s:String(item.s || "").trim() };
    }).filter(function(item) { return item.s; });
    if (!items.length) return;

    const pageText = normalize(items.map(function(item) { return item.s; }).join(" "));
    if (pageText.indexOf("TURNO NAVI") < 0) return;

    let startDay, startMonth, startYear;
    const crossMonth = pageText.match(/DAL(?:L['’]?)?\s*(\d{1,2})\s+([A-Z]+)\s+AL\s+\d{1,2}\s+([A-Z]+)\s+(20\d{2})/);
    const sameMonth = pageText.match(/DAL(?:L['’]?)?\s*(\d{1,2})\s+AL\s+\d{1,2}\s+([A-Z]+)\s+(20\d{2})/);
    if (crossMonth && mesi[crossMonth[2]] !== undefined) {
      startDay = Number(crossMonth[1]);
      startMonth = mesi[crossMonth[2]];
      startYear = Number(crossMonth[4]);
    } else if (sameMonth && mesi[sameMonth[2]] !== undefined) {
      startDay = Number(sameMonth[1]);
      startMonth = mesi[sameMonth[2]];
      startYear = Number(sameMonth[3]);
    } else {
      return;
    }
    const startDate = new Date(startYear, startMonth, startDay);

    const lines = {};
    items.forEach(function(item) {
      const key = String(Math.round(item.y));
      if (!lines[key]) lines[key] = [];
      lines[key].push(item);
    });
    const numericLines = Object.keys(lines).map(function(key) {
      const numbers = lines[key].filter(function(item) {
        return /^\d{1,2}$/.test(item.s) && Number(item.s) >= 1 && Number(item.s) <= 31;
      }).sort(function(a,b) { return a.x - b.x; });
      return { y:Number(key), numbers:numbers };
    }).filter(function(line) { return line.numbers.length >= 3; })
      .sort(function(a,b) { return b.numbers.length - a.numbers.length; });
    if (!numericLines.length) return;

    const dateItems = numericLines[0].numbers;
    const centers = dateItems.map(function(item) { return item.x; });
    const firstDateX = centers[0];

    const courses = items.filter(function(item) {
      return item.x < firstDateX - 8 && courseMap[normalize(item.s)];
    }).map(function(item) {
      return { x:item.x, y:item.y, raw:normalize(item.s) };
    }).sort(function(a,b) { return b.y - a.y; });

    courses.forEach(function(course, courseIndex) {
      let courseCode = course.raw.replace(/1$/, function(match) {
        return /^(CAR1|CAP1)$/.test(course.raw) ? "" : match;
      });
      if (course.raw === "CAR1") courseCode = "CAR";
      if (course.raw === "CAP1") courseCode = "CAP";
      const previousY = courseIndex > 0 ? courses[courseIndex - 1].y : course.y + 34;
      const nextY = courseIndex < courses.length - 1 ? courses[courseIndex + 1].y : course.y - 34;
      const upperY = (previousY + course.y) / 2;
      const lowerY = (nextY + course.y) / 2;

      centers.forEach(function(center, dayIndex) {
        const left = dayIndex === 0 ? center - (centers[1] - center) / 2 : (centers[dayIndex - 1] + center) / 2;
        const right = dayIndex === centers.length - 1
          ? center + (center - centers[dayIndex - 1]) / 2
          : (center + centers[dayIndex + 1]) / 2;
        const cellItems = items.filter(function(item) {
          return item.x >= left && item.x < right && item.y < upperY && item.y > lowerY;
        });
        const rowYs = Array.from(new Set(cellItems.map(function(item) { return Math.round(item.y); })));
        const shipY = rowYs.sort(function(a,b) {
          return Math.abs(a - course.y) - Math.abs(b - course.y);
        })[0];
        if (shipY === undefined || Math.abs(shipY - course.y) > 4) return;

        let ship = cellItems.filter(function(item) {
          return Math.abs(item.y - shipY) < 1.5 && normalize(item.s) !== course.raw;
        }).sort(function(a,b) { return a.x - b.x; }).map(function(item) { return item.s; }).join(" ").trim();
        if (!ship || /RIFORNIMENTO/i.test(ship)) return;
        ship = ship.replace(/\s*\+\s*$/, "").trim();

        const refuel = cellItems.some(function(item) {
          return item.y > course.y && /RIFORNIMENTO/i.test(item.s);
        }) ? "SÌ" : "NO";

        const lowerLines = rowYs.filter(function(y) { return y < course.y - 2; })
          .sort(function(a,b) { return b - a; });
        let mooring = "";
        if (lowerLines.length) {
          const mooringY = lowerLines[0];
          mooring = cellItems.filter(function(item) {
            return Math.abs(item.y - mooringY) < 1.5;
          }).sort(function(a,b) { return a.x - b.x; }).map(function(item) { return item.s; }).join(" ").trim();
          if (/RIFORNIMENTO/i.test(mooring)) mooring = "";
        }

        const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + dayIndex);
        output.push(["SÌ", iso(date), courseCode, courseMap[course.raw], ship, refuel, mooring, ods, ""]);
      });
    });
  });

  return output;
}

function aggiornaTurniNaviDaOds_(sheet, rows) {
  if (!rows.length) return { inserite:0, aggiornate:0, duplicate:0 };
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(value) { return String(value || "").trim().toUpperCase(); });
  const index = function(name) { return headers.indexOf(name); };
  const dateIso = function(value) {
    if (value instanceof Date) {
      return Utilities.formatDate(value, Session.getScriptTimeZone() || "Europe/Rome", "yyyy-MM-dd");
    }
    const text = String(value || "").trim();
    const parts = text.split("/");
    return parts.length === 3 ? parts[2] + "-" + parts[1].padStart(2,"0") + "-" + parts[0].padStart(2,"0") : text;
  };
  const existing = new Map();
  values.slice(1).forEach(function(row, offset) {
    existing.set(dateIso(row[index("DATA")]) + "|" + String(row[index("CORSA")] || "").trim().toUpperCase(), {
      rowNumber:offset + 2,
      values:row
    });
  });

  let inserted = 0, updated = 0, duplicates = 0;
  const toAppend = [];
  rows.forEach(function(row) {
    const key = dateIso(row[1]) + "|" + String(row[2]).trim().toUpperCase();
    const found = existing.get(key);
    if (!found) {
      toAppend.push(row);
      inserted++;
      return;
    }
    const old = found.values;
    const unchanged =
      String(old[index("RESIDENZA")] || "").trim().toUpperCase() === String(row[3]).trim().toUpperCase() &&
      String(old[index("NAVE")] || "").trim().toUpperCase() === String(row[4]).trim().toUpperCase() &&
      String(old[index("RIFORNIMENTO_MATTINA")] || "").trim().toUpperCase() === String(row[5]).trim().toUpperCase() &&
      String(old[index("ORMEGGIO_SERA")] || "").trim().toUpperCase() === String(row[6]).trim().toUpperCase() &&
      String(old[index("ODS")] || "").trim() === String(row[7]).trim();
    if (unchanged) {
      duplicates++;
    } else {
      sheet.getRange(found.rowNumber, 1, 1, 9).setValues([row]);
      updated++;
    }
  });

  if (toAppend.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, 9).setValues(toAppend);
  }
  const lastRow = sheet.getLastRow();
  if (lastRow > 2) {
    sheet.getRange(2, 1, lastRow - 1, 9).sort([
      { column:4, ascending:true },
      { column:2, ascending:true },
      { column:3, ascending:true }
    ]);
    sheet.getRange(2, 2, lastRow - 1, 1).setNumberFormat("yyyy-mm-dd");
  }
  return { inserite:inserted, aggiornate:updated, duplicate:duplicates };
}

function analizzaVariazioniOds_(testo, ods) {
  const mesi = {GENNAIO:1,FEBBRAIO:2,MARZO:3,APRILE:4,MAGGIO:5,GIUGNO:6,LUGLIO:7,AGOSTO:8,SETTEMBRE:9,OTTOBRE:10,NOVEMBRE:11,DICEMBRE:12};
  const lines = String(testo || "").split(/\\r?\\n/).map(v => v.replace(/\\s+/g, " ").trim()).filter(Boolean);
  let tipo = "", data = "", started = false;
  const out = [];
  const norm = v => String(v).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toUpperCase();
  const iso = (d,m,y) => y + "-" + String(m).padStart(2,"0") + "-" + String(d).padStart(2,"0");
  const add = (agente, turno, note) => {
    turno = String(turno || "").trim();
    if (/^={3,}$/.test(turno)) turno = "RIP";
    const prende = turno.match(/PRENDE IL TURNO N\\.?\\s*(\\d+)/i);
    if (prende) turno = prende[1];
    let istruttore = /ISTRUTTORE/i.test(turno) || /ISTRUTTORE/i.test(note || "");
    turno = turno.replace(/\\bISTRUTTORE\\b/ig, "").replace(/\\bsn\\b/ig, "").replace(/\\([^)]*\\)/g, "").trim();
    if (istruttore && turno !== "RIP" && !turno.endsWith("*")) turno += "*";
    if (!agente || !turno || !data || !tipo) return;
    out.push(["SÌ",data,"",agente.trim(),"",turno.toUpperCase(),ods,tipo,note || ""]);
  };
  lines.forEach(line => {
    const n = norm(line);
    if (n.includes("VARIAZIONI TURNI DA UFFICIO")) { tipo = "D'UFFICIO"; started = true; return; }
    if (n.includes("VARIAZIONI TURNI VOLONTARI")) { tipo = "VOLONTARIA"; started = true; return; }
    if (started && (/^COMITIVE O\\.?D\\.?S/.test(n) || /^TURNO NAVI/.test(n))) { tipo = ""; return; }
    const dm = n.match(/^(?:DA\\s+)?(?:LUNEDI|MARTEDI|MERCOLEDI|MEROLEDI|GIOVEDI|VENERDI|SABATO|DOMENICA)[' ]*\\s+(\\d{1,2})\\s+([A-Z]+)\\s+(20\\d{2})/);
    if (dm && mesi[dm[2]]) { data = iso(dm[1], mesi[dm[2]], dm[3]); return; }
    if (!tipo || !data) return;
    const am = line.match(/^([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]+?):\\s*(.+)$/i);
    if (!am) return;
    const agente = am[1].trim(), descrizione = am[2].trim();
    const second = descrizione.match(/^([^()]+?)\\s+sn\\s*\\(([^()]+?)\\s+istruttore\\)/i);
    if (second) {
      add(agente, second[1], "");
      add(second[2].trim(), second[1], "ISTRUTTORE");
    } else {
      add(agente, descrizione, /ISTRUTTORE/i.test(descrizione) ? "ISTRUTTORE" : "");
    }
  });
  return out;
}


function leggiTurniNavi(ss) {
  const sheet = ss.getSheetByName(NAVITURNI_CONFIG.shipsSheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(value) { return String(value || "").trim().toUpperCase(); });
  const column = function(name) { return headers.indexOf(name); };
  const read = function(row, name) { const index = column(name); return index >= 0 ? row[index] : ""; };
  return values.slice(1).map(function(row) {
    const rawDate = read(row, "DATA");
    const data = rawDate instanceof Date
      ? Utilities.formatDate(rawDate, Session.getScriptTimeZone() || "Europe/Rome", "yyyy-MM-dd")
      : (function(text) { const parts = text.split("/"); return parts.length === 3 ? parts[2] + "-" + parts[1] + "-" + parts[0] : text; })(String(rawDate || "").trim());
    return {
      attiva: !/^(no|false|0)$/i.test(String(read(row, "ATTIVA") || "")),
      data: data,
      corsa: String(read(row, "CORSA") || "").trim().toUpperCase(),
      residenza: String(read(row, "RESIDENZA") || "").trim().toUpperCase(),
      nave: String(read(row, "NAVE") || "").trim(),
      rifornimento_mattina: String(read(row, "RIFORNIMENTO_MATTINA") || "").trim(),
      ormeggio_serale: String(read(row, "ORMEGGIO_SERA") || "").trim(),
      ods: String(read(row, "ODS") || "").trim(),
      note: String(read(row, "NOTE") || "").trim()
    };
  }).filter(function(item) { return item.data && item.corsa; });
}


function apriMascheraTurnoNave() {
  const sheet = SpreadsheetApp.getActive().getSheetByName("INSERIMENTO_TURNO");
  if (sheet) sheet.activate();
}

function salvaNuovoTurnoNave_(formSheet) {
  const ss = formSheet.getParent();
  const target = ss.getSheetByName(NAVITURNI_CONFIG.shipsSheetName);
  if (!target) {
    formSheet.getRange("B13").setValue(false);
    ss.toast("Tab TURNI_NAVI non trovato.", "Errore", 6);
    return;
  }

  const values = formSheet.getRange("B3:B11").getValues().flat();
  const attiva = String(values[0] || "SÌ").trim().toUpperCase();
  const data = values[1];
  const corsa = String(values[2] || "").trim().toUpperCase();
  const residenza = String(values[3] || "").trim().toUpperCase();
  const nave = String(values[4] || "").trim();
  const rifornimento = String(values[5] || "NO").trim().toUpperCase();
  const ormeggio = String(values[6] || "").trim();
  const ods = String(values[7] || "").trim();
  const note = String(values[8] || "").trim();

  if (!data || !corsa || !residenza || !nave) {
    formSheet.getRange("B13").setValue(false);
    ss.toast("Compila almeno DATA, CORSA, RESIDENZA e NAVE.", "Turno non salvato", 7);
    return;
  }

  const newRow = target.getLastRow() + 1;
  target.getRange(newRow, 1, 1, 9).setValues([[
    attiva || "SÌ", data, corsa, residenza, nave,
    rifornimento || "NO", ormeggio, ods, note
  ]]);
  target.getRange(newRow, 2).setNumberFormat("yyyy-mm-dd");

  if (newRow > 2) {
    target.getRange(2, 1, newRow - 1, 9).sort([
      { column: 4, ascending: true },
      { column: 2, ascending: true },
      { column: 3, ascending: true }
    ]);
  }

  formSheet.getRange("B4:B11").clearContent();
  formSheet.getRange("B3").setValue("SÌ");
  formSheet.getRange("B8").setValue("NO");
  formSheet.getRange("B13").setValue(false);
  ss.toast("Turno aggiunto correttamente a TURNI_NAVI.", "Salvataggio completato", 5);
}
