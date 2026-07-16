const ARCHIVE_DB='navi.documentArchive.v1';
const ADMIN_AGENT_IDS=new Set(['92','MOVIMENTO']);
const activeArchiveAgent=JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null');
if(!activeArchiveAgent)location.replace('index.html');
const archiveAdmin=ADMIN_AGENT_IDS.has(String(activeArchiveAgent?.id));
const escapeArchive=value=>String(value||'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const archiveCredentials=()=>({agentId:String(activeArchiveAgent?.id||''),pinHash:localStorage.getItem(`navidiaria.pin.${activeArchiveAgent?.id}`)||''});

function openArchiveDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(ARCHIVE_DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('documents',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function localArchiveDocuments(){const db=await openArchiveDb();return new Promise((resolve,reject)=>{const request=db.transaction('documents').objectStore('documents').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function deleteLocalArchiveDocument(id){const db=await openArchiveDb();return new Promise((resolve,reject)=>{const request=db.transaction('documents','readwrite').objectStore('documents').delete(id);request.onsuccess=resolve;request.onerror=()=>reject(request.error)})}
const fileToBase64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)});

function documentCard(document){
  const type=document.type==='bozza'?'BOZZA · NON DEFINITIVA':document.type==='ods'?'ODS':'TURNO';
  const icon=document.type==='ods'?'ODS':'PDF',draft=document.type==='bozza'?' draft-document':'';
  return `<article class="document local-document${draft}" data-open-document="${escapeArchive(document.url)}" role="link" tabindex="0" aria-label="Apri ${escapeArchive(document.title)}"><span class="${document.type==='ods'?'ods-number':'pdf-icon'}">${icon}</span><div><small>${type} · CONDIVISO</small><strong>${escapeArchive(document.title)}</strong><p>${new Intl.DateTimeFormat('it-IT',{dateStyle:'medium'}).format(new Date(document.createdAt))}</p></div><b>↗</b>${archiveAdmin?`<button class="document-delete" type="button" data-delete-document="${escapeArchive(document.id)}">Elimina</button>`:''}</article>`;
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
  document.getElementById('uploadedOds').innerHTML=ods.map(documentCard).join('');
  const counts=document.querySelectorAll('.section-heading .count');
  if(counts[0])counts[0].textContent=`${2+turni.length} documenti`;
  if(counts[1])counts[1].textContent=`${10+ods.length} documenti`;
}

document.addEventListener('DOMContentLoaded',async()=>{
  const staticOds=document.getElementById('staticOds');
  [...staticOds.children].reverse().forEach(card=>staticOds.appendChild(card));
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
  const type=document.getElementById('documentType').value,title=file.name.trim().replace(/\s+/g,'_');
  button.disabled=true;message.textContent='Caricamento su Google Drive…';
  try{const base64=await fileToBase64(file);await NaviCloud.request('upload_document',{...archiveCredentials(),documentType:type,title,base64});event.target.reset();message.textContent=`${title} condiviso con tutti gli agenti.`;await renderArchiveDocuments()}catch(error){message.textContent=error.message}finally{button.disabled=false}
});

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-delete-document]');
  if(button){event.stopPropagation();if(!archiveAdmin||!confirm('Eliminare questo documento dall’archivio condiviso?'))return;button.disabled=true;try{await NaviCloud.request('delete_document',{...archiveCredentials(),documentId:button.dataset.deleteDocument});await renderArchiveDocuments()}catch(error){document.getElementById('uploadMessage').textContent=error.message;button.disabled=false}return}
  const card=event.target.closest('[data-open-document]');if(card)window.open(card.dataset.openDocument,'_blank','noopener');
});
document.addEventListener('keydown',event=>{const card=event.target.closest('[data-open-document]');if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();window.open(card.dataset.openDocument,'_blank','noopener')}});
