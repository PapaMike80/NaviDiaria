/**
 * Legge il tab BARISTA e restituisce le presenze sulle corse con bar a bordo.
 * Formati supportati:
 * - DATA | CORSA | BARISTA (con ATTIVA, ID e NOTE opzionali)
 * - DATA | D2 | D3 | P2 | P3 (nelle celle va il nome della barista)
 * - BARISTA | colonne data (nelle celle va il codice corsa)
 */
function leggiBariste(ss) {
  const corseBar = ["D2", "D3", "P2", "P3"];
  const sheet = ss.getSheetByName("BARISTA");
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(normalizzaIntestazioneBarista_);
  const column = function(names) {
    for (let i = 0; i < names.length; i++) {
      const index = headers.indexOf(names[i]);
      if (index >= 0) return index;
    }
    return -1;
  };
  const colData = column(["DATA", "GIORNO"]);
  const colCorsa = column(["CORSA", "TURNO", "SERVIZIO"]);
  const colNome = column(["BARISTA", "AGENTE", "NOME", "NOMINATIVO"]);
  const colAttiva = column(["ATTIVA", "ATTIVO"]);
  const colId = column(["ID", "ID_BARISTA"]);
  const colNote = column(["NOTE", "NOTA"]);
  const colonneCorse = corseBar.map(function(corsa) {
    return { corsa: corsa, index: headers.indexOf(corsa) };
  }).filter(function(item) { return item.index >= 0; });
  const output = [];

  function add(row, data, corsa, nome) {
    const shift = String(corsa || "").trim().toUpperCase();
    const barista = String(nome || "").trim();
    if (!data || corseBar.indexOf(shift) < 0 || !barista) return;
    const activeText = colAttiva >= 0 ? String(row[colAttiva] || "").trim() : "";
    output.push({
      attiva: !/^(no|false|0)$/i.test(activeText),
      data: data,
      corsa: shift,
      id: colId >= 0 ? String(row[colId] || "").trim().replace(/\.0$/, "") : "",
      barista: barista,
      note: colNote >= 0 ? String(row[colNote] || "").trim() : ""
    });
  }

  if (colData >= 0) {
    values.slice(1).forEach(function(row) {
      const date = parseHeaderDate(row[colData], NAVITURNI_CONFIG.defaultYear);
      if (!date) return;
      const iso = formatDateISO(date);
      if (colCorsa >= 0 && colNome >= 0) add(row, iso, row[colCorsa], row[colNome]);
      colonneCorse.forEach(function(item) {
        add(row, iso, item.corsa, row[item.index]);
      });
    });
    return output;
  }

  if (colNome >= 0) {
    headers.forEach(function(header, index) {
      const date = parseHeaderDate(values[0][index], NAVITURNI_CONFIG.defaultYear);
      if (!date) return;
      const iso = formatDateISO(date);
      values.slice(1).forEach(function(row) {
        const shift = String(row[index] || "").trim().toUpperCase();
        add(row, iso, shift, row[colNome]);
      });
    });
  }
  return output;
}

function normalizzaIntestazioneBarista_(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
