const hm=(hours,minutes=0)=>hours+minutes/60;
const DEFAULT_SHIFTS=[
  {code:'D1',hours:hm(13),allowance:true,allowanceRate:24,meal:true},{code:'D2',hours:hm(11,25),allowance:true,allowanceRate:24,meal:true},
  {code:'D3',hours:hm(13,20),allowance:true,allowanceRate:24,meal:true},{code:'D4',hours:hm(13,15),allowance:true,allowanceRate:24,meal:true},
  {code:'T1',hours:hm(13,35),allowance:true,allowanceRate:24,meal:true},{code:'T2',hours:hm(12,29),allowance:true,allowanceRate:24,meal:true},
  {code:'M1',hours:hm(13,30),allowance:true,allowanceRate:24,meal:true},{code:'R1',hours:hm(13,15),allowance:true,allowanceRate:24,meal:true},
  {code:'R2',hours:hm(13,15),allowance:true,allowanceRate:24,meal:true},{code:'R3',hours:hm(12,20),allowance:true,allowanceRate:24,meal:true},
  {code:'R4',hours:hm(12,40),allowance:true,allowanceRate:24,meal:true},{code:'CAR1',hours:hm(12,10),allowance:true,allowanceRate:24,meal:true},
  {code:'P1',hours:hm(12,45),allowance:true,allowanceRate:24,meal:true},{code:'P2',hours:hm(13,5),allowance:true,allowanceRate:24,meal:true},
  {code:'P3',hours:hm(12,55),allowance:true,allowanceRate:24,meal:true},{code:'CAP1',hours:hm(12,55),allowance:true,allowanceRate:24,meal:true},
  {code:'CAP',hours:hm(12,55),allowance:true,allowanceRate:24,meal:true},{code:'SR1',hours:hm(12,15),allowance:true,allowanceRate:24,meal:true},
  {code:'IE',hours:0,allowance:false,allowanceRate:24,meal:true},{code:'BIS',hours:hm(12,15),allowance:true,allowanceRate:24,meal:true},
  {code:'AgB',hours:hm(10,25),allowance:false,allowanceRate:24,meal:false},{code:'PonD',hours:hm(9,25),allowance:false,allowanceRate:24,meal:false},
  {code:'DT',hours:hm(9,25),allowance:false,allowanceRate:24,meal:false},{code:'PT',hours:hm(9,30),allowance:false,allowanceRate:24,meal:false},
  {code:'AgM',hours:hm(9,45),allowance:false,allowanceRate:24,meal:false},{code:'AgT',hours:hm(11,10),allowance:false,allowanceRate:24,meal:false},
  {code:'PonM',hours:hm(10,25),allowance:false,allowanceRate:24,meal:false},{code:'LD',hours:hm(8),allowance:false,allowanceRate:24,meal:false},
  {code:'Malattia',hours:0,allowance:false,allowanceRate:24,meal:false},{code:'Riposo',hours:0,allowance:false,allowanceRate:24,meal:false}
];
const SESSION_KEY='navidiaria.activeAgent';
const ADMIN_AGENT_ID='92';
let activeAgent=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
let STORAGE=`navidiaria.entries.v1.${activeAgent?.id||'guest'}`;
const SHIFTS_STORAGE='navidiaria.shifts.v1';
const COMPETENCE_VERSION='durata-corse-2026-07-11';
let SHIFTS=localStorage.getItem('navidiaria.competenceVersion')===COMPETENCE_VERSION?JSON.parse(localStorage.getItem(SHIFTS_STORAGE)||'null'):null;
if(!SHIFTS){SHIFTS=DEFAULT_SHIFTS.map(s=>({...s}));localStorage.setItem(SHIFTS_STORAGE,JSON.stringify(SHIFTS));localStorage.setItem('navidiaria.competenceVersion',COMPETENCE_VERSION)}
DEFAULT_SHIFTS.forEach(defaultShift=>{if(!SHIFTS.some(s=>s.code===defaultShift.code))SHIFTS.push({...defaultShift})});
SHIFTS.forEach(s=>{if(Number(s.allowanceRate)===25)s.allowanceRate=24;if(![0,9,12,24].includes(Number(s.allowanceRate)))s.allowanceRate=24});
const GROUND_SHIFTS=new Set(['AGB','POND','DT','PT','AGM','AGT','PONM','LD','MALATTIA','RIPOSO']);
SHIFTS.forEach(s=>{if(s.embark===undefined)s.embark=!GROUND_SHIFTS.has(String(s.code).toUpperCase())});
const TURNS_URL='https://script.google.com/macros/s/AKfycbw38IoMZJ50bun_AL-KjQ7jG4UbMPRKxjr22TXrzpZ_pIM2s9ZqOR0LYFXgC007Yc0PpQ/exec';
const ODS_VARIATIONS_URL='https://docs.google.com/spreadsheets/d/16NZO-WxXVx5YlEbX2xsYx8wCcV1qazytw1ww2seFXr8/gviz/tq';
const fmt=new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',weekday:'short'});
let entries=JSON.parse(localStorage.getItem(STORAGE)||'[]');
const MEAL_DEFAULT_VERSION='used-by-default-v1';
const mealVersionKey=`navidiaria.mealDefaultVersion.${activeAgent?.id||'guest'}`;const migrateMeals=localStorage.getItem(mealVersionKey)!==MEAL_DEFAULT_VERSION;
entries.forEach(e=>{const s=SHIFTS.find(x=>x.code===e.shift);if(migrateMeals&&s?.meal)e.mealUsed=true;else if(e.mealUsed===undefined)e.mealUsed=!!s?.meal;if(Number(e.allowanceRate)===25)e.allowanceRate=24;if(e.allowanceRate===undefined)e.allowanceRate=s?.allowance?s.allowanceRate:null});
if(migrateMeals){localStorage.setItem(mealVersionKey,MEAL_DEFAULT_VERSION);localStorage.setItem(STORAGE,JSON.stringify(entries))}
const EMBARK_VERSION='competence-based-v1',embarkVersionKey=`navidiaria.embarkVersion.${activeAgent?.id||'guest'}`;if(localStorage.getItem(embarkVersionKey)!==EMBARK_VERSION){entries.forEach(e=>{if(e.imported)e.embark=!!shiftFor(e.shift).embark});localStorage.setItem(embarkVersionKey,EMBARK_VERSION);localStorage.setItem(STORAGE,JSON.stringify(entries))}
let editingId=null;
let agentsDirectory=[];
let odsVariations=null;
const $=id=>document.getElementById(id);

function minutesToText(value){const sign=value<0?'-':'';const m=Math.abs(Math.round(value));return `${sign}${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`}
function dataPill(value,className=''){return `<span class="data-pill ${className}">${value}</span>`}
function bpSummary(used,credit){const parts=[];if(used)parts.push(`${used} USATI`);if(credit)parts.push(`${credit} DA ACCREDITARE`);return parts.join(' · ')||'—'}
function shiftFor(code){return SHIFTS.find(s=>s.code===code)||SHIFTS.at(-1)}
function refuelCredit(entry){return entry.refuel?(String(entry.shift).toUpperCase()==='DT'?60:30):0}
function isoWeek(dateString){const d=new Date(`${dateString}T12:00:00`);d.setDate(d.getDate()+4-(d.getDay()||7));const y=new Date(d.getFullYear(),0,1);return `${d.getFullYear()}-${Math.ceil((((d-y)/86400000)+1)/7)}`}
function weekInfo(dateString){const d=new Date(`${dateString}T12:00:00`),day=d.getDay()||7;d.setDate(d.getDate()-day+1);const start=new Date(d),end=new Date(d);end.setDate(end.getDate()+6);const short=date=>new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short'}).format(date);const payment=new Date(end.getFullYear(),end.getMonth()+1,1);return {start,end,label:`${short(start)} – ${short(end)}`,paymentLabel:new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(payment)}}
function lastSundayOfMonth(year,monthIndex){const last=new Date(year,monthIndex+1,0,12);last.setDate(last.getDate()-last.getDay());return last}
function currentMonth(){return $('monthFilter').value}
function filtered(){return entries.filter(e=>e.date.startsWith(currentMonth())).sort((a,b)=>a.date.localeCompare(b.date))}
function previousMonthCarryEntries(){const monthStart=`${currentMonth()}-01`,weekKey=isoWeek(monthStart);return entries.filter(e=>e.date<monthStart&&isoWeek(e.date)===weekKey).sort((a,b)=>a.date.localeCompare(b.date))}
function todayIso(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function shiftClass(code){return `shift-${String(code||'other').toLowerCase().replace(/[^a-z0-9]+/g,'')}`}
const GRADE_INFO={
  'capitano':{label:'Capitano',className:'grade-capitano'},'comandante':{label:'Capitano',className:'grade-capitano'},
  'capo timoniere':{label:'Capo Timoniere',className:'grade-capo'},'capotimoniere':{label:'Capo Timoniere',className:'grade-capo'},
  'timoniere':{label:'Timoniere',className:'grade-timoniere'},'aiuto motorista':{label:'Aiuto Motorista',className:'grade-aiuto'},
  'aiutomotorista':{label:'Aiuto Motorista',className:'grade-aiuto'},'motorista':{label:'Motorista',className:'grade-motorista'},
  'marinaio':{label:'Marinaio',className:'grade-marinaio'},'operaio':{label:'Operaio',className:'grade-operaio'}
};
function formatAgentName(name){return String(name||'').trim().split(/\s+/).map(part=>/^[A-ZÀ-ÖØ-Ý]+[.,]?$/.test(part)&&part.replace(/[.,]/g,'').length>1?part.charAt(0)+part.slice(1).toLowerCase():part).join(' ')}
function updateWelcome(){if(!activeAgent)return;const grade=GRADE_INFO[String(activeAgent.qualifica||'marinaio').trim().toLowerCase()]||GRADE_INFO.marinaio;$('welcomeName').innerHTML=`Buon giorno <span class="grade-label ${grade.className}">${grade.label}</span> ${escapeHtml(formatAgentName(activeAgent.name))}`}
function normalizeScheduleShift(raw){return /^rip$/i.test(raw)?'Riposo':/^mal/i.test(raw)?'Malattia':raw}
function loadOdsVariations(){
  if(String(activeAgent?.id)!==ADMIN_AGENT_ID)return Promise.resolve(new Map());
  if(odsVariations)return Promise.resolve(odsVariations);
  return new Promise((resolve,reject)=>{const callback=`navidiariaOds${Date.now()}`,script=document.createElement('script'),timer=setTimeout(()=>finish(new Error('Variazioni ODS non raggiungibili')),12000);const finish=(error,data)=>{clearTimeout(timer);delete window[callback];script.remove();if(error)reject(error);else resolve(data)};window[callback]=response=>{if(response?.status==='error'){finish(new Error('Variazioni ODS non disponibili'));return}const variations=new Map(),year=new Date().getFullYear();(response?.table?.rows||[]).forEach(row=>{const dateText=String(row.c?.[0]?.f??row.c?.[0]?.v??''),match=dateText.match(/^(\d{2})\/(\d{2})/),raw=row.c?.[1]?.f??row.c?.[1]?.v;if(!match||raw===null||raw===undefined||String(raw).trim()==='')return;const date=`${year}-${match[2]}-${match[1]}`,shift=/^0(?:[.,]0+)?$/.test(String(raw).trim())?'Riposo':normalizeScheduleShift(String(raw).trim());variations.set(date,shift)});odsVariations=variations;finish(null,variations)};script.onerror=()=>finish(new Error('Variazioni ODS non raggiungibili'));script.src=`${ODS_VARIATIONS_URL}?sheet=variazioni_ods&tqx=responseHandler:${callback}&t=${Date.now()}`;document.head.appendChild(script)})
}
async function getScheduledShift(date){const [response,variations]=await Promise.all([fetch(`${TURNS_URL}?t=${Date.now()}`),loadOdsVariations().catch(()=>new Map())]);if(!response.ok)throw new Error('NaviTurni non raggiungibile');const data=await response.json();let agent=null;Object.values(data.residenze||{}).some(list=>{agent=(list||[]).find(a=>String(a.id)===String(activeAgent?.id));return !!agent});const raw=variations.get(date)??agent?.turni?.[date];if(!raw)throw new Error('Nessun turno assegnato per questa data');return normalizeScheduleShift(raw)}
async function restoreFormFromSchedule(){const button=$('restoreFromShift');button.disabled=true;try{const shift=await getScheduledShift($('entryDate').value);$('entryShift').value=shift;applyCompetenceDefaults();notify(`Ripristinato il turno ${shift}`)}catch(error){notify(error.message)}finally{button.disabled=false}}
function isAdmin(){return String(activeAgent?.id||'')===ADMIN_AGENT_ID}
function renderTodaySummary(){
  const entry=entries.find(e=>e.date===todayIso());
  const dateLabel=new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(todayIso()+'T12:00:00')).replace(/^./,c=>c.toUpperCase());
  if(!entry){$('todaySummary').innerHTML=`<div class="today-date"><span>OGGI</span><strong>${dateLabel}</strong></div><div class="today-empty"><span>Nessun turno registrato</span></div>`;return}
  const shift=shiftFor(entry.shift);
  $('todaySummary').innerHTML=`<div class="today-date"><span>OGGI</span>${entry.variationFrom?`<em class="variation-badge" title="${escapeHtml(entry.variationFrom)} → ${escapeHtml(entry.variationTo||entry.shift)}">VAR.</em>`:''}<strong>${dateLabel}</strong></div><div class="today-inline-form">
    <label>Corsa<select id="todayShift">${SHIFTS.map(s=>`<option value="${s.code}" ${s.code===entry.shift?'selected':''}>${s.code}</option>`).join('')}</select></label>
    <label>Ore<strong id="todayHours" class="inline-value">${minutesToText(shift.hours*60)}</strong></label>
    <label>Straordinario (min)<input id="todayDelay" type="number" min="0" step="1" value="${Number(entry.delay)||0}"></label>
    <label class="inline-check"><span>Rifornimento</span><input id="todayRefuel" type="checkbox" ${entry.refuel?'checked':''}><em id="todayRefuelCredit">${entry.refuel?`+${refuelCredit(entry)} min`:'No'}</em></label>
    <label>Diaria<select id="todayAllowance"><option value="" ${entry.allowanceRate==null?'selected':''}>No</option>${[0,9,12,24].map(rate=>`<option value="${rate}" ${Number(entry.allowanceRate)===rate?'selected':''}>${rate}%</option>`).join('')}</select></label>
    <label class="inline-check"><span>Buono pasto</span><input id="todayMeal" type="checkbox" ${entry.mealUsed?'checked':''} ${shift.meal?'':'disabled'}><em>${shift.meal?(entry.mealUsed?'BP USATO':'BP DA ACCREDITARE'):'Non previsto'}</em></label>
    <label class="inline-check"><span>Imbarco</span><input id="todayEmbark" type="checkbox" ${entry.embark?'checked':''}></label>
    <button id="restoreTodayInline" class="today-restore-button" type="button">↻ Da turno</button><button id="saveTodayInline" class="today-save-button" type="button">Salva oggi</button>
  </div>`;
  $('todayShift').addEventListener('change',()=>{const selected=shiftFor($('todayShift').value);$('todayHours').textContent=minutesToText(selected.hours*60);$('todayAllowance').value=selected.allowance?String(selected.allowanceRate):'';$('todayMeal').disabled=!selected.meal;$('todayMeal').checked=!!selected.meal;$('todayEmbark').checked=!!selected.embark;updateInlineRefuel()});
  const updateInlineRefuel=()=>{const checked=$('todayRefuel').checked;const credit=String($('todayShift').value).toUpperCase()==='DT'?60:30;$('todayRefuelCredit').textContent=checked?`+${credit} min`:'No'};
  $('todayRefuel').addEventListener('change',updateInlineRefuel);
  $('restoreTodayInline').addEventListener('click',async()=>{const button=$('restoreTodayInline');button.disabled=true;try{const code=await getScheduledShift(todayIso()),competence=shiftFor(code);$('todayShift').value=code;$('todayHours').textContent=minutesToText(competence.hours*60);$('todayAllowance').value=competence.allowance?String(competence.allowanceRate):'';$('todayMeal').disabled=!competence.meal;$('todayMeal').checked=!!competence.meal;$('todayEmbark').checked=!!competence.embark;updateInlineRefuel();notify(`Ripristinato il turno ${code}`)}catch(error){notify(error.message)}finally{button.disabled=false}});
  $('saveTodayInline').addEventListener('click',()=>{entry.shift=$('todayShift').value;entry.delay=Number($('todayDelay').value)||0;entry.refuel=$('todayRefuel').checked;entry.allowanceRate=$('todayAllowance').value===''?null:Number($('todayAllowance').value);entry.mealUsed=$('todayMeal').checked;entry.embark=$('todayEmbark').checked;entry.imported=false;persist();notify('Giornata di oggi aggiornata')});
}
function renderWeeklyOvertime(monthEntries){
  const weekKeys=[...new Set(monthEntries.map(e=>isoWeek(e.date)))];let overtimeTotal=0;const [reportYear,reportMonth]=currentMonth().split('-').map(Number),cutoff=lastSundayOfMonth(reportYear,reportMonth-1);
  const rows=weekKeys.map(key=>{const weekEntries=entries.filter(e=>isoWeek(e.date)===key);const baseWorked=weekEntries.reduce((sum,e)=>sum+Math.round(shiftFor(e.shift).hours*60),0),markedOvertime=weekEntries.reduce((sum,e)=>sum+(Number(e.delay)||0),0),worked=baseWorked+markedOvertime,refuel=weekEntries.reduce((sum,e)=>sum+refuelCredit(e),0),bank=weekEntries.reduce((sum,e)=>sum+(Number(e.bank)||0)+refuelCredit(e),0),mealEntries=weekEntries.filter(e=>e.date<=todayIso()&&shiftFor(e.shift).meal),mealsUsed=mealEntries.filter(e=>e.mealUsed).length,mealsCredit=mealEntries.length-mealsUsed,embarks=weekEntries.filter(e=>e.embark).length,workDays=weekEntries.filter(e=>shiftFor(e.shift).hours>0).length,allowanceRates=weekEntries.filter(e=>e.allowanceRate!==null&&e.allowanceRate!==undefined).reduce((groups,e)=>{const rate=Number(e.allowanceRate);groups[rate]=(groups[rate]||0)+1;return groups},{});const overtime=Math.max(0,baseWorked-39*60)+markedOvertime,info=weekInfo(weekEntries[0]?.date||monthEntries[0].date),completed=info.end<=new Date(todayIso()+'T23:59:59');if(completed)overtimeTotal+=overtime;return {key,range:info.label,payment:info.paymentLabel,afterCutoff:info.end>cutoff,completed,worked,overtime,bank,refuel,mealsUsed,mealsCredit,embarks,workDays,allowanceRates}});
  return {total:overtimeTotal,rows};
}
function renderTotalSummary(rows){
  const allowanceText=rates=>Object.entries(rates).map(([rate,count])=>`${count}×${rate}%`).join(' · ')||'—',included=rows.filter(row=>!row.afterCutoff),carried=rows.filter(row=>row.afterCutoff),accrued=included.filter(row=>row.completed||row.key===isoWeek(todayIso())),totals=accrued.reduce((sum,row)=>({workDays:sum.workDays+row.workDays,worked:sum.worked+row.worked,overtime:sum.overtime+row.overtime,bank:sum.bank+row.bank,mealsUsed:sum.mealsUsed+row.mealsUsed,mealsCredit:sum.mealsCredit+row.mealsCredit,embarks:sum.embarks+row.embarks,allowances:sum.allowances+Object.values(row.allowanceRates).reduce((a,b)=>a+b,0),refuel:sum.refuel+row.refuel}),{workDays:0,worked:0,overtime:0,bank:0,mealsUsed:0,mealsCredit:0,embarks:0,allowances:0,refuel:0});
  const rowHtml=(row,carriedRow=false)=>`<tr class="${row.completed?'':'forecast-total-row'} ${carriedRow?'carried-total-row':''}"><td><strong>${row.range}</strong><small>${carriedRow?`Da riportare a ${row.payment}`:row.completed?'Consuntivo':'Previsione'}</small></td><td>${dataPill(row.workDays,'pill-days')}</td><td>${dataPill(minutesToText(row.worked),'pill-hours')}</td><td>${dataPill(minutesToText(row.overtime),'pill-overtime')}</td><td>${dataPill(minutesToText(row.bank),'pill-bank')}</td><td>${dataPill(bpSummary(row.mealsUsed,row.mealsCredit),'pill-bp')}</td><td>${dataPill(row.embarks,'pill-embark')}</td><td>${dataPill(allowanceText(row.allowanceRates),'pill-allowance')}</td></tr>`;
  const body=included.map(row=>rowHtml(row)).join(''),carriedBody=carried.map(row=>rowHtml(row,true)).join('');
  const carriedSpacer=carriedBody?'<tr class="carried-spacer"><td colspan="8"></td></tr>':'';$('totalSummaryBody').innerHTML=body+`<tr class="grand-total-row"><td><strong>TOTALE MATURATO</strong></td><td>${dataPill(totals.workDays,'pill-days')}</td><td>${dataPill(minutesToText(totals.worked),'pill-hours')}</td><td>${dataPill(minutesToText(totals.overtime),'pill-overtime')}</td><td>${dataPill(minutesToText(totals.bank),'pill-bank')}</td><td>${dataPill(bpSummary(totals.mealsUsed,totals.mealsCredit),'pill-bp')}</td><td>${dataPill(totals.embarks,'pill-embark')}</td><td>${dataPill(totals.allowances,'pill-allowance')}</td></tr>`+carriedSpacer+carriedBody;
}
function previousMonthCarryRow(){
  const previous=previousMonthCarryEntries();if(!previous.length)return '';
  const previousMonthLabel=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(new Date(previous[0].date+'T12:00:00'));
  const mealEntries=previous.filter(e=>e.date<=todayIso()&&shiftFor(e.shift).meal),mealsUsed=mealEntries.filter(e=>e.mealUsed).length,mealsCredit=mealEntries.length-mealsUsed,work=previous.reduce((sum,e)=>sum+Math.round(shiftFor(e.shift).hours*60),0),extra=previous.reduce((sum,e)=>sum+(Number(e.delay)||0),0),refuel=previous.reduce((sum,e)=>sum+refuelCredit(e),0),bank=previous.reduce((sum,e)=>sum+(Number(e.bank)||0)+refuelCredit(e),0),allowanceRates=previous.filter(e=>e.allowanceRate!==null&&e.allowanceRate!==undefined).reduce((groups,e)=>{groups[e.allowanceRate]=(groups[e.allowanceRate]||0)+1;return groups},{}),embarks=previous.filter(e=>e.embark).length;
  const dateFmt=date=>new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short'}).format(new Date(date+'T12:00:00')),range=`${dateFmt(previous[0].date)} – ${dateFmt(previous.at(-1).date)}`;
  const diaria=Object.entries(allowanceRates).map(([rate,count])=>`${count}×${rate}%`).join(' · ')||'—';return `<tr class="previous-month-row"><td><small>RIPORTATO DA ${previousMonthLabel.toUpperCase()}</small><strong>${range}</strong></td><td><span class="carry-badge">RIPORTO</span></td><td>${dataPill(minutesToText(work),'pill-hours')}</td><td>${dataPill(minutesToText(extra),'pill-overtime')}</td><td>${dataPill(minutesToText(bank),'pill-bank')}</td><td>${dataPill(bpSummary(mealsUsed,mealsCredit),'pill-bp')}</td><td>${dataPill(embarks||'—','pill-embark')}</td><td>${dataPill(diaria,'pill-allowance')}</td><td></td></tr>`;
}
function persist(){localStorage.setItem(STORAGE,JSON.stringify(entries));render()}
function notify(message){$('toast').textContent=message;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),1800)}
async function syncCurrentAgent(){
  if(!activeAgent)return;
  const button=$('syncShifts');button.disabled=true;$('syncStatus').textContent='Aggiornamento…';
  try{
    const response=await fetch(`${TURNS_URL}?t=${Date.now()}`);if(!response.ok)throw new Error(response.status);
    const data=await response.json();let agent=null;
    Object.values(data.residenze||{}).some(list=>{agent=(list||[]).find(a=>String(a.id)===String(activeAgent.id));return !!agent});
    if(!agent)throw new Error('Agente non trovato');const variations=await loadOdsVariations().catch(error=>{console.warn(error);return new Map()});let added=0,updated=0;
    activeAgent={...activeAgent,name:agent.agente||activeAgent.name,qualifica:agent.qualifica||'marinaio'};localStorage.setItem(SESSION_KEY,JSON.stringify(activeAgent));updateWelcome();
    Object.entries(agent.turni||{}).forEach(([date,raw])=>{
      const baseShift=normalizeScheduleShift(raw),odsShift=variations.get(date),shift=odsShift??baseShift,variationFrom=odsShift&&odsShift!==baseShift?baseShift:null,existing=entries.find(e=>e.date===date);
      if(existing){if(existing.imported){if(existing.shift!==shift)updated++;const competence=shiftFor(shift);existing.shift=shift;existing.embark=!!competence.embark;existing.mealUsed=!!competence.meal;existing.allowanceRate=competence.allowance?competence.allowanceRate:null;existing.variationFrom=variationFrom;existing.variationTo=variationFrom?shift:null}}
      else{const competence=shiftFor(shift);entries.push({id:`naviturni-${date}`,date,shift,variationFrom,variationTo:variationFrom?shift:null,delay:0,bank:0,embark:!!competence.embark,mealUsed:!!competence.meal,allowanceRate:competence.allowance?competence.allowanceRate:null,note:'',imported:true});added++}
    });
    localStorage.setItem(`navidiaria.lastSync.${activeAgent.id}`,new Date().toISOString());persist();$('syncStatus').textContent=`${activeAgent.name} · aggiornato`;notify(`${added} turni importati${updated?`, ${updated} aggiornati`:''}`);
  }catch(error){console.error(error);$('syncStatus').textContent='Sincronizzazione non riuscita';notify('Impossibile leggere NaviTurni')}
  finally{button.disabled=false}
}

function render(){
  const list=filtered(),carryEntries=previousMonthCarryEntries(),actualEntries=[...carryEntries,...list].filter(e=>e.date<=todayIso());let total=0,bank=0,embark=0,meals=0,mealsUsed=0,allowances=0;
  const weeks={};
  actualEntries.forEach(e=>{const s=shiftFor(e.shift);const mins=Math.round(s.hours*60)+(Number(e.delay)||0);total+=mins;bank+=(Number(e.bank)||0)+refuelCredit(e);embark+=e.embark?1:0;if(s.meal){e.mealUsed?mealsUsed++:meals++}allowances+=e.allowanceRate!==null&&e.allowanceRate!==undefined?1:0;const w=isoWeek(e.date);weeks[w]=(weeks[w]||0)+mins});
  const weeklyOvertime=renderWeeklyOvertime(list),overtime=weeklyOvertime.total;renderTotalSummary(weeklyOvertime.rows);
  const [y,m]=currentMonth().split('-');$('heroMonth').textContent=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(new Date(y,m-1,1)).replace(/^./,c=>c.toUpperCase());
  renderTodaySummary();
  $('entriesBody').innerHTML=previousMonthCarryRow()+list.map(e=>{const s=shiftFor(e.shift),isPastOrToday=e.date<=todayIso(),bp=s.meal&&isPastOrToday?(e.mealUsed?'USATO':'DA ACCREDITARE'):'—',diaria=e.allowanceRate!==null&&e.allowanceRate!==undefined?`${e.allowanceRate}%`:'—',bankTotal=(Number(e.bank)||0)+refuelCredit(e);const dayRow=`<tr class="${e.date===todayIso()?'today-row':''}"><td><strong>${fmt.format(new Date(e.date+'T12:00:00'))}${e.date===todayIso()?'<span class="today-label">OGGI</span>':''}${e.variationFrom?`<span class="variation-badge" title="${escapeHtml(e.variationFrom)} → ${escapeHtml(e.variationTo||e.shift)}">VAR.</span>`:''}</strong>${e.note?`<small>${escapeHtml(e.note)}</small>`:''}</td><td><span class="shift-badge ${shiftClass(e.shift)}">${e.shift}</span></td><td>${dataPill(minutesToText(Math.round(s.hours*60)+Number(e.delay||0)),shiftClass(e.shift))}</td><td>${dataPill(e.delay?e.delay+' min':'—','pill-overtime')}</td><td>${dataPill(bankTotal?minutesToText(bankTotal):'—','pill-bank')}</td><td>${dataPill(bp,'pill-bp')}</td><td>${dataPill(e.embark?'Sì':'—','pill-embark')}</td><td>${dataPill(diaria,'pill-allowance')}</td><td><div class="row-actions"><button class="edit-button icon-only-button" data-edit="${e.id}" aria-label="Modifica giornata" title="Modifica giornata">✎</button></div></td></tr>`;const isSunday=new Date(e.date+'T12:00:00').getDay()===0;if(!isSunday)return dayRow;const week=weeklyOvertime.rows.find(row=>row.key===isoWeek(e.date)),allowanceSummary=week?Object.entries(week.allowanceRates).map(([rate,count])=>`${count}×${rate}%`).join(' · ')||'—':'—';const summary=week?`<tr class="week-summary-table ${week.afterCutoff?'carried':''} ${week.completed?'':'future-week'}"><td><small>RIEPILOGO SETTIMANA ${week.completed?'':'· PREVISIONE'}</small><strong>${week.range}${week.afterCutoff?` · DA RIPORTARE A ${week.payment.toUpperCase()}`:''}</strong></td><td>${dataPill('39h 00m','pill-threshold')}</td><td>${dataPill(minutesToText(week.worked),'pill-hours')}</td><td>${dataPill(minutesToText(week.overtime),'pill-overtime')}</td><td>${dataPill(minutesToText(week.bank),'pill-bank')}</td><td>${dataPill(bpSummary(week.mealsUsed,week.mealsCredit),'pill-bp')}</td><td>${dataPill(week.embarks||'—','pill-embark')}</td><td>${dataPill(allowanceSummary,'pill-allowance')}</td><td></td></tr>`:'';return dayRow+summary}).join('');
  $('emptyState').style.display=list.length?'none':'block';
}
function escapeHtml(s){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function hoursToClock(hours){const mins=Math.round((Number(hours)||0)*60);return `${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`}
function clockToHours(value){const [h,m]=String(value||'0:0').split(':').map(Number);return (h||0)+(m||0)/60}
function renderShiftSettings(){
  $('shiftCards').innerHTML=SHIFTS.filter(s=>s.code!=='Riposo').map(s=>`<div class="shift-card" data-shift="${s.code}"><strong>${s.code}</strong><label>Durata<input class="shift-hours" type="time" value="${hoursToClock(s.hours)}"></label><div class="shift-options"><label><input class="shift-embark" type="checkbox" ${s.embark?'checked':''}> Imbarco</label><label><input class="shift-allowance" type="checkbox" ${s.allowance?'checked':''}> Diaria</label><label class="rate-label">Aliquota <select class="shift-rate">${[0,9,12,24].map(rate=>`<option value="${rate}" ${Number(s.allowanceRate)===rate?'selected':''}>${rate}%</option>`).join('')}</select></label><label><input class="shift-meal" type="checkbox" ${s.meal?'checked':''}> Diritto al buono</label></div></div>`).join('');
}
function refreshShiftSelect(){const selected=$('entryShift').value;$('entryShift').innerHTML=SHIFTS.map(s=>`<option value="${s.code}">${s.code}${s.hours?' · '+minutesToText(s.hours*60):''}</option>`).join('');if(SHIFTS.some(s=>s.code===selected))$('entryShift').value=selected}
function applyCompetenceDefaults(){const shift=shiftFor($('entryShift').value);$('entryEmbark').checked=!!shift.embark;$('entryAllowanceRate').value=shift.allowance?String(shift.allowanceRate):'';$('entryMeal').checked=!!shift.meal;$('entryMeal').disabled=!shift.meal;$('entryMeal').closest('label').title=shift.meal?'Usato per impostazione predefinita; deseleziona se non lo utilizzi':'Questo turno non dà diritto al buono pasto';$('refuelLabel').textContent=String(shift.code).toUpperCase()==='DT'?'Rifornimento (+60 min)':'Rifornimento (+30 min)'}
function resetEntryForm(){editingId=null;$('entryForm').reset();$('entryDate').value=todayIso();$('entryEmbark').checked=true;applyCompetenceDefaults();$('submitEntry').textContent='Aggiungi giornata';$('cancelEdit').hidden=true}
function closeEntryForm(){const form=$('entryForm');form.hidden=true;form.style.display='none';$('dayEditor').hidden=true}
function startEdit(id){const entry=entries.find(e=>e.id===id);if(!entry)return;editingId=id;$('entryDate').value=entry.date;$('entryShift').value=entry.shift;applyCompetenceDefaults();$('entryDelay').value=entry.delay||0;$('entryBank').value=entry.bank||0;$('entryAllowanceRate').value=entry.allowanceRate??'';$('entryEmbark').checked=!!entry.embark;$('entryRefuel').checked=!!entry.refuel;$('entryMeal').checked=!!entry.mealUsed;$('entryNote').value=entry.note||'';$('submitEntry').textContent='Salva modifiche';$('cancelEdit').hidden=false;$('dayEditorTitle').textContent=`Modifica ${fmt.format(new Date(entry.date+'T12:00:00'))}`;$('dayEditor').hidden=false;$('entryForm').hidden=false;$('entryForm').style.display='grid';document.querySelector('.quick-entry').scrollIntoView({behavior:'smooth',block:'start'})}
function openTodayEditor(){const todayEntry=entries.find(e=>e.date===todayIso());if(todayEntry){startEdit(todayEntry.id)}else{resetEntryForm();$('dayEditorTitle').textContent='Aggiungi la giornata di oggi';$('dayEditor').hidden=false;$('entryForm').hidden=false;$('entryForm').style.display='grid';document.querySelector('.quick-entry').scrollIntoView({behavior:'smooth',block:'start'})}}
async function hashPin(pin){const bytes=new TextEncoder().encode(`NaviDiaria:${pin}`);const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function showLoginMessage(message){$('loginMessage').textContent=message}
async function loadAgentDirectory(){
  const response=await fetch(`${TURNS_URL}?t=${Date.now()}`);if(!response.ok)throw new Error('Turni non raggiungibili');const data=await response.json();agentsDirectory=[];
  Object.entries(data.residenze||{}).forEach(([residence,list])=>(list||[]).forEach(agent=>agentsDirectory.push({id:String(agent.id),name:String(agent.agente||'').trim(),qualifica:String(agent.qualifica||'marinaio').trim(),residence})));
  agentsDirectory.sort((a,b)=>a.name.localeCompare(b.name,'it'));
  renderAgentChoices();
}
function renderAgentChoices(){const query=$('loginAgentSearch').value.trim().toLocaleLowerCase('it'),matches=agentsDirectory.filter(agent=>agent.name.toLocaleLowerCase('it').includes(query));$('loginAgentSuggestions').innerHTML=matches.map(agent=>`<option value="${escapeHtml(agent.name)}">${escapeHtml(agent.residence)}</option>`).join('')}
function selectedLoginAgent(){const query=$('loginAgentSearch').value.trim().toLocaleLowerCase('it');if(!query)return null;const exact=agentsDirectory.find(agent=>agent.name.toLocaleLowerCase('it')===query);if(exact)return exact;const matches=agentsDirectory.filter(agent=>agent.name.toLocaleLowerCase('it').includes(query));return matches.length===1?matches[0]:null}
function renderAdminPinList(){
  if(!isAdmin())return;const registered=[];
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('navidiaria.pin.')){const id=key.slice('navidiaria.pin.'.length),agent=agentsDirectory.find(item=>item.id===id);registered.push({id,name:agent?.name||`Agente ${id}`,qualifica:agent?.qualifica||'',residence:agent?.residence||''})}}
  registered.sort((a,b)=>a.name.localeCompare(b.name,'it'));
  $('adminPinList').innerHTML=registered.length?registered.map(agent=>{const grade=GRADE_INFO[String(agent.qualifica||'marinaio').toLowerCase()]||GRADE_INFO.marinaio;return `<div class="admin-agent-row"><div class="admin-agent-avatar">${escapeHtml(formatAgentName(agent.name).charAt(0))}</div><div class="admin-agent-info"><strong>${escapeHtml(formatAgentName(agent.name))}</strong><span class="${grade.className}">${grade.label}${agent.residence?` · ${escapeHtml(agent.residence)}`:''}</span></div><span class="pin-active-badge">PIN ATTIVO</span><button class="reset-agent-pin" data-agent-id="${escapeHtml(agent.id)}" data-agent-name="${escapeHtml(formatAgentName(agent.name))}" type="button">Resetta PIN</button></div>`}).join(''):'<div class="weekly-empty">Nessun agente ha ancora registrato un PIN su questo dispositivo.</div>';
}
async function loginAgent(agentId,pin){
  const agent=agentsDirectory.find(item=>item.id===String(agentId));if(!agent)throw new Error('Seleziona un agente dalla lista');
  const pinKey=`navidiaria.pin.${agent.id}`,digest=await hashPin(pin),saved=localStorage.getItem(pinKey);
  if(saved&&saved!==digest)throw new Error('PIN non corretto');if(!saved)localStorage.setItem(pinKey,digest);
  const personalKey=`navidiaria.entries.v1.${agent.id}`;if(agent.id==='92'&&!localStorage.getItem(personalKey)&&localStorage.getItem('navidiaria.entries.v1'))localStorage.setItem(personalKey,localStorage.getItem('navidiaria.entries.v1'));
  localStorage.setItem(SESSION_KEY,JSON.stringify(agent));location.reload();
}
async function initializeAccess(){
  if(activeAgent){updateWelcome();$('pinSettingsButton').hidden=false;$('logoutButton').hidden=false;$('syncStatus').textContent=activeAgent.name;$('competenze').hidden=!isAdmin();$('competencyNav').hidden=!isAdmin();$('adminPanel').hidden=!isAdmin();$('adminNav').hidden=!isAdmin();syncCurrentAgent();if(isAdmin()){try{await loadAgentDirectory();renderAdminPinList()}catch(error){$('adminPinList').innerHTML='<div class="weekly-empty">Impossibile caricare l’elenco agenti.</div>'}}}
  else{$('loginOverlay').hidden=false;document.body.classList.add('login-open');$('loginAgentSearch').focus();try{await loadAgentDirectory()}catch(error){showLoginMessage('Impossibile caricare gli agenti. Ricarica la pagina.');$('loginAgentSearch').placeholder='Elenco non disponibile';$('loginAgentSearch').disabled=true}}
}

refreshShiftSelect();renderShiftSettings();
const today=new Date();$('monthFilter').value=todayIso().slice(0,7);$('entryDate').value=todayIso();
applyCompetenceDefaults();
$('entryShift').addEventListener('change',applyCompetenceDefaults);
$('entryDate').addEventListener('change',()=>{const existing=entries.find(e=>e.date===$('entryDate').value);if(existing&&existing.id!==editingId)startEdit(existing.id)});
$('entryForm').addEventListener('submit',e=>{e.preventDefault();const rate=$('entryAllowanceRate').value;const values={date:$('entryDate').value,shift:$('entryShift').value,delay:Number($('entryDelay').value),bank:Number($('entryBank').value),refuel:$('entryRefuel').checked,allowanceRate:rate===''?null:Number(rate),embark:$('entryEmbark').checked,mealUsed:$('entryMeal').checked,note:$('entryNote').value.trim()};const duplicate=entries.find(x=>x.date===values.date&&x.id!==editingId);if(duplicate){notify('Questa giornata esiste già');startEdit(duplicate.id);return}if(editingId){const entry=entries.find(x=>x.id===editingId);if(entry)Object.assign(entry,values,{imported:false});persist();notify('Giornata aggiornata')}else{entries.push({id:crypto.randomUUID(),...values});persist();notify('Giornata aggiunta')}resetEntryForm();closeEntryForm()});
$('entriesBody').addEventListener('click',e=>{const editId=e.target.dataset.edit;if(editId)startEdit(editId)});
$('cancelEdit').addEventListener('click',()=>{resetEntryForm();closeEntryForm()});
$('restoreFromShift').addEventListener('click',restoreFormFromSchedule);
$('toggleCompetencies').addEventListener('click',()=>{if(!isAdmin())return;const body=$('competencyBody');const opening=body.hidden;body.hidden=!opening;$('toggleCompetencies').setAttribute('aria-expanded',String(opening));$('competencyChevron').textContent=opening?'⌃':'⌄'});
$('saveAllShifts').addEventListener('click',()=>{if(!isAdmin()){notify('Operazione riservata all’amministratore');return}document.querySelectorAll('#shiftCards .shift-card').forEach(card=>{const shift=shiftFor(card.dataset.shift);shift.hours=clockToHours(card.querySelector('.shift-hours').value);shift.embark=card.querySelector('.shift-embark').checked;shift.allowance=card.querySelector('.shift-allowance').checked;shift.allowanceRate=Number(card.querySelector('.shift-rate').value)||0;shift.meal=card.querySelector('.shift-meal').checked});localStorage.setItem(SHIFTS_STORAGE,JSON.stringify(SHIFTS));refreshShiftSelect();render();notify('Tutte le competenze sono state salvate')});
$('resetShifts').addEventListener('click',()=>{if(!isAdmin()){notify('Operazione riservata all’amministratore');return}SHIFTS=DEFAULT_SHIFTS.map(s=>({...s,embark:!GROUND_SHIFTS.has(String(s.code).toUpperCase())}));localStorage.setItem(SHIFTS_STORAGE,JSON.stringify(SHIFTS));refreshShiftSelect();renderShiftSettings();render();notify('Competenze ripristinate')});
$('monthFilter').addEventListener('change',render);
$('syncShifts').addEventListener('click',syncCurrentAgent);
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const button=$('loginSubmit'),agent=selectedLoginAgent();if(!agent){showLoginMessage('Scegli il tuo nominativo tra i suggerimenti');return}button.disabled=true;showLoginMessage('Verifica in corso…');try{await loginAgent(agent.id,$('loginPin').value)}catch(error){showLoginMessage(error.message);button.disabled=false}});
$('loginAgentSearch').addEventListener('input',()=>{if(agentsDirectory.length)renderAgentChoices()});
$('pinSettingsButton').addEventListener('click',()=>{$('pinForm').reset();$('pinMessage').textContent='';$('pinOverlay').hidden=false;document.body.classList.add('login-open')});
$('closePinSettings').addEventListener('click',()=>{$('pinOverlay').hidden=true;document.body.classList.remove('login-open')});
$('pinForm').addEventListener('submit',async e=>{e.preventDefault();const current=$('currentPin').value,next=$('newPin').value,confirmation=$('confirmPin').value,key=`navidiaria.pin.${activeAgent.id}`;if(next!==confirmation){$('pinMessage').textContent='I nuovi PIN non coincidono';return}const currentHash=await hashPin(current);if(currentHash!==localStorage.getItem(key)){$('pinMessage').textContent='Il PIN attuale non è corretto';return}localStorage.setItem(key,await hashPin(next));$('pinOverlay').hidden=true;document.body.classList.remove('login-open');notify('PIN modificato correttamente')});
$('resetOwnPin').addEventListener('click',()=>{if(!confirm('Vuoi resettare il PIN? Verrai disconnesso e potrai sceglierne uno nuovo al prossimo accesso.'))return;localStorage.removeItem(`navidiaria.pin.${activeAgent.id}`);localStorage.removeItem(SESSION_KEY);location.reload()});
$('refreshPinList').addEventListener('click',renderAdminPinList);
$('adminPinList').addEventListener('click',e=>{const button=e.target.closest('.reset-agent-pin');if(!button||!isAdmin())return;const name=button.dataset.agentName,id=button.dataset.agentId;if(!confirm(`Resettare il PIN di ${name}? I suoi dati resteranno invariati.`))return;localStorage.removeItem(`navidiaria.pin.${id}`);if(id===String(activeAgent.id)){localStorage.removeItem(SESSION_KEY);location.reload();return}renderAdminPinList();notify(`PIN di ${name} resettato`)});
$('logoutButton').addEventListener('click',()=>{localStorage.removeItem(SESSION_KEY);location.reload()});
$('openToday').addEventListener('click',openTodayEditor);
$('toggleForm').addEventListener('click',()=>{resetEntryForm();closeEntryForm()});
document.querySelector('.menu-button').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
$('exportCsv').addEventListener('click',()=>{const rows=[['Data','Servizio','Ore','Straordinario min','Banca ore min','Imbarco','Buono pasto','Note'],...filtered().map(e=>[e.date,e.shift,shiftFor(e.shift).hours,e.delay,e.bank,e.embark?'Sì':'No',e.mealUsed?'Sì':'No',e.note])];const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`navidiaria-${currentMonth()}.csv`;a.click();URL.revokeObjectURL(a.href)});
render();
initializeAccess();
