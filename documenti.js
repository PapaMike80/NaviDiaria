'use strict';

const CONFIG = {
  owner: 'PapaMike80',
  repo: 'NaviDiaria',
  branch: 'main',
  folders: ['turni', 'ods'],
  metadataFile: 'documenti.json'
};

const state = {
  documents: [],
  metadata: []
};

const elements = {
  turniGrid: document.getElementById('turniGrid'),
  odsGrid: document.getElementById('odsGrid'),
  turniCount: document.getElementById('turniCount'),
  odsCount: document.getElementById('odsCount'),
  refreshButton: document.getElementById('refreshButton'),
  sourceLabel: document.getElementById('sourceLabel'),
  lastUpdate: document.getElementById('lastUpdate'),
  notice: document.getElementById('notice'),
  emptyState: document.getElementById('emptyState')
};

function githubApiUrl(folder) {
  return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}?ref=${CONFIG.branch}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json'
    }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function loadMetadata() {
  try {
    const response = await fetch(
      `${CONFIG.metadataFile}?v=${Date.now()}`,
      { cache: 'no-store' }
    );

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data) ? data : (data.documenti || []);
  } catch {
    return [];
  }
}

function metadataFor(path, filename) {
  const normalizedPath = decodeURIComponent(path).toLowerCase();
  const normalizedName = filename.toLowerCase();

  return state.metadata.find(item => {
    const file = decodeURIComponent(item.file || '').toLowerCase();
    return file === normalizedPath || file.endsWith(`/${normalizedName}`);
  }) || {};
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function titleFromFilename(filename, type, number) {
  const cleanName = filename
    .replace(/\.pdf$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (type === 'ods') {
    return `Ordine di servizio n. ${number || cleanName}`;
  }

  return cleanName
    .toLowerCase()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function extractOdsNumber(filename) {
  const patterns = [
    /(?:o\.?\s*d\.?\s*s\.?|ods)[^0-9]*(?:n\.?\s*)?(\d{1,3})/i,
    /(?:n\.?\s*)(\d{1,3})(?=\s*[-_]\s*20\d{2})/i,
    /(\d{1,3})(?=-20\d{2})/i
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) return Number(match[1]);
  }

  return null;
}

function parseItalianRange(filename) {
  const matches = filename.match(
    /(\d{1,2})[-_](\d{1,2})(?:[-_](\d{2,4}))?/g
  );

  if (!matches || matches.length < 2) return {};

  function toIso(token) {
    const [day, month, rawYear] = token.split(/[-_]/).map(Number);
    const year = rawYear
      ? (rawYear < 100 ? 2000 + rawYear : rawYear)
      : 2026;

    return [
      year,
      String(month).padStart(2, '0'),
      String(day).padStart(2, '0')
    ].join('-');
  }

  return {
    inizio: toIso(matches[0]),
    fine: toIso(matches[1])
  };
}

function pagesPdfUrl(path) {
  /*
   * È fondamentale usare il percorso relativo della pagina GitHub Pages.
   * file.download_url punta a raw.githubusercontent.com e può forzare
   * il download; il percorso relativo apre invece il PDF nel browser.
   */
  return encodeURI(path);
}

function fileToDocument(file, folder) {
  const filename = file.name;
  const path = file.path || `${folder}/${filename}`;
  const metadata = metadataFor(path, filename);
  const isOds = folder === 'ods';
  const isDraft = !isOds && /bozza/i.test(filename);
  const number = metadata.numero ?? extractOdsNumber(filename);
  const range = parseItalianRange(filename);

  return {
    id: metadata.id || file.sha || path,
    tipo: metadata.tipo || (isOds ? 'ods' : isDraft ? 'bozza' : 'turno'),
    numero: number,
    titolo: metadata.titolo || titleFromFilename(
      filename,
      isOds ? 'ods' : isDraft ? 'bozza' : 'turno',
      number
    ),
    file: pagesPdfUrl(path),
    path,
    data: metadata.data || null,
    inizio: metadata.inizio || range.inizio || null,
    fine: metadata.fine || range.fine || null,
    descrizione: metadata.descrizione || '',
    filename
  };
}

async function scanGitHub() {
  const folderResults = await Promise.all(
    CONFIG.folders.map(async folder => {
      const entries = await fetchJson(githubApiUrl(folder));

      if (!Array.isArray(entries)) return [];

      return entries
        .filter(entry =>
          entry.type === 'file' &&
          /\.pdf$/i.test(entry.name)
        )
        .map(entry => fileToDocument(entry, folder));
    })
  );

  return folderResults.flat();
}

function fallbackFromJson() {
  return state.metadata.map((item, index) => ({
    id: item.id || `json-${index}`,
    ...item,
    file: pagesPdfUrl(item.file || ''),
    path: item.file || '',
    filename: (item.file || '').split('/').pop()
  }));
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return '';

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function isCurrentTurn(documentItem) {
  if (documentItem.tipo !== 'turno') return false;

  const start = parseDate(documentItem.inizio);
  const end = parseDate(documentItem.fine);
  if (!start || !end) return false;

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  return today >= start && today <= end;
}

function documentDescription(documentItem) {
  if (documentItem.inizio && documentItem.fine) {
    const stateText = isCurrentTurn(documentItem)
      ? ' · Documento in vigore'
      : '';

    return `<b>Validità:</b> ${formatDate(documentItem.inizio)} – ${formatDate(documentItem.fine)}${stateText}`;
  }

  if (documentItem.data) {
    return `Data di emissione: ${formatDate(documentItem.data)}`;
  }

  return documentItem.tipo === 'ods'
    ? 'Documento presente nella cartella ODS'
    : 'Documento presente nella cartella turni';
}

function turnCard(documentItem) {
  const isDraft = documentItem.tipo === 'bozza';
  const isCurrent = isCurrentTurn(documentItem);

  const classes = [
    'document',
    isDraft ? 'featured draft-document' : '',
    isCurrent ? 'published-document' : ''
  ].filter(Boolean).join(' ');

  const label = isDraft
    ? 'BOZZA · NON DEFINITIVA'
    : isCurrent
      ? 'TURNO · IN VIGORE'
      : 'TURNO · PUBBLICATO';

  return `
    <a class="${classes}"
       href="${escapeHtml(documentItem.file)}"
       target="_blank"
       rel="noopener">
      <span class="pdf-icon">PDF</span>
      <div>
        <small>${label}</small>
        <strong>${escapeHtml(documentItem.titolo)}</strong>
        <p>${documentDescription(documentItem)}</p>
      </div>
      <b aria-hidden="true">↗</b>
    </a>
  `;
}

function odsCard(documentItem) {
  return `
    <a class="document"
       href="${escapeHtml(documentItem.file)}"
       target="_blank"
       rel="noopener">
      <span class="ods-number">${escapeHtml(documentItem.numero || '≡')}</span>
      <div>
        <strong>${escapeHtml(documentItem.titolo)}</strong>
        <p>${documentDescription(documentItem)}</p>
      </div>
      <b aria-hidden="true">↗</b>
    </a>
  `;
}

function documentScore(documentItem) {
  const date = parseDate(
    documentItem.data ||
    documentItem.inizio ||
    documentItem.fine
  );

  return date
    ? date.getTime()
    : Number(documentItem.numero || 0);
}

function countLabel(number) {
  return `${number} document${number === 1 ? 'o' : 'i'}`;
}

function renderDocuments() {
  const turni = state.documents
    .filter(item => item.tipo !== 'ods')
    .sort((a, b) => documentScore(b) - documentScore(a));

  const ods = state.documents
    .filter(item => item.tipo === 'ods')
    .sort((a, b) =>
      (b.numero || 0) - (a.numero || 0) ||
      documentScore(b) - documentScore(a)
    );

  elements.turniGrid.innerHTML = turni.map(turnCard).join('');
  elements.odsGrid.innerHTML = ods.map(odsCard).join('');

  elements.turniCount.textContent = countLabel(turni.length);
  elements.odsCount.textContent = countLabel(ods.length);
  elements.emptyState.style.display =
    state.documents.length ? 'none' : 'block';
}

async function loadDocuments() {
  elements.refreshButton.disabled = true;
  elements.lastUpdate.textContent = 'Aggiornamento…';
  elements.notice.hidden = true;

  state.metadata = await loadMetadata();

  try {
    state.documents = await scanGitHub();
    elements.sourceLabel.textContent = 'Cartelle GitHub in tempo reale';
    elements.lastUpdate.textContent =
      `Aggiornato ${new Date().toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit'
      })}`;
  } catch (error) {
    state.documents = fallbackFromJson();
    elements.sourceLabel.textContent = 'Archivio JSON di riserva';
    elements.lastUpdate.textContent = 'GitHub non raggiungibile';
    elements.notice.hidden = false;
    elements.notice.textContent =
      `Non riesco a leggere ora le cartelle GitHub (${error.message}). ` +
      'Mostro i documenti registrati in documenti.json.';
  }

  renderDocuments();
  elements.refreshButton.disabled = false;
}

elements.refreshButton.addEventListener('click', loadDocuments);

loadDocuments();
