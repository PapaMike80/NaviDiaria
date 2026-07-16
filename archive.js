const ARCHIVE_DB='navi.documentArchive.v1';
const ADMIN_AGENT_IDS=new Set(['92','MOVIMENTO']);
const activeArchiveAgent=JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null');
if(!activeArchiveAgent)location.replace('index.html');
const archiveAdmin=ADMIN_AGENT_IDS.has(String(activeArchiveAgent?.id));
const staticOdsMarkup=[...document.getElementById('staticOds').children].reverse().map(card=>card.outerHTML).join('');
const escapeArchive=value=>String(value||'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const archiveCredentials=()=>({agentId:String(activeArchiveAgent?.id||''),pinHash:localStorage.getItem(`navidiaria.pin.${activeArchiveAgent?.id}`)||''});

function openArchiveDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(ARCHIVE_DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('documents',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function localArchiveDocuments(){const db=await openArchiveDb();return new Promise((resolve,reject)=>{const request=db.transaction('documents').objectStore('documents').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function deleteLocalArchiveDocument(id){const db=await openArchiveDb();return new Promise((resolve,reject)=>{const request=db.transaction('documents','readwrite').objectStore('documents').delete(id);request.onsuccess=resolve;request.onerror=()=>reject(request.error)})}
const fileToBase64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)});
const ARCHIVE_MONTHS=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
function shiftDocumentInfo(value,type){
  const match=String(value||'').match(/dal[^0-9]*(\d{1,2})[-/.](\d{1,2})(?:[-/.](20\d{2}))?[^0-9]*?(?:al|a)[^0-9]*(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/i);
  if(!match)return null;
  const prefix=type==='bozza'?'Bozza':'Turno',fromDay=Number(match[1]),fromMonth=ARCHIVE_MONTHS[Number(match[2])-1],toDay=Number(match[4]),toMonth=ARCHIVE_MONTHS[Number(match[5])-1],year=match[6];
  if(!fromMonth||!toMonth)return null;
  return {label:`${prefix} dal ${fromDay} ${fromMonth} al ${toDay} ${toMonth} ${year}`,fileName:`${prefix}_dal_${fromDay}_${fromMonth}_al_${toDay}_${toMonth}_${year}.pdf`,period:`${fromDay} ${fromMonth} – ${toDay} ${toMonth} ${year}`};
}

async function analyzeOdsPdf(file){
  if(!window.pdfjsLib)throw new Error('Analisi PDF non disponibile: ricarica la pagina e riprova.');
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,pages=[],structured=[];
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    const page=await pdf.getPage(pageNumber),content=await page.getTextContent(),lines={};
    content.items.forEach(item=>{const y=Math.round(item.transform[5]);(lines[y]||(lines[y]=[])).push({x:item.transform[4],s:item.str})});
    const text=Object.keys(lines).map(Number).sort((a,b)=>b-a).map(y=>lines[y].sort((a,b)=>a.x-b.x).map(value=>value.s).join(' ').replace(/ +/g,' ').trim()).filter(Boolean).join('\n');
    pages.push(text);
    if(text.toUpperCase().includes('TURNO NAVI'))structured.push({items:content.items.slice(0,5000).map(item=>({x:item.transform[4],y:item.transform[5],s:item.str}))});
  }
  const text=pages.join('\n').slice(0,250000),source=`${file.name}\n${text.slice(0,5000)}`;
  const match=source.match(/(?:O\.?D\.?S\.?|N\.?)[^0-9]{0,15}(\d{1,3})\s*[\/_-]\s*(20\d{2})/i)||source.match(/N\.?\s*(\d{1,3})[^0-9]{1,12}(20\d{2})/i);
  const dateMatch=source.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/);
  return {text,pages:structured,ods:match?`${match[1]}/${match[2]}`:file.name.replace(/\.pdf$/i,''),documentDate:dateMatch?`${dateMatch[1].padStart(2,'0')}/${dateMatch[2].padStart(2,'0')}/${dateMatch[3]}`:''};
}

function documentCard(document){
  const type=document.type==='bozza'?'BOZZA · NON DEFINITIVA':document.type==='ods'?'ODS':'TURNO';
  const icon=document.type==='ods'?'ODS':'PDF',draft=document.type==='bozza'?' draft-document':'';
  if(document.type==='ods'){
    const title=String(document.title||''),number=(title.match(/(?:o\.?d\.?s\.?|servizio|n)[^0-9]{0,12}(\d{1,3})/i)||title.match(/(\d{1,3})/))?.[1]||'—',dateMatch=title.match(/(\d{2})[-_.](\d{2})[-_.](20\d{2})/),emissionDate=dateMatch?`${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`:new Intl.DateTimeFormat('it-IT').format(new Date(document.createdAt));
    return `<article class="document local-document" data-open-document="${escapeArchive(document.url)}" role="link" tabindex="0" aria-label="Apri Ordine di servizio n. ${escapeArchive(number)}"><span class="ods-number">${escapeArchive(number)}</span><div><strong>Ordine di servizio n. ${escapeArchive(number)}</strong><p>Data di emissione: ${escapeArchive(emissionDate)}</p></div><b>↗</b>${archiveAdmin?`<button class="document-delete" type="button" data-delete-document="${escapeArchive(document.id)}">Elimina</button>`:''}</article>`;
  }
  const info=shiftDocumentInfo(document.title,document.type),displayTitle=info?.label||document.title,detail=info?`Validità: ${info.period}`:new Intl.DateTimeFormat('it-IT',{dateStyle:'medium'}).format(new Date(document.createdAt));
  return `<article class="document local-document${draft}" data-open-document="${escapeArchive(document.url)}" role="link" tabindex="0" aria-label="Apri ${escapeArchive(displayTitle)}"><span class="pdf-icon">${icon}</span><div><small>${type} · CONDIVISO</small><strong>${escapeArchive(displayTitle)}</strong><p>${escapeArchive(detail)}</p></div><b>↗</b>${archiveAdmin?`<button class="document-delete" type="button" data-delete-document="${escapeArchive(document.id)}">Elimina</button>`:''}</article>`;
}

async function sharedArchiveDocuments(){
  const result=await NaviCloud.request('list_documents',archiveCredentials());
  return (result.documents||[]).map(document=>({...document,createdAt:document.createdAt||new Date().toISOString()}));
}

async function migrateLocalDocuments(){
  if(!archiveAdmin)return;
  const documents=await localArchiveDocuments();
  for(const document of documents){
    if(!document.file)continue;
    const base64=await fileToBase64(document.file);
    await NaviCloud.request('upload_document',{...archiveCredentials(),documentType:document.type,title:document.title,base64});
    await deleteLocalArchiveDocument(document.id);
  }
}

async function renderArchiveDocuments(){
  const documents=await sharedArchiveDocuments();
  const turni=documents.filter(document=>document.type!=='ods').sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const ods=documents.filter(document=>document.type==='ods').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  document.getElementById('uploadedTurni').innerHTML=turni.map(documentCard).join('');
  document.getElementById('uploadedOds').innerHTML=ods.map(documentCard).join('')+staticOdsMarkup;
  document.getElementById('staticOds').hidden=true;
  const counts=document.querySelectorAll('.section-heading .count');
  if(counts[0])counts[0].textContent=`${2+turni.length} documenti`;
  if(counts[1])counts[1].textContent=`${10+ods.length} documenti`;
}

document.addEventListener('DOMContentLoaded',async()=>{
  document.getElementById('adminUploadPanel').hidden=!archiveAdmin;
  document.getElementById('archiveAdminNav').hidden=!archiveAdmin;
  document.getElementById('archiveSidebarAgent').textContent=String(activeArchiveAgent?.name||'Agente').trim().toLocaleUpperCase('it');
  try{await migrateLocalDocuments();await renderArchiveDocuments()}catch(error){document.getElementById('uploadMessage').textContent=error.message}
});

document.getElementById('archiveLogout').addEventListener('click',()=>{localStorage.removeItem('navidiaria.activeAgent');localStorage.removeItem('naviturni_logged_agent');location.href='index.html'});
document.getElementById('archiveChangePin').addEventListener('click',()=>{location.href='navidiaria.html?pin=1'});
document.getElementById('documentUploadForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!archiveAdmin)return;
  const file=document.getElementById('documentFile').files[0],message=document.getElementById('uploadMessage'),button=event.submitter;
  if(!file||(!file.name.toLowerCase().endsWith('.pdf')&&file.type!=='application/pdf')){message.textContent='Seleziona un file PDF valido.';return}
  if(file.size>10*1024*1024){message.textContent='Il PDF non può superare 10 MB.';return}
  const type=document.getElementById('documentType').value;let title=file.name.trim().replace(/\*/g,'').replace(/\s+/g,'_');const shiftInfo=type==='ods'?null:shiftDocumentInfo(title,type);if(shiftInfo)title=shiftInfo.fileName;
  button.disabled=true;message.textContent=type==='ods'?'Analisi di variazioni e turni nave…':'Caricamento su Google Drive…';
  try{
    const analysis=type==='ods'?await analyzeOdsPdf(file):null;
    if(analysis){const number=String(analysis.ods||'').match(/\d+/)?.[0],date=(analysis.documentDate||new Intl.DateTimeFormat('it-IT').format(new Date())).replace(/\//g,'-');if(number)title=`Ordine_di_servizio_n._${number}_-_${date}.pdf`}
    message.textContent='Caricamento su Google Drive…';
    const base64=await fileToBase64(file),result=await NaviCloud.request('upload_document',{...archiveCredentials(),documentType:type,title,base64,analysis});
    event.target.reset();
    const imported=result.imported;
    message.textContent=imported
      ?`${title} condiviso. Variazioni: ${imported.variazioni.inserite} inserite, ${imported.variazioni.duplicate} già presenti. Turni nave: ${imported.navi.inserite} inseriti, ${imported.navi.aggiornate} aggiornati, ${imported.navi.duplicate} invariati.`
      :`${title} condiviso con tutti gli agenti.${result.analysisError?` Analisi non completata: ${result.analysisError}`:''}`;
    await renderArchiveDocuments();
  }catch(error){message.textContent=error.message}finally{button.disabled=false}
});

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-delete-document]');
  if(button){event.stopPropagation();if(!archiveAdmin||!confirm('Eliminare questo documento dall’archivio condiviso?'))return;button.disabled=true;try{await NaviCloud.request('delete_document',{...archiveCredentials(),documentId:button.dataset.deleteDocument});await renderArchiveDocuments()}catch(error){document.getElementById('uploadMessage').textContent=error.message;button.disabled=false}return}
  const card=event.target.closest('[data-open-document]');if(card)window.open(card.dataset.openDocument,'_blank','noopener');
});
document.addEventListener('keydown',event=>{const card=event.target.closest('[data-open-document]');if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();window.open(card.dataset.openDocument,'_blank','noopener')}});
