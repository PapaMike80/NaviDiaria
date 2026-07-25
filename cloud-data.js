(function(){
  const API_URL='https://script.google.com/macros/s/AKfycbw38IoMZJ50bun_AL-KjQ7jG4UbMPRKxjr22TXrzpZ_pIM2s9ZqOR0LYFXgC007Yc0PpQ/exec';
  async function request(action,payload={}){
    const response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...payload})});
    if(!response.ok)throw new Error(`Servizio online non disponibile (${response.status})`);
    const text=await response.text();let result;
    try{result=JSON.parse(text)}catch{throw new Error('La Web App Google non è ancora aggiornata')}
    if(!result.ok)throw new Error(result.error||'Operazione online non riuscita');
    return result;
  }
  window.NaviCloud={request,url:API_URL};
})();
