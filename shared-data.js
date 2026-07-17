(function(){
  const DATA_KEY='navi.sharedData.v1';
  const TIME_KEY='navi.sharedDataTime.v1';
  const DIRECTORY_KEY='navi.agentDirectory.v1';
  const MAX_AGE=10*60*1000;
  let pending=null,lastSource='local';
  function read(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
  function directoryFrom(data){const byId=new Map();Object.entries(data?.residenze||{}).forEach(([residence,list])=>(list||[]).forEach(agent=>{const item={id:String(agent.id),name:String(agent.agente||'').trim(),qualifica:String(agent.qualifica||'marinaio').trim(),residence};if(item.id&&item.name)byId.set(item.id,item)}));const baristas=Array.isArray(data?.bariste)?data.bariste:Array.isArray(data?.barista)?data.barista:[];baristas.forEach(record=>{const name=String(record.barista||record.agente||record.nome||'').trim();if(!name)return;const generated=`BARISTA_${name.toLocaleUpperCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')}`;const id=String(record.id||generated);if(!byId.has(id))byId.set(id,{id,name,qualifica:'barista',residence:'BARISTE',role:'barista'})});return [...byId.values()].sort((a,b)=>{const baristaA=String(a.role||a.qualifica||'').toLowerCase()==='barista'?1:0,baristaB=String(b.role||b.qualifica||'').toLowerCase()==='barista'?1:0;return baristaA-baristaB||a.name.localeCompare(b.name,'it')})}
  function save(data){localStorage.setItem(DATA_KEY,JSON.stringify(data));localStorage.setItem(TIME_KEY,String(Date.now()));localStorage.setItem(DIRECTORY_KEY,JSON.stringify(directoryFrom(data)));return data}
  function cached(allowStale=false){const data=read(DATA_KEY),age=Date.now()-Number(localStorage.getItem(TIME_KEY)||0);return data&&(allowStale||age<MAX_AGE)?data:null}
  async function load(url,{force=false}={}){if(!force){const data=cached();if(data){lastSource='local';return data}}if(pending)return pending;pending=fetch(`${url}${url.includes('?')?'&':'?'}t=${Date.now()}`).then(response=>{if(!response.ok)throw new Error(`Errore HTTP: ${response.status}`);return response.json()}).then(data=>{lastSource='network';return save(data)}).catch(error=>{const fallback=cached(true);if(fallback){lastSource='local';return fallback}throw error}).finally(()=>pending=null);return pending}
  function directory(){return read(DIRECTORY_KEY)||directoryFrom(cached(true))}
  function clear(){localStorage.removeItem(DATA_KEY);localStorage.removeItem(TIME_KEY)}
  window.NaviSharedData={load,directory,clear,isFresh:()=>!!cached(),source:()=>lastSource};
})();
