'use strict';

const CONFIG = {
  owner: 'PapaMike80',
  repo: 'NaviDiaria',
  branch: 'main',
  folders: ['turni', 'ods'],
  metadataFile: 'documenti.json'
};

const state = { documents: [], filter: 'tutti', search: '', metadata: [] };
const $ = selector => document.querySelector(selector);
const els = {
  turniGrid: $('#turniGrid'), odsGrid: $('#odsGrid'), turniCount: $('#turniCount'), odsCount: $('#odsCount'),
  search: $('#searchInput'), filters: $('#filters'), refresh: $('#refreshButton'), notice: $('#notice'),
  source: $('#sourceLabel'), updated: $('#lastUpdate'), empty: $('#emptyState'), sidebar: $('#sidebar'),
  menu: $('#menuToggle'), backdrop: $('#backdrop'), dialog: $('#previewDialog'), frame: $('#previewFrame'),
  previewTitle: $('#previewTitle'), openPdf: $('#openPdfButton'), closePreview: $('#closePreview')
};

function apiUrl(path) {
  return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}?ref=${CONFIG.branch}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function loadMetadata() {
  try {
    const response = await fetch(`${CONFIG.metadataFile}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : (data.documenti || []);
  } catch { return []; }
}

function metadataFor(path, name) {
  const lowPath = decodeURIComponent(path).toLowerCase();
  return state.metadata.find(item => {
    const file = decodeURIComponent(item.file || '').toLowerCase();
    return file === lowPath || file.endsWith(`/${name.toLowerCase()}`);
  }) || {};
}

function titleFromFilename(name, type, number) {
  const base = name.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (type === 'ods') return `Ordine di servizio n. ${number || base}`;
  return base.replace(/\b\w/g, c => c.toUpperCase());
}

function parseItalianRange(name) {
  const numbers = name.match(/(\d{1,2})[-_](\d{1,2})(?:[-_](\d{2,4}))?/g);
  if (!numbers || numbers.length < 2) return {};
  const toIso = token => {
    const [d,m,yRaw] = token.split(/[-_]/).map(Number);
    const y = yRaw ? (yRaw < 100 ? 2000 + yRaw : yRaw) : 2026;
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  };
  return { inizio: toIso(numbers[0]), fine: toIso(numbers[1]) };
}

function fileToDocument(file, folder) {
  const name = file.name;
  const path = file.path || `${folder}/${name}`;
  const meta = metadataFor(path, name);
  const isOds = folder === 'ods';
  const isDraft = !isOds && /bozza/i.test(name);
  const numberMatch = name.match(/(?:n\.?\s*)?(\d{1,3})(?=-20\d{2}|\s*-\s*20\d{2})/i) || name.match(/ods[^0-9]*(\d{1,3})/i);
  const number = meta.numero ?? (numberMatch ? Number(numberMatch[1]) : null);
  const range = parseItalianRange(name);
  return {
    id: meta.id || file.sha || path,
    tipo: meta.tipo || (isOds ? 'ods' : isDraft ? 'bozza' : 'turno'),
    numero: number,
    titolo: meta.titolo || titleFromFilename(name, isOds ? 'ods' : isDraft ? 'bozza' : 'turno', number),
    file: file.download_url || encodeURI(path),
    path,
    data: meta.data || null,
    inizio: meta.inizio || range.inizio || null,
    fine: meta.fine || range.fine || null,
    descrizione: meta.descrizione || '',
    name
  };
}

async function scanGitHub() {
  const results = await Promise.all(CONFIG.folders.map(async folder => {
    const entries = await fetchJson(apiUrl(folder));
    if (!Array.isArray(entries)) return [];
    return entries.filter(file => file.type === 'file' && /\.pdf$/i.test(file.name)).map(file => fileToDocument(file, folder));
  }));
  return results.flat();
}

async function fallbackFromJson() {
  return state.metadata.map((item, index) => ({ id: item.id || `json-${index}`, ...item, path: item.file, name: (item.file || '').split('/').pop() }));
}

function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function parseDate(value) { if (!value) return null; const d = new Date(`${value}T12:00:00`); return isNaN(d) ? null : d; }
function formatDate(value) { const d=parseDate(value); return d ? new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d) : ''; }
function current(doc) { const now=new Date(); now.setHours(12,0,0,0); const a=parseDate(doc.inizio), b=parseDate(doc.fine); return doc.tipo==='turno' && a && b && now>=a && now<=b; }
function countLabel(n) { return `${n} document${n===1?'o':'i'}`; }
function docDate(doc) {
  if (doc.inizio && doc.fine) return `<b>Validità:</b> ${formatDate(doc.inizio)} – ${formatDate(doc.fine)}`;
  if (doc.data) return `Data di emissione: ${formatDate(doc.data)}`;
  return doc.tipo === 'ods' ? 'Documento presente nella cartella ODS' : 'Documento presente nella cartella turni';
}
function label(doc) {
  if (doc.tipo==='ods') return 'ORDINE DI SERVIZIO';
  if (doc.tipo==='bozza') return 'BOZZA · NON DEFINITIVA';
  return current(doc) ? 'TURNO · IN VIGORE' : 'TURNO · PUBBLICATO';
}
function card(doc) {
  const feature = doc.tipo==='bozza' ? ' featured-bozza' : current(doc) ? ' featured-turno' : '';
  const icon = doc.tipo==='ods' ? `<span class="doc-icon ods">${esc(doc.numero || '≡')}</span>` : `<span class="doc-icon">PDF</span>`;
  return `<article class="document${feature}" data-type="${doc.tipo}">
    ${icon}<div class="doc-copy"><small class="doc-label">${label(doc)}</small><strong>${esc(doc.titolo)}</strong><p>${docDate(doc)}</p></div>
    <a class="open-arrow" href="${esc(doc.file)}" target="_blank" rel="noopener" aria-label="Apri ${esc(doc.titolo)}">↗</a>
    <button class="preview-button" type="button" data-preview="${esc(doc.id)}">Anteprima</button>
  </article>`;
}
function score(doc) { return parseDate(doc.data || doc.inizio || doc.fine)?.getTime() || Number(doc.numero || 0); }
function visible(doc) {
  const filterOk = state.filter==='tutti' || doc.tipo===state.filter;
  const text=[doc.titolo,doc.name,doc.numero,doc.tipo,doc.data,doc.inizio,doc.fine].filter(Boolean).join(' ').toLowerCase();
  return filterOk && (!state.search || text.includes(state.search));
}
function render() {
  const docs=state.documents.filter(visible);
  const turni=docs.filter(d=>d.tipo!=='ods').sort((a,b)=>score(b)-score(a));
  const ods=docs.filter(d=>d.tipo==='ods').sort((a,b)=>(b.numero||0)-(a.numero||0) || score(b)-score(a));
  els.turniGrid.innerHTML=turni.map(card).join(''); els.odsGrid.innerHTML=ods.map(card).join('');
  els.turniCount.textContent=countLabel(turni.length); els.odsCount.textContent=countLabel(ods.length);
  document.querySelector('[data-section="turni"]').hidden=state.filter==='ods';
  document.querySelector('[data-section="ods"]').hidden=['turno','bozza'].includes(state.filter);
  els.empty.hidden=docs.length>0;
}
async function load() {
  els.refresh.disabled=true; els.updated.textContent='Aggiornamento…'; els.notice.hidden=true;
  state.metadata=await loadMetadata();
  try {
    state.documents=await scanGitHub();
    els.source.textContent='Cartelle GitHub in tempo reale';
    els.updated.textContent=`Aggiornato ${new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}`;
  } catch(error) {
    state.documents=await fallbackFromJson();
    els.source.textContent='Archivio JSON di riserva';
    els.updated.textContent='GitHub non raggiungibile';
    els.notice.hidden=false; els.notice.textContent=`Non riesco a leggere ora le cartelle GitHub (${error.message}). Mostro i documenti registrati in documenti.json.`;
  }
  render(); els.refresh.disabled=false;
}
function openPreview(id) {
  const doc=state.documents.find(d=>String(d.id)===String(id)); if(!doc)return;
  els.previewTitle.textContent=doc.titolo; els.frame.src=doc.file; els.openPdf.href=doc.file;
  if(typeof els.dialog.showModal==='function') els.dialog.showModal(); else window.open(doc.file,'_blank');
}
els.search.addEventListener('input',e=>{state.search=e.target.value.trim().toLowerCase();render();});
els.filters.addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;state.filter=b.dataset.filter;els.filters.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render();});
els.refresh.addEventListener('click',load);
document.addEventListener('click',e=>{const b=e.target.closest('[data-preview]');if(b)openPreview(b.dataset.preview);});
els.closePreview.addEventListener('click',()=>els.dialog.close());
els.dialog.addEventListener('click',e=>{if(e.target===els.dialog)els.dialog.close();});
function toggleMenu(show){els.sidebar.classList.toggle('open',show);els.backdrop.classList.toggle('show',show);}
els.menu.addEventListener('click',()=>toggleMenu(true));els.backdrop.addEventListener('click',()=>toggleMenu(false));
els.sidebar.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>toggleMenu(false)));
load();
