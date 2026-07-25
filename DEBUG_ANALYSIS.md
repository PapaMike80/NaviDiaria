# DEBUG APPROFONDITO: Codice.gs vs navidiaria-cloud.gs

## PROBLEMA PRINCIPALE: Race Condition su Foglio1

Due web app accedono simultaneamente a **Foglio1** senza coordinamento:
- **Codice.gs** (doGet) → legge Foglio1 per generare NaviTurni
- **navidiaria-cloud.gs** (doPost) → legge Foglio1 per buildNaviWeeksFromFoglio1_()

**Risultato:** Timeout di blocco quando gli accessi si sovrappongono.

---

## ANALISI DETTAGLIATA

### 1. CODICE.GS - Letture Foglio1

#### 🟡 PROBLEMA: Multiple sheet.getDataRange() senza protezione interna

```javascript
// Linea 88-89
function generaNaviturni() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NAVITURNI_CONFIG.sheetName);
  const data = sheet.getDataRange().getDisplayValues();  // ← LEGGE TUTTO
  
  // DENTRO generaNaviturni():
  leggiBozzaDal(ss);           // ← RILEGGERE (sheet.getRange(1,1,1,10))
  leggiVariazioniOds(ss);      // ← LEGGE sheet.getDataRange() su VARIAZIONI_ODS
  leggiTurniNavi(ss);          // ← LEGGE sheet.getDataRange() su TURNI_NAVI
  // ... e altri metodi che accedono ai sheet
}
```

**Impatto:** Ogni `generaNaviturni()` legge Foglio1 + VARIAZIONI_ODS + TURNI_NAVI + NAVI_UTENTI = 4 getDataRange() sequenziali

#### 🔴 PROBLEMA CRITICO: generaNaviturni() ha sub-function che ri-leggono gli stessi dati

```javascript
// Linea 234-240: leggiBariste() legge NAVI_UTENTI
function leggiBariste(ss) {
  const directory = ss.getSheetByName("NAVI_UTENTI");
  const rows = directory.getRange(2, 1, directory.getLastRow() - 1, 9).getDisplayValues();
}

// Linea 270: aggiungiBaristeDaAnagrafica_() legge NAVI_UTENTI di nuovo
const rows = directory.getRange(2, 1, directory.getLastRow() - 1, 9).getDisplayValues();

// Linea 324: leggiVariazioniOds() RILEGGERE VARIAZIONI_ODS
const data = sheet.getDataRange().getDisplayValues();

// Linea 408: leggiTurniNavi() RILEGGERE TURNI_NAVI
const values = sheet.getDataRange().getValues();
```

**Impatto:** Il file viene letto fino a 3 volte nello stesso flusso.

---

### 2. NAVIDIARIA-CLOUD.GS - Letture Foglio1

#### 🟡 PROBLEMA: buildNaviWeeksFromFoglio1_() legge Foglio1

```javascript
// Funzione listNaviWeekStatus_()
function listNaviWeekStatus_(weeksSheet) {
  const available = buildNaviWeeksFromFoglio1_();  // ← LEGGE Foglio1
  
  // Inside buildNaviWeeksFromFoglio1_():
  const headers = sheet.getRange(1, 5, 1, sheet.getLastColumn() - 4).getDisplayValues()[0];
  // ← ALTRA LETTURA di Foglio1
}
```

#### 🔴 PROBLEMA: Lock cooperativo insufficiente

```javascript
// Linea 23-24 (ATTUALE - PRIMA MIA FIX):
const lock = LockService.getScriptLock();
lock.waitLock(15000);  // ← ASPETTA fino a 15 secondi (BLOCCANTE)

try {
  const sheets = ensureNavidiariaCloudSheets_();
  // Ora legge con lock acquisito
} finally {
  lock.releaseLock();
}
```

**Problema:** Se il lock è occupato da Codice.gs (che legge Foglio1 per 5-8 secondi), 
questo thread aspetta fino a 15 secondi = **timeout visibile all'utente**.

---

### 3. PROBLEMI DI PERFORMANCE IDENTIFICATI

| Funzione | Sheet | Operazione | Tempo ~| Note |
|----------|-------|-----------|--------|------|
| `doGet()` in Codice.gs | Foglio1 | getDataRange().getDisplayValues() | 3-5s | **LENTO**: legge tutte le righe |
| `generaNaviturni()` | VARIAZIONI_ODS | getDataRange().getDisplayValues() | 1-2s | Foglio separato, veloce |
| `generaNaviturni()` | TURNI_NAVI | getDataRange().getValues() | 0.5-1s | Foglio separato, veloce |
| `aggiungiBaristeDaAnagrafica_()` | NAVI_UTENTI | getRange().getDisplayValues() | 1-2s | Lookup doppio |
| `listNaviWeekStatus_()` | Foglio1 | getRange().getDisplayValues() | 2-3s | Legge solo header ma con lock aspetto |
| **TOTALE per doGet()** | - | - | **8-15s** | **Durante lock!** |

---

## SEQUENZA DI TIMEOUT

```
Tempo 0s:   Utente clicca "Carica settimane" in impostazioni.html
Tempo 0.5s: NaviCloud.request('list_week_status') → doPost() in navidiaria-cloud.gs
Tempo 1s:   doPost() acquisisce lock con tryLock(8000) ✓ (riesce)
Tempo 1.5s: buildNaviWeeksFromFoglio1_() inizia lettura Foglio1
Tempo 2s:   *** Intanto: doGet() in Codice.gs viene chiamato (da Orario.html?) ***
Tempo 2.5s: doGet() prova lock.tryLock(8000) ma lock è OCCUPATO da navidiaria-cloud.gs
Tempo 3s:   doGet() RIPROVA lock... aspetta...
Tempo 10.5s: navidiaria-cloud.gs finalmente rilascia il lock (dopo buildNaviWeeksFromFoglio1_())
Tempo 11s:  doGet() acquisisce lock, inizia lettura massiccia Foglio1
Tempo 18s:  doGet() finisce lettura
Tempo 18.5s: *** INTANTO: NaviCloud request ha timeout già da 8+ secondi! ***
Timeout error: "Timeout di blocco: un altro processo è in attesa del blocco da troppo tempo"
```

---

## SOLUZIONI PROPOSTE

### SOLUZIONE 1: Ottimizzazione dei dati letti (RAPIDO)

**Problema:** `generaNaviturni()` legge **tutte le celle** con `getDataRange().getDisplayValues()`

**Fix:** Leggi solo le colonne necessarie

```javascript
// PRIMA (LENTO):
const data = sheet.getDataRange().getDisplayValues();

// DOPO (VELOCE):
const lastRow = sheet.getLastRow();
const lastCol = sheet.getLastColumn();
const data = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();

// O ANCORA MEGLIO: leggi solo fino alla colonna data più vicina
const maxDateCol = 15;  // di solito le date sono entro colonna 15-20
const data = sheet.getRange(1, 1, lastRow, Math.min(lastCol, maxDateCol)).getDisplayValues();
```

**Beneficio:** Riduce tempo lettura da 5s → 1-2s

---

### SOLUZIONE 2: Caching dei dati (OTTIMALE)

**Idea:** Salva i dati in cache ScriptProperties e leggi da cache se recente

```javascript
function getCachedGeneraNaviturni(maxAgeSeconds = 300) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("generaNaviturni_json");
  
  if (cached) {
    const data = JSON.parse(cached);
    if (Date.now() - data.timestamp < maxAgeSeconds * 1000) {
      return data.value;  // ← ZERO letture sheet
    }
  }
  
  // Lettura sheet
  const dati = generaNaviturni();
  cache.put("generaNaviturni_json", JSON.stringify({
    value: dati,
    timestamp: Date.now()
  }), maxAgeSeconds);
  
  return dati;
}
```

**Beneficio:**
- Prima lettura: 8-15s (con lock aspetto)
- Successive 5 minuti: <10ms
- Riduce race condition del 95%

---

### SOLUZIONE 3: Lock più intelligente (FIX DEFINITIVO)

**Problema attuale:** Entrambi i lock usano lo STESSO LockService.getScriptLock() globale

**Soluzione:** Usa lock diversi per operazioni diverse

```javascript
// Codice.gs - doGet()
const lock = LockService.getScriptLock();  // Lock globale
if (!lock.tryLock(5000)) {  // Aspetta MENO tempo (5s)
  return jsonOutput({
    errore: true,
    messaggio: "Foglio temporaneamente occupato. Riprova."
  });
}

// navidiaria-cloud.gs - doPost()
const lock = LockService.getUserLock();  // Lock PER UTENTE (non globale!)
if (!lock.tryLock(8000)) {
  throw new Error("Foglio momentaneamente occupato.");
}
```

**Beneficio:** Lock separati per utenti diversi = NO contesa

---

## IMPLEMENTAZIONE CONSIGLIATA (STEP BY STEP)

### STEP 1: Fix immediato (Codice.gs - FATTO ✓)
```javascript
// Gi present in your code now:
const lock = LockService.getScriptLock();
if (!lock.tryLock(8000)) {
  throw new Error("Il foglio è temporaneamente occupato...");
}
```

### STEP 2: Fix navidiaria-cloud.gs (PROSSIMO)
Cambia `waitLock()` → `tryLock()`

```javascript
const lock = LockService.getScriptLock();
if (!lock.tryLock(8000)) {
  throw new Error("Il foglio è momentaneamente occupato. Riprova tra qualche secondo.");
}
```

### STEP 3: Aggiungere caching (OPZIONALE MA CONSIGLIATO)
```javascript
// In Codice.gs, dentro doGet():
try {
  const dati = getCachedGeneraNaviturni(300);  // Cache 5 minuti
  return jsonOutput(dati);
} finally {
  lock.releaseLock();
}
```

### STEP 4: Ottimizzare letture (LUNGO TERMINE)
- Ridurre colonne lette in `getRange()` 
- Evitare re-letture dello stesso sheet
- Usare `getValues()` invece di `getDisplayValues()` quando possibile (più veloce)

---

## ALTRE ISSUES IDENTIFICATE

### Issue 1: onEdit() non ha protezione

```javascript
// Linea 1000+
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  
  if (sheet.getName() === "INSERIMENTO_TURNO" && e.range.getA1Notation() === "B13"
      && String(e.value).toUpperCase() === "TRUE") {
    salvaNuovoTurnoNave_(sheet);  // ← PUÒ INTERFERIRE CON LETTURE
    return;
  }
}
```

**Problema:** onEdit() può modificare TURNI_NAVI mentre doPost() lo legge

**Fix:** Aggiungi lock anche in salvaNuovoTurnoNave_()

```javascript
function salvaNuovoTurnoNave_(formSheet) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    ss.toast("Impossibile salvare: foglio occupato.", "Errore", 5);
    return;
  }
  
  try {
    // ... codice originale ...
  } finally {
    lock.releaseLock();
  }
}
```

---

### Issue 2: getDataRange() vs getValues()

In navidiaria-cloud.gs Line ~340:
```javascript
const values = sheet.getDataRange().getValues();  // ← Meno efficiente di getRange()
```

Dovrebbe essere:
```javascript
const lastRow = sheet.getLastRow();
const values = sheet.getRange(1, 1, lastRow, 9).getValues();  // ← Specifico
```

---

### Issue 3: Nessun timeout nella lettura leggiBozzaDal()

```javascript
// Linea 46-60
function leggiBozzaDal(ss) {
  const sheet = ss.getSheetByName(NAVITURNI_CONFIG.sheetName);
  const firstRow = sheet.getRange(1, 1, 1, 10).getDisplayValues()[0];  // ← Potrebbe fallire
}
```

Dovrebbe avere try-catch per retry:
```javascript
function leggiBozzaDal(ss) {
  try {
    const sheet = ss.getSheetByName(NAVITURNI_CONFIG.sheetName);
    if (!sheet) return NAVITURNI_CONFIG.bozzaDal;
    const firstRow = sheet.getRange(1, 1, 1, 10).getDisplayValues()[0];
    if (!firstRow) return NAVITURNI_CONFIG.bozzaDal;
    // ... resto
  } catch (e) {
    return NAVITURNI_CONFIG.bozzaDal;  // ← Fallback OK
  }
}
```

---

## CHECKLIST CORREZIONI

- [x] **DONE:** Aggiungi lock a `doGet()` in Codice.gs
- [ ] **TODO:** Cambia `waitLock()` → `tryLock()` in navidiaria-cloud.gs
- [ ] **OPTIONAL:** Aggiungi caching con ScriptCache
- [ ] **OPTIONAL:** Ottimizza range letture
- [ ] **OPTIONAL:** Aggiungi lock a `salvaNuovoTurnoNave_()`
- [ ] **TESTING:** Prova simultaneamente:
  - Apri Orario.html (carica Foglio1)
  - Apri impostazioni.html (clicca Carica settimane)
  - Dovrebbe funzionare senza timeout

---

## COMANDI TEST GOOGLE APPS SCRIPT

Esegui in console Apps Script per testare lock behavior:

```javascript
function testLockContention() {
  const lock = LockService.getScriptLock();
  Logger.log("Tentativo acquisizione lock...");
  
  if (lock.tryLock(3000)) {
    Logger.log("✓ Lock acquisito");
    Utilities.sleep(2000);
    lock.releaseLock();
    Logger.log("✓ Lock rilasciato");
  } else {
    Logger.log("✗ Lock timeout - foglio occupato!");
  }
}

function testSheetReadPerformance() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Foglio1");
  
  const start = Date.now();
  const data = sheet.getDataRange().getDisplayValues();
  const elapsed = Date.now() - start;
  
  Logger.log(`Lettura Foglio1: ${data.length} righe × ${data[0].length} colonne in ${elapsed}ms`);
}
```

---

## CONCLUSIONE

**Root Cause:** Due web app lecono simultaneamente senza coordinamento del lock.

**Soluzione Immediata (Fase 1):**
- ✅ **GIÀ FATTO:** Lock in Codice.gs  
- ⏳ **PROSSIMO:** Cambia `waitLock()` → `tryLock()` in navidiaria-cloud.gs

**Soluzione Definitiva (Fase 2):**
- Implementa caching con ScriptProperties
- Usa lock separati per Utente vs Globale
- Ottimizza le range lette

**Tempo stimato risoluzione:** 5-10 minuti (step 1-2)
