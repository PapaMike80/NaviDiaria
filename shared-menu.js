(function(){
  const sidebar=document.querySelector('.app-sidebar');if(!sidebar)return;
  const page=document.body.classList.contains('diaria-page')?'diaria':sidebar.id==='archive-sidebar'?'archive':'turni';
  const tabNames={turni:'NaviTurniTab',diaria:'NaviDiariaTab',archive:'NaviOdsTab'};
  window.name=tabNames[page];
  const tabForHref=href=>href.includes('naviturni')?tabNames.turni:href.includes('navidiaria')?tabNames.diaria:href.includes('turni.html')?tabNames.archive:'';
  const item=(href,icon,label,active=false,external=false,id='')=>`<a ${id?`id="${id}" `:''}class="nav-link${active?' active':''}" href="${href}"${external?` data-navi-tab="${tabForHref(href)}"`:''}${['competencyNav','adminNav','archiveAdminNav'].includes(id)?' hidden':''}><span>${icon}</span>${label}</a>`;
  let common='',specific='',user='',status='';
  if(page==='diaria'){
    common=item('naviturni.html','▦','NaviTurni',false,true)+item('#oggi','≈','NaviDiaria',true)+item('turni.html','▤','ODS / Turni',false,true);
    specific=`<span class="sidebar-menu-label">DIARIA</span>${item('#registro','≡','Registro mese')}${item('#consultivo','≈','Consultivo settimane')}${item('#competenze','◇','Competenze',false,false,'competencyNav')}${item('#adminPanel','♙','Gestione PIN',false,false,'adminNav')}`;
    user=`<div class="sidebar-user-actions"><button id="syncShifts" class="sidebar-footer-update" type="button"><span>↻</span>Aggiorna</button><small id="syncStatus" class="sidebar-data-status">Locale</small><strong id="sidebarAgentName" class="sidebar-agent-name">AGENTE</strong><button id="logoutButton" class="sidebar-action sidebar-exit" type="button" hidden>Esci</button><button id="pinSettingsButton" class="sidebar-action" type="button" hidden>Cambia PIN</button></div>`;
  }else if(page==='turni'){
    common=item('#turni-operativi','▦','NaviTurni',true)+item('navidiaria.html','≈','NaviDiaria',false,true)+item('turni.html','▤','ODS / Turni',false,true);
    specific=`<span class="sidebar-menu-label">TURNI</span><button id="togglePastBtn" class="nav-link sidebar-nav-button" onclick="togglePastColumns()" type="button"><span>◷</span>Mostra passato</button>`;
    user=`<div class="sidebar-user-actions login-user-panel" id="login-user-panel"><button id="refreshBtn" class="sidebar-footer-update" onclick="ricaricaDati()" type="button"><span>↻</span>Aggiorna</button><small id="turniMenuStatus" class="sidebar-data-status">Locale</small><button class="sidebar-agent-name login-user-name" id="login-user-name" type="button" onclick="repinLoggedAgent()"></button><button id="login-exit-button" class="sidebar-action sidebar-exit" type="button" onclick="logoutAgent()">Esci</button><button id="login-change-button" class="sidebar-action" type="button" onclick="location.href='navidiaria.html?pin=1'">Cambia PIN</button></div>`;
  }else{
    common=item('naviturni.html','▦','NaviTurni',false,true)+item('navidiaria.html','≈','NaviDiaria',false,true)+item('#turni-docs','▤','ODS / Turni',true);
    specific=`<span class="sidebar-menu-label">DOCUMENTI</span>${item('#turni-docs','▦','Turni e bozze')}${item('#ods-docs','≡','ODS 2026')}${item('#adminUploadPanel','＋','Carica documenti',false,false,'archiveAdminNav')}`;
    user=`<div class="sidebar-user-actions"><button class="sidebar-footer-update" type="button" onclick="renderArchiveDocuments()"><span>↻</span>Aggiorna</button><small id="archiveMenuStatus" class="sidebar-data-status">Locale</small><strong id="archiveSidebarAgent" class="sidebar-agent-name">AGENTE</strong><button id="archiveLogout" class="sidebar-action sidebar-exit" type="button">Esci</button><button id="archiveChangePin" class="sidebar-action" type="button">Cambia PIN</button></div>`;
  }
  const brandTitle=page==='diaria'?'NaviDiaria':page==='turni'?'NaviTurni':'NaviOds';
  sidebar.innerHTML=`<a class="shared-sidebar-brand" href="index.html"><span class="shared-brand-mark">N</span><strong>${brandTitle}</strong></a><nav>${common}${status}${specific}</nav>${user}`;
  sidebar.classList.add('menu-ready');
  sidebar.addEventListener('click',event=>{const link=event.target.closest('a[data-navi-tab]');if(!link)return;event.preventDefault();const target=window.open(link.href,link.dataset.naviTab);if(target)target.focus()});
  const toggle=document.createElement('button');toggle.className='sidebar-collapse-button';toggle.type='button';document.body.appendChild(toggle);
  function setCollapsed(value){document.body.classList.toggle('menu-collapsed',value);toggle.setAttribute('aria-expanded',String(!value));toggle.setAttribute('aria-label',value?'Mostra menu':'Nascondi menu');toggle.textContent=value?'›':'‹'}
  toggle.addEventListener('click',()=>setCollapsed(!document.body.classList.contains('menu-collapsed')));sidebar.querySelector('nav')?.addEventListener('click',event=>{if(window.innerWidth<=800&&event.target.closest('a'))setCollapsed(true)});setCollapsed(false);
})();
