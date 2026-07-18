(function(){
  const APP_VERSION='v1.04';
  const sidebar=document.querySelector('.app-sidebar');if(!sidebar)return;
  const page=document.body.classList.contains('trova-turno-page')?'trova':document.body.classList.contains('diaria-page')?'diaria':sidebar.id==='archive-sidebar'?'archive':'turni';
  const tabNames={turni:'NaviTurniTab',trova:'NaviTrovaTurnoTab',diaria:'NaviDiariaTab',archive:'NaviDocumentiTab'};
  let sessionAgent=null;try{sessionAgent=JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null')}catch{}
  const isAdminAgent=agent=>['92','MOVIMENTO'].includes(String(agent?.id||''))||String(agent?.role||'').toLowerCase()==='admin';
  const isBaristaAgent=agent=>String(agent?.role||'').toLowerCase()==='barista'||String(agent?.qualifica||'').toLowerCase()==='barista';
  window.name=tabNames[page];
  const tabForHref=href=>href.includes('cambi_turno')?tabNames.trova:href.includes('naviturni')?tabNames.turni:href.includes('navidiaria')?tabNames.diaria:href.includes('documenti.html')?tabNames.archive:'';
  const item=(href,icon,label,active=false,external=false,id='')=>`<a ${id?`id="${id}" `:''}class="nav-link${active?' active':''}" href="${href}"${external?` data-navi-tab="${tabForHref(href)}"`:''}${['competencyNav','adminNav','archiveAdminNav'].includes(id)?' hidden':''}><span>${icon}</span>${label}</a>`;
  let common='',specific='',user='',status='<div id="odsVariationStatus" class="ods-variation-status" hidden></div>';

  if(page==='diaria'){
    common=item('naviturni.html','▦','NaviTurni',false,true)+item('cambi_turno.html','⇄','Trova turno',false,true,'trovaTurnoNavLink')+item('#oggi','≈','NaviDiaria',true,false,'diariaNavLink')+item('documenti.html','▤','Documenti',false,true,'archiveNavLink');
    specific=`<span class="sidebar-menu-label">DIARIA</span>${item('#registro','≡','Registro mese')}${item('#consultivo','≈','Consultivo settimane')}${item('#competenze','◇','Competenze',false,false,'competencyNav')}${item('#adminPanel','♙','Gestione PIN',false,false,'adminNav')}`;
    user=`<div class="sidebar-user-actions"><button id="syncShifts" class="sidebar-footer-update" type="button"><span>↻</span>Aggiorna</button><small id="syncStatus" class="sidebar-data-status">Locale</small><strong id="sidebarAgentName" class="sidebar-agent-name">AGENTE</strong><button id="logoutButton" class="sidebar-action sidebar-exit" type="button" hidden>Esci</button><button id="pinSettingsButton" class="sidebar-action" type="button" hidden>Cambia PIN</button></div>`;
  }else if(page==='trova'){
    common=item('naviturni.html','▦','NaviTurni',false,true)+item('#turni-operativi','⇄','Trova turno',true)+item('navidiaria.html','≈','NaviDiaria',false,true,'diariaNavLink')+item('documenti.html','▤','Documenti',false,true,'archiveNavLink');
    // Elementi tecnici richiesti dal codice di NaviTurni: restano nel DOM ma non sono visibili.
    specific=`<div hidden aria-hidden="true"><button id="togglePastBtn" type="button"></button><div id="shift-filter-container"><div id="top-residence-buttons"></div><div id="shift-buttons-wrapper"></div></div></div>`;
    user=`<div class="sidebar-user-actions login-user-panel" id="login-user-panel"><button id="refreshBtn" class="sidebar-footer-update" onclick="ricaricaDati()" type="button"><span>↻</span>Aggiorna</button><small id="turniMenuStatus" class="sidebar-data-status">Locale</small><button class="sidebar-agent-name login-user-name" id="login-user-name" type="button" onclick="repinLoggedAgent()"></button><button id="login-exit-button" class="sidebar-action sidebar-exit" type="button" onclick="logoutAgent()">Esci</button><button id="login-change-button" class="sidebar-action" type="button" onclick="location.href='navidiaria.html?pin=1'">Cambia PIN</button></div>`;
  }else if(page==='turni'){
    common=item('#turni-operativi','▦','NaviTurni',true)+item('cambi_turno.html','⇄','Trova turno',false,true,'trovaTurnoNavLink')+item('navidiaria.html','≈','NaviDiaria',false,true,'diariaNavLink')+item('documenti.html','▤','Documenti',false,true,'archiveNavLink');
    specific=`<span class="sidebar-menu-label">TURNI</span><button id="togglePastBtn" class="nav-link sidebar-nav-button" onclick="togglePastColumns()" type="button"><span>◷</span>Mostra passato</button><div class="shifts-filter-block" id="shift-filter-container"><div class="top-filter-controls"><div class="top-residence-controls"><span class="filter-label">Residenze</span><div class="coverage-residence-buttons" id="top-residence-buttons"></div></div><div class="top-filter-group"><span class="filter-label">Corse</span><div class="shift-buttons-grid" id="shift-buttons-wrapper"></div></div></div></div>`;
    user=`<div class="sidebar-user-actions login-user-panel" id="login-user-panel"><button id="refreshBtn" class="sidebar-footer-update" onclick="ricaricaDati()" type="button"><span>↻</span>Aggiorna</button><small id="turniMenuStatus" class="sidebar-data-status">Locale</small><button class="sidebar-agent-name login-user-name" id="login-user-name" type="button" onclick="repinLoggedAgent()"></button><button id="login-exit-button" class="sidebar-action sidebar-exit" type="button" onclick="logoutAgent()">Esci</button><button id="login-change-button" class="sidebar-action" type="button" onclick="location.href='navidiaria.html?pin=1'">Cambia PIN</button></div>`;
  }else{
    common=item('naviturni.html','▦','NaviTurni',false,true)+item('navidiaria.html','≈','NaviDiaria',false,true,'diariaNavLink')+item('#turni-docs','▤','Documenti',true,false,'archiveNavLink');
    specific=`<span class="sidebar-menu-label">DOCUMENTI</span>${item('#turni-docs','▦','Turni e bozze')}${item('#ods-docs','≡','ODS 2026')}${item('#adminUploadPanel','＋','Carica documenti',false,false,'archiveAdminNav')}`;
    user=`<div class="sidebar-user-actions"><button class="sidebar-footer-update" type="button" onclick="typeof loadDocuments==='function'?loadDocuments():location.reload()"><span>↻</span>Aggiorna</button><small id="archiveMenuStatus" class="sidebar-data-status">Locale</small><strong id="archiveSidebarAgent" class="sidebar-agent-name">AGENTE</strong><button id="archiveLogout" class="sidebar-action sidebar-exit" type="button">Esci</button><button id="archiveChangePin" class="sidebar-action" type="button">Cambia PIN</button></div>`;
  }

  const brandTitle=page==='diaria'?'NaviDiaria':page==='trova'?'Trova turno':page==='turni'?'NaviTurni':'Documenti';
  const version=`<div class="shared-app-version" aria-label="Versione applicazione">Versione ${APP_VERSION}</div>`;

  sidebar.innerHTML=`<a class="shared-sidebar-brand" href="index.html"><span class="shared-brand-mark">N</span><strong>${brandTitle}</strong></a><nav>${common}${specific}</nav>${user}${status}${version}`;

  const versionEl=sidebar.querySelector('.shared-app-version');
  if(versionEl){
    versionEl.style.cssText='margin:10px 12px 8px;padding-top:10px;border-top:1px solid rgba(124,173,189,.18);color:#19e3c1;font-size:11px;font-weight:700;letter-spacing:.04em;text-align:center';
  }

  const odsStatusEl=sidebar.querySelector('#odsVariationStatus');
  if(odsStatusEl){
    odsStatusEl.style.cssText='margin:8px 12px 2px;color:#19e3c1;font-size:11px;font-weight:700;letter-spacing:.04em;text-align:center;white-space:nowrap;background:none;border:none;padding:0';
  }


  function installFilterBubbleStyle(){
    if(document.getElementById('navi-filter-bubbles-style')) return;

    const style=document.createElement('style');
    style.id='navi-filter-bubbles-style';
    style.textContent=`
      .app-sidebar .top-filter-controls,
      .app-sidebar .top-residence-controls,
      .app-sidebar .top-filter-group{
        display:flex!important;
        flex-direction:column!important;
        align-items:center!important;
        justify-content:center!important;
        width:100%!important;
        text-align:center!important;
      }

      .app-sidebar .filter-label{
        display:block!important;
        width:100%!important;
        margin:5px 0 8px!important;
        color:#86a5af!important;
        font-size:9px!important;
        font-weight:900!important;
        letter-spacing:.14em!important;
        text-align:center!important;
      }

      .app-sidebar #top-residence-buttons,
      .app-sidebar #coverage-residence-buttons{
        display:grid!important;
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
        align-items:center!important;
        justify-content:center!important;
        gap:7px!important;
        width:100%!important;
      }

      .app-sidebar #shift-buttons-wrapper,
      .app-sidebar #coverage-shift-buttons{
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        align-items:center!important;
        justify-content:center!important;
        gap:7px!important;
        width:100%!important;
      }

      .app-sidebar #top-residence-buttons button,
      .app-sidebar #shift-buttons-wrapper button,
      .app-sidebar #coverage-residence-buttons button,
      .app-sidebar #coverage-shift-buttons button{
        --bubble-color:#2dd4bf;
        --bubble-bg:rgba(45,212,191,.11);
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        width:100%!important;
        min-width:0!important;
        min-height:30px!important;
        margin:0!important;
        padding:6px 11px!important;
        border:1px solid color-mix(in srgb,var(--bubble-color) 52%,transparent)!important;
        border-radius:999px!important;
        background:var(--bubble-bg)!important;
        color:var(--bubble-color)!important;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)!important;
        font:800 10px/1 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
        letter-spacing:.03em!important;
        text-transform:uppercase!important;
        cursor:pointer!important;
        transition:transform .15s ease,box-shadow .15s ease,background .15s ease!important;
      }

      .app-sidebar #top-residence-buttons button:hover,
      .app-sidebar #shift-buttons-wrapper button:hover,
      .app-sidebar #coverage-residence-buttons button:hover,
      .app-sidebar #coverage-shift-buttons button:hover{
        transform:translateY(-1px)!important;
        box-shadow:0 5px 13px color-mix(in srgb,var(--bubble-color) 18%,transparent)!important;
      }

      .app-sidebar #top-residence-buttons button.active,
      .app-sidebar #shift-buttons-wrapper button.active,
      .app-sidebar #coverage-residence-buttons button.active,
      .app-sidebar #coverage-shift-buttons button.active{
        background:var(--bubble-color)!important;
        border-color:var(--bubble-color)!important;
        color:#06171d!important;
        box-shadow:0 0 0 2px color-mix(in srgb,var(--bubble-color) 22%,transparent),
                   0 5px 15px color-mix(in srgb,var(--bubble-color) 25%,transparent)!important;
      }

      .app-sidebar .shifts-filter-block{
        align-items:center!important;
        justify-content:center!important;
        width:100%!important;
        padding:11px 8px!important;
        border:1px solid rgba(66,105,116,.38)!important;
        border-radius:13px!important;
        background:rgba(10,35,45,.56)!important;
        text-align:center!important;
      }
    `;
    document.head.appendChild(style);

    const residenceColors={
      DESENZANO:['#22d3ee','rgba(34,211,238,.12)'],
      MADERNO:['#fb923c','rgba(251,146,60,.12)'],
      RIVA:['#c084fc','rgba(192,132,252,.12)'],
      PESCHIERA:['#4ade80','rgba(74,222,128,.12)']
    };

    const shiftColors={
      D1:['#5b8cff','rgba(91,140,255,.13)'],
      R1:['#5b8cff','rgba(91,140,255,.13)'],
      P1:['#5b8cff','rgba(91,140,255,.13)'],
      T1:['#5b8cff','rgba(91,140,255,.13)'],

      D2:['#46c98a','rgba(70,201,138,.13)'],
      R2:['#46c98a','rgba(70,201,138,.13)'],
      P2:['#46c98a','rgba(70,201,138,.13)'],
      T2:['#46c98a','rgba(70,201,138,.13)'],

      D3:['#f59a52','rgba(245,154,82,.13)'],
      R3:['#f59a52','rgba(245,154,82,.13)'],
      P3:['#f59a52','rgba(245,154,82,.13)'],
      M1:['#f59a52','rgba(245,154,82,.13)'],

      D4:['#dc74d2','rgba(220,116,210,.13)'],
      R4:['#dc74d2','rgba(220,116,210,.13)'],
      P4:['#dc74d2','rgba(220,116,210,.13)'],

      BIS:['#67d7e6','rgba(103,215,230,.13)'],
      DT:['#f4df57','rgba(244,223,87,.12)'],
      POND:['#fb9292','rgba(251,146,146,.13)'],
      PONM:['#fb9292','rgba(251,146,146,.13)'],
      AGB:['#6eb1ff','rgba(110,177,255,.13)'],
      AGM:['#6eb1ff','rgba(110,177,255,.13)'],
      AGT:['#6eb1ff','rgba(110,177,255,.13)'],
      CAR:['#f973a8','rgba(249,115,168,.13)'],
      CAP:['#f973a8','rgba(249,115,168,.13)'],
      SR1:['#a78bfa','rgba(167,139,250,.13)'],
      TERRA:['#94a3b8','rgba(148,163,184,.13)']
    };

    function paintButton(button,type){
      const raw=(button.dataset.res||button.dataset.shift||button.textContent||'')
        .trim().toUpperCase().replace(/\s+/g,'');
      const palette=type==='residence'
        ? residenceColors[raw]
        : shiftColors[raw] || ['#94a3b8','rgba(148,163,184,.13)'];
      button.style.setProperty('--bubble-color',palette[0]);
      button.style.setProperty('--bubble-bg',palette[1]);
    }

    function refreshFilterBubbleColors(){
      document.querySelectorAll(
        '#top-residence-buttons button,#coverage-residence-buttons button'
      ).forEach(button=>paintButton(button,'residence'));

      document.querySelectorAll(
        '#shift-buttons-wrapper button,#coverage-shift-buttons button'
      ).forEach(button=>paintButton(button,'shift'));
    }

    refreshFilterBubbleColors();

    const observer=new MutationObserver(refreshFilterBubbleColors);
    [
      'top-residence-buttons',
      'shift-buttons-wrapper',
      'coverage-residence-buttons',
      'coverage-shift-buttons'
    ].forEach(id=>{
      const node=document.getElementById(id);
      if(node) observer.observe(node,{childList:true,subtree:true});
    });

    window.refreshFilterBubbleColors=refreshFilterBubbleColors;
    setTimeout(refreshFilterBubbleColors,250);
    setTimeout(refreshFilterBubbleColors,1000);
  }

  installFilterBubbleStyle();

  const diariaNavLink=sidebar.querySelector('#diariaNavLink');if(diariaNavLink)diariaNavLink.hidden=!isAdminAgent(sessionAgent);
  const archiveNavLink=sidebar.querySelector('#archiveNavLink');if(archiveNavLink)archiveNavLink.hidden=isBaristaAgent(sessionAgent);
  sidebar.classList.add('menu-ready');

  sidebar.addEventListener('click',event=>{
    const link=event.target.closest('a[data-navi-tab]');
    if(!link)return;
    event.preventDefault();
    const target=window.open(link.href,link.dataset.naviTab);
    if(target)target.focus();
  });

  const toggle=document.createElement('button');
  toggle.className='sidebar-collapse-button';
  toggle.type='button';
  document.body.appendChild(toggle);

  function setCollapsed(value){
    document.body.classList.toggle('menu-collapsed',value);
    toggle.setAttribute('aria-expanded',String(!value));
    toggle.setAttribute('aria-label',value?'Mostra menu':'Nascondi menu');
    toggle.textContent=value?'›':'‹';
  }

  toggle.addEventListener('click',()=>setCollapsed(!document.body.classList.contains('menu-collapsed')));
  sidebar.querySelector('nav')?.addEventListener('click',event=>{
    if(window.innerWidth<=800&&event.target.closest('a'))setCollapsed(true);
  });
  setCollapsed(true);

  async function refreshOdsVariationStatus(){
    const target=document.getElementById('odsVariationStatus');if(!target||!window.NaviCloud)return;
    let agent=null;try{agent=JSON.parse(localStorage.getItem('navidiaria.activeAgent')||localStorage.getItem('naviturni_logged_agent')||'null')}catch{}
    const agentId=String(agent?.id||'');
    const pinHash=localStorage.getItem(`navidiaria.pin.${agentId}`)||'';
    if(!agentId||!pinHash){target.hidden=true;return}
    try{
      const result=await NaviCloud.request('variation_status',{agentId,pinHash}),info=result.variationStatus;
      if(!info||Number(info.count)<=1){target.hidden=true;return}
      target.textContent=`ODS nr. ${info.number}`;
      target.hidden=false;
    }catch{
      target.hidden=true;
    }
  }

  window.refreshOdsVariationStatus=refreshOdsVariationStatus;
  window.addEventListener('DOMContentLoaded',refreshOdsVariationStatus);
})();