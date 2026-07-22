const DIRECTORY_URL = 'https://script.google.com/macros/s/AKfycbw38IoMZJ50bun_AL-KjQ7jG4UbMPRKxjr22TXrzpZ_pIM2s9ZqOR0LYFXgC007Yc0PpQ/exec';
const DIARIA_SESSION = 'navidiaria.activeAgent';
const TURNI_SESSION = 'naviturni_logged_agent';
const MOVEMENT_AGENT = { id:'MOVIMENTO', name:'Ufficio Movimento', qualifica:'ufficio', residence:'UFFICIO MOVIMENTO', role:'admin' };
let agents = [];
let pendingFirstLogin = null;

const $ = id => document.getElementById(id);
const isAdminAgent = agent => ['92', 'MOVIMENTO'].includes(String(agent?.id || '')) || String(agent?.role || '').toLowerCase() === 'admin';
const isBaristaAgent = agent => String(agent?.role || '').toLowerCase() === 'barista' || String(agent?.qualifica || '').toLowerCase() === 'barista';
const formatName = name => String(name || '').trim().split(/\s+/).map(part => part.length > 1 ? part[0] + part.slice(1).toLocaleLowerCase('it') : part).join(' ');

document.addEventListener('click', event => {
  const link = event.target.closest('a[data-navi-tab]');
  if (!link) return;
  event.preventDefault();
  const target = window.open(link.href, link.dataset.naviTab);
  if (target) target.focus();
});

async function hashPin(pin) {
  const bytes = new TextEncoder().encode(`NaviDiaria:${pin}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function renderSuggestions() {
  const query = $('agentSearch').value.trim().toLocaleLowerCase('it');
  $('agentSuggestions').innerHTML = agents
    .filter(agent => agent.name.toLocaleLowerCase('it').includes(query))
    .map(agent => `<option value="${agent.name.replace(/"/g, '&quot;')}">${agent.residence}</option>`)
    .join('');
}

function selectedAgent() {
  const query = $('agentSearch').value.trim().toLocaleLowerCase('it');
  const exact = agents.find(agent => agent.name.toLocaleLowerCase('it') === query);
  if (exact) return exact;
  const matches = agents.filter(agent => agent.name.toLocaleLowerCase('it').includes(query));
  return matches.length === 1 ? matches[0] : null;
}

function showChoice(agent) {
  $('loginForm').hidden = true;
  $('firstPinForm').hidden = true;
  $('appChoice').hidden = false;
  $('welcomeUser').textContent = `Ciao ${formatName(agent.name)}, dove vuoi andare?`;
  const diaria = document.querySelector('.app-card.diaria');
  const docs = document.querySelector('.app-card.docs');
  const trova = document.querySelector('.app-card.trova');
  const settings = document.querySelector('.app-card.settings');
  if (diaria) diaria.hidden = !isAdminAgent(agent);
  if (docs) docs.hidden = isBaristaAgent(agent);
  if (trova) trova.hidden = isBaristaAgent(agent);
  if (settings) settings.hidden = isBaristaAgent(agent);
}

async function loadAgents() {
  // La directory deve essere aggiornata a ogni apertura: NAVI_UTENTI può cambiare.
  try {
    await NaviSharedData.load(DIRECTORY_URL, { force:true });
  } catch (error) {
    // In assenza di rete resta disponibile l'ultima copia valida.
  }
  agents = NaviSharedData.directory() || [];
  const ordered = agents
    .filter(agent => String(agent.id) !== MOVEMENT_AGENT.id)
    .sort((a, b) => Number(isBaristaAgent(a)) - Number(isBaristaAgent(b)) || a.name.localeCompare(b.name, 'it'));
  agents = [MOVEMENT_AGENT, ...ordered];
  renderSuggestions();
}

document.addEventListener('DOMContentLoaded', async () => {
  const active = JSON.parse(localStorage.getItem(DIARIA_SESSION) || 'null') || JSON.parse(localStorage.getItem(TURNI_SESSION) || 'null');
  if (active) {
    showChoice(active);
    NaviSharedData.load(DIRECTORY_URL, { force:true }).catch(() => {});
    return;
  }
  try {
    await loadAgents();
  } catch (error) {
    $('loginMessage').textContent = 'Impossibile caricare gli agenti. Controlla la connessione e ricarica.';
    $('loginSubmit').disabled = true;
  }
});

$('agentSearch').addEventListener('input', renderSuggestions);

$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const agent = selectedAgent();
  const pin = $('agentPin').value;
  const button = $('loginSubmit');
  if (!agent) {
    $('loginMessage').textContent = 'Seleziona un agente dai suggerimenti.';
    return;
  }
  button.disabled = true;
  $('loginMessage').textContent = 'Verifica online…';
  try {
    const digest = await hashPin(pin);
    const auth = await NaviCloud.request('auth', { agentId:agent.id, pinHash:digest });
    if (auth.mustChangePin || auth.registered) {
      pendingFirstLogin = { agent, pinHash:digest };
      $('loginForm').hidden = true;
      $('firstPinForm').hidden = false;
      $('firstNewPin').focus();
      return;
    }
    localStorage.setItem(`navidiaria.pin.${agent.id}`, digest);
    localStorage.setItem(DIARIA_SESSION, JSON.stringify(agent));
    localStorage.setItem(TURNI_SESSION, JSON.stringify({ id:agent.id, name:agent.name, residence:agent.residence, qualifica:agent.qualifica, role:agent.role || '' }));
    $('loginMessage').textContent = '';
    showChoice(agent);
    NaviSharedData.load(DIRECTORY_URL, { force:true }).catch(() => {});
  } catch (error) {
    $('loginMessage').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('firstPinForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!pendingFirstLogin) {
    location.reload();
    return;
  }
  const nextPin = $('firstNewPin').value;
  const confirmation = $('firstConfirmPin').value;
  const button = $('firstPinSubmit');
  if (nextPin !== confirmation) {
    $('firstPinMessage').textContent = 'I PIN non coincidono.';
    return;
  }
  button.disabled = true;
  $('firstPinMessage').textContent = 'Salvataggio online…';
  try {
    const newPinHash = await hashPin(nextPin);
    const { agent, pinHash } = pendingFirstLogin;
    await NaviCloud.request('change_pin', { agentId:agent.id, pinHash, newPinHash });
    localStorage.setItem(`navidiaria.pin.${agent.id}`, newPinHash);
    localStorage.setItem(DIARIA_SESSION, JSON.stringify(agent));
    localStorage.setItem(TURNI_SESSION, JSON.stringify({ id:agent.id, name:agent.name, residence:agent.residence, qualifica:agent.qualifica, role:agent.role || '' }));
    pendingFirstLogin = null;
    $('firstPinMessage').textContent = '';
    showChoice(agent);
  } catch (error) {
    $('firstPinMessage').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('logoutButton').addEventListener('click', () => {
  localStorage.removeItem(DIARIA_SESSION);
  localStorage.removeItem(TURNI_SESSION);
  location.reload();
});
