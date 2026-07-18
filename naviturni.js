let globalData = null;
    let currentResidence = "";
    let currentAgentsList = [];
    let selectedCol = null;
    let selectedShiftValue = "";
    let selectedCrewAgent = null;
    let trElements = [];
    let pinnedAgentIdx = null;
    let activeShiftFilter = null;
    let dayPanelPlacement = "main";
    let syncingHorizontalScroll = false;
    let crewCompletenessCache = new Map();
    let coverageRenderHandle = null;
    let lastLoadedDataSignature = "";
    let showPastColumns = false;
    let isEditMode = false;
    let loggedAgentProfile = null;

    const AGENT_LOGIN_STORAGE_KEY = "naviturni_logged_agent";

    function readLoggedAgentProfile() {
      try {
        return JSON.parse(localStorage.getItem(AGENT_LOGIN_STORAGE_KEY) || "null");
      } catch (e) {
        localStorage.removeItem(AGENT_LOGIN_STORAGE_KEY);
        return null;
      }
    }

    function getBaristaRecords() {
      return Array.isArray(globalData?.bariste)
        ? globalData.bariste
        : (Array.isArray(globalData?.barista) ? globalData.barista : []);
    }

    function isBaristaProfile(profile = loggedAgentProfile) {
      return String(profile?.role || "").toLowerCase() === "barista" ||
        String(profile?.qualifica || "").toLowerCase() === "barista";
    }

    function getBaristaProfileId(record, name) {
      if (record?.id) return String(record.id);
      return `BARISTA_${String(name || "").toLocaleUpperCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    }

    function updateLoginUserPanel() {
      const panel = document.getElementById("login-user-panel");
      const label = document.getElementById("login-user-name");
      const changeButton = document.getElementById("login-change-button");
      const diariaNavLink = document.getElementById("diariaNavLink");
      const archiveNavLink = document.getElementById("archiveNavLink");
      const welcome = document.getElementById("turniWelcome");
      if (!panel || !label) return;
      panel.classList.add("visible");
      label.textContent = loggedAgentProfile ? loggedAgentProfile.name.toLocaleUpperCase("it") : "SENZA ACCESSO";
      label.disabled = !loggedAgentProfile;
      label.title = loggedAgentProfile ? "Rimetti l'agente in cima" : "Accesso non effettuato";
      if (changeButton) changeButton.style.display = loggedAgentProfile ? "inline-flex" : "none";
      if (diariaNavLink) {
        const isAdmin = ["92", "MOVIMENTO"].includes(String(loggedAgentProfile?.id || "")) ||
          String(loggedAgentProfile?.role || "").toLowerCase() === "admin";
        diariaNavLink.hidden = !isAdmin;
      }
      if (archiveNavLink) archiveNavLink.hidden = isBaristaProfile();
      if (welcome) {
        const agentData = Object.values(globalData?.residenze || {}).flat().find(agent => String(agent.id || "") === String(loggedAgentProfile?.id || ""));
        const grade = String(agentData?.qualifica || loggedAgentProfile?.qualifica || "Agente").trim().toLocaleLowerCase("it").replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase("it"));
        welcome.textContent = loggedAgentProfile ? `Benvenuto ${grade} ${loggedAgentProfile.name}` : "Benvenuto";
      }
    }

    function showLoginModal() {
      const overlay = document.getElementById("login-overlay");
      const surname = document.getElementById("login-surname");
      const choice = document.getElementById("login-agent-choice");
      const choiceLabel = document.getElementById("login-choice-label");
      document.getElementById("login-message").textContent = "";
      surname.value = "";
      choice.innerHTML = "";
      choice.classList.remove("visible");
      choiceLabel.style.display = "none";
      overlay.classList.add("open");
      setTimeout(() => surname.focus(), 30);
    }

    function populateLoginSurnameOptions() {
      const datalist = document.getElementById("login-surname-options");
      if (!datalist || !globalData?.residenze) return;
      const surnames = new Map();
      const baristaSurnameKeys = new Set();
      Object.values(globalData.residenze).flat().forEach(agent => {
        const surname = String(agent.agente || "").trim().split(/\s+/)[0].replace(/[.,]+$/g, "");
        const key = normalizeOdsAgentName(surname);
        if (key && !surnames.has(key)) surnames.set(key, surname.toUpperCase());
      });
      getBaristaRecords().forEach(record => {
        const name = String(record.barista || record.agente || record.nome || "").trim();
        const surname = name.split(/\s+/)[0].replace(/[.,]+$/g, "");
        const key = normalizeOdsAgentName(surname);
        if (key && !surnames.has(key)) {
          surnames.set(key, surname.toUpperCase());
          baristaSurnameKeys.add(key);
        }
      });
      datalist.innerHTML = [...surnames.entries()]
        .sort(([keyA, nameA], [keyB, nameB]) =>
          Number(baristaSurnameKeys.has(keyA)) - Number(baristaSurnameKeys.has(keyB)) || nameA.localeCompare(nameB, "it")
        )
        .map(([, surname]) => `<option value="${escapeAttribute(surname)}"></option>`)
        .join("");
    }

    function continueWithoutLogin() {
      localStorage.removeItem(AGENT_LOGIN_STORAGE_KEY);
      loggedAgentProfile = null;
      pinnedAgentIdx = null;
      updateLoginUserPanel();
      if (globalData) renderTable();
      document.getElementById("login-overlay").classList.remove("open");
    }

    function getLoginMatches(surname) {
      const query = normalizeOdsAgentName(surname);
      if (!query || !globalData?.residenze) return [];
      const matches = [];
      Object.entries(globalData.residenze).forEach(([residence, agents]) => {
        (agents || []).forEach(agent => {
          const normalizedName = normalizeOdsAgentName(agent.agente);
          const firstNamePart = normalizedName.split(" ")[0];
          if (normalizedName === query || normalizedName.startsWith(query + " ") || firstNamePart === query) {
            matches.push({
              id: String(agent.id || ""),
              name: agent.agente,
              residence
            });
          }
        });
      });
      const seenBaristas = new Set();
      getBaristaRecords().forEach(record => {
        const name = String(record.barista || record.agente || record.nome || "").trim();
        const normalizedName = normalizeOdsAgentName(name);
        const firstNamePart = normalizedName.split(" ")[0];
        const id = getBaristaProfileId(record, name);
        if (!name || seenBaristas.has(id)) return;
        if (normalizedName === query || normalizedName.startsWith(query + " ") || firstNamePart === query) {
          seenBaristas.add(id);
          matches.push({ id, name, residence:"BARISTE", qualifica:"barista", role:"barista" });
        }
      });
      return matches;
    }

    function handleAgentLogin(event) {
      event.preventDefault();
      const message = document.getElementById("login-message");
      const choice = document.getElementById("login-agent-choice");
      const choiceLabel = document.getElementById("login-choice-label");

      const matches = getLoginMatches(document.getElementById("login-surname").value);
      if (!matches.length) {
        message.textContent = "Agente non trovato. Controlla il cognome.";
        return;
      }

      if (matches.length > 1 && !choice.classList.contains("visible")) {
        choice.innerHTML = matches.map((item, index) =>
          `<option value="${index}">${escapeAttribute(item.name)} — ${escapeAttribute(item.residence)}</option>`
        ).join("");
        choice.dataset.matches = JSON.stringify(matches);
        choice.classList.add("visible");
        choiceLabel.style.display = "block";
        message.textContent = "Sono presenti più corrispondenze: scegli il nominativo corretto.";
        return;
      }

      let selected = matches[0];
      if (choice.classList.contains("visible")) {
        try {
          const storedMatches = JSON.parse(choice.dataset.matches || "[]");
          selected = storedMatches[Number(choice.value)] || selected;
        } catch (e) {
          selected = matches[0];
        }
      }

      loggedAgentProfile = selected;
      localStorage.setItem(AGENT_LOGIN_STORAGE_KEY, JSON.stringify(selected));
      document.getElementById("login-overlay").classList.remove("open");
      updateLoginUserPanel();
      applyLoggedAgentProfile();
    }

    function getLoggedAgentLocation() {
      if (!loggedAgentProfile || String(loggedAgentProfile.id || "") === "MOVIMENTO") return null;
      const residence = loggedAgentProfile.residence;
      const agents = globalData?.residenze?.[residence] || [];
      const index = agents.findIndex(agent => {
        const sameId = loggedAgentProfile.id && String(agent.id || "") === loggedAgentProfile.id;
        return sameId || normalizeOdsAgentName(agent.agente) === normalizeOdsAgentName(loggedAgentProfile.name);
      });
      return index >= 0 ? { residence, index, agent: agents[index] } : null;
    }

    function findLoggedAgentIndex(residence = currentResidence) {
      const location = getLoggedAgentLocation();
      return location && location.residence === residence ? location.index : -1;
    }

    function applyLoggedAgentProfile() {
      if (String(loggedAgentProfile?.id || "") === "MOVIMENTO") {
        const residences = Object.keys(globalData?.residenze || {});
        const defaultResidence = residences.find(name => name.trim().toLowerCase() === "desenzano") || residences[0];
        if (!defaultResidence) return false;
        selectResidence(defaultResidence);
        updateLoginUserPanel();
        return true;
      }
      if (isBaristaProfile()) {
        const today = formatDateISOClient(new Date());
        const profileName = normalizeOdsAgentName(loggedAgentProfile.name);
        const assignment = getBaristaRecords()
          .filter(record => normalizeOdsAgentName(record.barista || record.agente || record.nome) === profileName)
          .filter(record => !record.data || String(record.data).slice(0, 10) >= today)
          .sort((a, b) => String(a.data || "").localeCompare(String(b.data || "")))[0];
        const targetResidence = getShiftResidence(assignment?.corsa) ||
          Object.keys(globalData?.residenze || {}).find(name => name.trim().toLowerCase() === "desenzano") ||
          Object.keys(globalData?.residenze || {})[0];
        if (!targetResidence) return false;
        selectResidence(targetResidence);
        pinnedAgentIdx = null;
        renderTable();
        updateLoginUserPanel();
        return true;
      }
      if (!loggedAgentProfile || !globalData?.residenze?.[loggedAgentProfile.residence]) return false;
      selectResidence(loggedAgentProfile.residence);
      const index = findLoggedAgentIndex();
      if (index < 0) return false;
      // L'agente collegato resta in cima, ma viene pinnato solo quando lo seleziona.
      pinnedAgentIdx = null;
      renderTable();
      return true;
    }

    function repinLoggedAgent() {
      if (!loggedAgentProfile || !globalData) return;
      if (String(loggedAgentProfile.id || "") === "MOVIMENTO") return;
      if (isBaristaProfile()) return;
      if (currentResidence !== loggedAgentProfile.residence) {
        selectResidence(loggedAgentProfile.residence);
      }
      const index = findLoggedAgentIndex();
      if (index < 0) return;
      pinnedAgentIdx = index;
      renderTable();
    }

    function clearPinnedAgentSelection() {
      pinnedAgentIdx = null;
      selectedCrewAgent = null;
      document.querySelectorAll("#tbody tr.pinned-row").forEach(row => row.classList.remove("pinned-row"));
    }

    function logoutAgent() {
      localStorage.removeItem(AGENT_LOGIN_STORAGE_KEY);
      localStorage.removeItem("navidiaria.activeAgent");
      loggedAgentProfile = null;
      pinnedAgentIdx = null;
      location.href = "index.html";
    }

    const turniMappaResidenze = {
      "desenzano": ["D1", "D2", "D3", "D4", "BIS", "TERRA"],
      "maderno": ["T1", "T2", "M1", "TERRA"],
      "riva": ["R1", "R2", "R3", "R4", "CAR"],
      "peschiera": ["P1", "P2", "P3", "CAP", "SR1"]
    };

    const serviziTerraPerResidenza = {
      DESENZANO: ["AGB", "DT", "POND"],
      MADERNO: ["AGM", "AGT", "PONM"]
    };
    const ordineServiziTerra = { AGB: 1, DT: 2, POND: 3, AGM: 1, AGT: 2, PONM: 3 };
    const etichetteServiziTerra = { AGB: "AgB", DT: "DT", POND: "PonD", AGM: "AgM", AGT: "AgT", PONM: "PonM" };

    function getCrewShiftKey(shiftValue) {
      const cleanShift = ottieniTurnoPulito(shiftValue).toUpperCase();
      if (cleanShift === "TERRA") {
        const residenceKey = String(currentResidence || "").trim().toUpperCase();
        return serviziTerraPerResidenza[residenceKey] ? `TERRA_${residenceKey}` : "TERRA";
      }
      const groundResidence = Object.entries(serviziTerraPerResidenza)
        .find(([, shifts]) => shifts.includes(cleanShift))?.[0];
      return groundResidence ? `TERRA_${groundResidence}` : cleanShift;
    }

    function isGroundCrewShiftKey(shiftValue) {
      return getCrewShiftKey(shiftValue).startsWith("TERRA_");
    }

    function getCrewRequirementKey(shiftValue) {
      return isGroundCrewShiftKey(shiftValue) ? "TERRA" : getCrewShiftKey(shiftValue);
    }

    function isSameCrewShift(firstShift, secondShift) {
      const firstKey = getCrewShiftKey(firstShift);
      return Boolean(firstKey) && firstKey === getCrewShiftKey(secondShift);
    }

    function getShiftResidence(shiftValue) {
      const rawShift = ottieniTurnoPulito(shiftValue).toUpperCase();
      const groundResidence = Object.entries(serviziTerraPerResidenza)
        .find(([, shifts]) => shifts.includes(rawShift))?.[0];
      if (groundResidence) {
        return Object.keys(globalData?.residenze || {}).find(residence =>
          residence.toUpperCase().trim() === groundResidence
        ) || groundResidence;
      }
      if (rawShift === "TERRA") return currentResidence;
      const cleanShift = getCrewShiftKey(rawShift);
      const match = Object.entries(turniMappaResidenze).find(([, shifts]) =>
        shifts.some(shift => getCrewShiftKey(shift) === cleanShift)
      );
      if (!match) return "";
      return Object.keys(globalData?.residenze || {}).find(residence =>
        residence.toLowerCase().trim() === match[0]
      ) || match[0].toUpperCase();
    }

    const defaultCrewRequirements = {
      DESENZANO: { D1: 4, D2: 5, D3: 5, D4: 3, BIS: 3, TERRA: 3 },
      MADERNO: { T1: 5, T2: 5, M1: 3, TERRA: 3 },
      RIVA: { R1: 4, R2: 5, R3: 5, R4: 4, CAR: 3 },
      PESCHIERA: { P1: 5, P2: 5, P3: 4, CAP: 3, SR1: 4 }
    };

    const dateCalendario = [];
    const settimaneInfo = [];

    const nomiGiorni = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
    const nomiGiorniCompleti = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
    const mesiNomi = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre",
      "novembre", "dicembre"
    ];

    const gradeInfo = {
      "grado-capitano": { label: "Capitano", color: "#facc15" },
      "grado-capo": { label: "Capo Timoniere", color: "#fb923c" },
      "grado-timoniere": { label: "Timoniere", color: "#22c55e" },
      "grado-aiuto": { label: "Aiuto Motorista", color: "#3b82f6" },
      "grado-motorista": { label: "Motorista", color: "#a855f7" },
      "grado-marinaio": { label: "Marinaio", color: "#9ca3af" },
      "grado-operaio": { label: "Operaio", color: "#14b8a6" }
      ,"grado-barista": { label: "Barista", color: "#f472b6" }
    };

    const shiftBorderColor = {
      "c-d1": "#3b6bcc",
      "c-d2": "#2d9e6b",
      "c-d3": "#e07b3a",
      "c-d4": "#c45cba",
      "c-dt": "#e6d44a",
      "c-bis": "#5ec4d4",
      "c-pond": "#f08080",
      "c-rip": "#6b7280",
      "c-cong": "#a78bfa",
      "c-agb": "#60a5fa",
      "c-fp": "#94a3b8",
      "c-other": "#94a3b8"
    };

    const shiftDurations = {
      D1: "13 ore", D2: "11 ore 25 min", D3: "13 ore 20 min", D4: "13 ore 15 min",
      T1: "13 ore 35 min", T2: "12 ore 29 min", M1: "13 ore 30 min",
      R1: "13 ore 15 min", R2: "13 ore 15 min", R3: "12 ore 20 min", R4: "12 ore 40 min",
      CAR: "12 ore 10 min", CAR1: "12 ore 10 min",
      P1: "12 ore 45 min", P2: "13 ore 5 min", P3: "12 ore 55 min",
      CAP: "12 ore 55 min", CAP1: "12 ore 55 min", SR1: "12 ore 15 min",
      BIS: "12 ore 15 min", AGB: "10 ore 25 min", POND: "9 ore 25 min",
      DT: "9 ore 25 min", PT: "9 ore 30 min", AGM: "9 ore 45 min",
      AGT: "11 ore 10 min", PONM: "10 ore 25 min"
    };

    function getShiftDuration(shiftCode, calInfo) {
      const code = (shiftCode || "").toUpperCase().trim();
      if (code === "DT" && calInfo && calInfo.giornoSett === "Sab") return "9 ore 55 min";
      return shiftDurations[code] || "";
    }

    function getLatestOdsCoverage() {
      const variations = (Array.isArray(globalData?.variazioni_ods) ? globalData.variazioni_ods : [])
        .filter(item => item && item.attiva !== false && /^\d{4}-\d{2}-\d{2}$/.test(String(item.data || "")));
      if (!variations.length) return null;
      const odsNumber = item => Number.parseInt(String(item.ods || "").match(/\d+/)?.[0] || "0", 10);
      const latestNumber = Math.max(...variations.map(odsNumber));
      if (!latestNumber) return null;
      const latestDates = variations
        .filter(item => odsNumber(item) === latestNumber)
        .map(item => String(item.data))
        .sort();
      if (!latestDates.length) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        number: latestNumber,
        from: formatDateISOClient(today),
        until: latestDates[latestDates.length - 1]
      };
    }

    function inizializzaCalendario() {
      dateCalendario.length = 0;
      const odsCoverage = getLatestOdsCoverage();
      let colCounter = 3;
      settimaneInfo.forEach((sett, sIdx) => {
        const baseDate = new Date(sett.year || 2026, sett.month, sett.startDay);
        const count = sett.count || 7;
        for (let g = 0; g < count; g++) {
          const d = new Date(baseDate);
          d.setDate(baseDate.getDate() + g);
          const iso = formatDateISOClient(d);
          dateCalendario.push({
            col: colCounter,
            weekKey: sett.key,
            weekIdx: sIdx,
            dayNum: d.getDate(),
            giornoSett: nomiGiorni[(d.getDay() + 6) % 7],
            isDomenica: d.getDay() === 0,
            labelEstesa: `${nomiGiorniCompleti[(d.getDay() + 6) % 7]} ${d.getDate()} ${mesiNomi[d.getMonth()]}`,
            realObj: d,
            iso,
            isBozza: Boolean(globalData && globalData.bozza_dal && iso >= globalData.bozza_dal),
            odsCoverageNumber: odsCoverage && iso >= odsCoverage.from && iso <= odsCoverage.until
              ? odsCoverage.number
              : null,
            odsCoverageUntil: odsCoverage?.until || ""
          });
          colCounter++;
        }
      });
    }

    function getGradeClass(badge, agentName = "", qualifica = "") {
      const q = String(qualifica || "").trim().toLowerCase();
      const map = {
        "capitano": "grado-capitano",
        "comandante": "grado-capitano",
        "capo timoniere": "grado-capo",
        "capotimoniere": "grado-capo",
        "timoniere": "grado-timoniere",
        "motorista": "grado-motorista",
        "aiuto motorista": "grado-aiuto",
        "aiutomotorista": "grado-aiuto",
        "marinaio": "grado-marinaio",
        "operaio": "grado-operaio"
        ,"barista": "grado-barista"
      };
      return map[q] || "grado-marinaio";
    }

    function ottieniTurnoPulito(v) {
      if (!v) return "";
      let txt = v.toUpperCase().trim().replace(/\*/g, "").replace(/--/g, "");
      if (txt === "" || txt === "RIP" || txt === "RIP." || txt === "----") return "";

      let match = txt.match(/(?:^C)?([DRMP]\d|BIS|POND|PONM|AGB|AGM|AGT|T1|M1|DT|T2|CAR|CAP|SR1)(?:C|$)/i);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }
      return txt;
    }

    function classify(v) {
      if (!v || v === "") return null;
      let uPulito = ottieniTurnoPulito(v);
      if (uPulito === "") return "c-rip";

      if (/^D1/.test(uPulito) || /^R1/.test(uPulito) || /^P1/.test(uPulito)) return "c-d1";
      if (/^D2/.test(uPulito) || /^R2/.test(uPulito) || /^P2/.test(uPulito)) return "c-d2";
      if (/^D3/.test(uPulito) || /^R3/.test(uPulito) || /^P3/.test(uPulito)) return "c-d3";
      if (/^D4/.test(uPulito) || /^R4/.test(uPulito) || /^P4/.test(uPulito)) return "c-d4";
      if (/^T1/.test(uPulito)) return "c-d1";
      if (/^T2/.test(uPulito)) return "c-d2";
      if (/^M1/.test(uPulito)) return "c-d3";
      if (/^DT/.test(uPulito)) return "c-dt";
      if (/^BIS/.test(uPulito)) return "c-bis";
      if (/^POND/.test(uPulito)) return "c-pond";
      if (/^AGB/.test(uPulito)) return "c-agb";
      if (uPulito.startsWith("CONG") || uPulito === "CON;") return "c-cong";
      if (uPulito === "FP" || uPulito === "F.P." || uPulito === "CORSO") return "c-fp";
      return "c-other";
    }

    function pill(v) {
      if (!v || v.trim() === "" || v.trim() === "----" || v.trim().toLowerCase() === "rip" || v.trim().toLowerCase() === "rip.") {
        return '<span class="cell-pill c-rip">rip</span>';
      }
      const cls = classify(v);
      if (!cls) return `<span style="color:#3a3f50">${v}</span>`;
      return `<span class="cell-pill ${cls}">${v}</span>`;
    }

    function isTodayDate(dateObj) {
      const a = new Date(dateObj);
      const b = new Date();
      a.setHours(0, 0, 0, 0);
      b.setHours(0, 0, 0, 0);
      return a.getTime() === b.getTime();
    }

    function formatTodayMenuLabel() {
      return new Intl.DateTimeFormat("it-IT", {
        weekday:"short",
        day:"2-digit",
        month:"short"
      }).format(new Date()).replace(/\./g, "").toLocaleUpperCase("it");
    }

    function buildTableHeader() {
      const container = document.getElementById("thead-container");
      let html = `<tr class="date-header"><th>Agente</th>`;
      dateCalendario.forEach(d => {
        const clsArr = [];
        clsArr.push(d.weekIdx % 2 === 0 ? "week-even" : "week-odd");
        if (d.giornoSett === "Lun") clsArr.push("week-start");
        if (d.giornoSett === "Dom") clsArr.push("week-end");
        if (isTodayDate(d.realObj)) clsArr.push("today-col");
        if (d.isBozza) clsArr.push("bozza-col");
        const currentIndex = dateCalendario.indexOf(d);
        if (d.isBozza && dateCalendario[currentIndex - 1]?.isBozza !== true) {
          clsArr.push("bozza-start");
        }
        const cls = `class="${clsArr.join(" ")}"`;
        const markers = `${d.isBozza ? '<span class="date-head-draft" aria-label="Bozza" title="Bozza"></span>' : ''}${d.odsCoverageNumber ? `<span class="date-head-ods" aria-label="Coperto dall’ODS ${d.odsCoverageNumber}" title="Coperto dall’ODS ${d.odsCoverageNumber} fino al ${d.odsCoverageUntil.split('-').reverse().join('/')}"></span>` : ''}`;
        html += `<th ${cls} data-col="${d.col}" onclick="eseguiRicercaHeader(${d.col})"><span class="date-head-day">${d.giornoSett}</span><span class="date-head-num">${d.dayNum}</span>${markers ? `<span class="date-head-markers">${markers}</span>` : ''}</th>`;
      });
      html += `</tr>`;
      container.innerHTML = html;
    }

    function eseguiRicercaHeader(colonnaCliccata) {
      if (isEditMode) return;
      clearPinnedAgentSelection();
      placeDayPanel("main");
      let cal = dateCalendario.find(c => c.col === colonnaCliccata);
      if (!cal) return;
      if (!activeShiftFilter) {
        const residenceKey = currentResidence.toLowerCase().trim();
        const availableShifts = turniMappaResidenze[residenceKey] || [];
        activeShiftFilter = availableShifts[0] || null;
        if (!activeShiftFilter) return;
        generaFiltriTurnoRiferimento();
      }
      selectDay(cal.col, cal.labelEstesa, activeShiftFilter);
    }

    function selectDayForPinnedAgent(cal) {
      const agent = pinnedAgentIdx !== null ? currentAgentsList[pinnedAgentIdx] : null;
      if (!agent || !cal) return;
      const dayIndex = (cal.col - 3) % 7;
      const weeklyShifts = agent.turni_settimanali[cal.weekKey] || [];
      const rawShift = weeklyShifts[dayIndex] || "rip";
      const cleanShift = ottieniTurnoPulito(rawShift);

      activeShiftFilter = getCrewShiftKey(cleanShift) || null;
      generaFiltriTurnoRiferimento();
      selectDay(cal.col, cal.labelEstesa, rawShift, agent);
    }

    function generaFiltriTurnoRiferimento() {
      if (isEditMode) {
        document.getElementById("shift-filter-container").style.display = "none";
        return;
      }
      const wrapper = document.getElementById("shift-buttons-wrapper");
      wrapper.innerHTML = "";

      const chiaveResidenza = currentResidence.toLowerCase().trim();
      const turniFiltrati = turniMappaResidenze[chiaveResidenza] || [];

      if (turniFiltrati.length === 0 || !currentResidence) {
        document.getElementById("shift-filter-container").style.display = "none";
        return;
      }

      document.getElementById("shift-filter-container").style.display = "flex";

      turniFiltrati.forEach(t => {
        const btn = document.createElement("button");
        btn.className = "shift-filter-btn";
        btn.textContent = t;
        if (getCrewShiftKey(activeShiftFilter) === getCrewShiftKey(t)) btn.classList.add("active");

        btn.addEventListener("click", () => {
          clearPinnedAgentSelection();
          if (getCrewShiftKey(activeShiftFilter) === getCrewShiftKey(t)) {
            activeShiftFilter = null;
          } else {
            activeShiftFilter = t;
          }
          generaFiltriTurnoRiferimento();
          renderTable();
          if (activeShiftFilter) {
            placeDayPanel("main");
            goToToday();
            setTimeout(scrollCrewPanelIntoView, 80);
          } else {
            clearSelection();
          }
        });
        wrapper.appendChild(btn);
      });
    }

    function scheduleCoverageRender() {
      if (coverageRenderHandle !== null) {
        if ("cancelIdleCallback" in window) cancelIdleCallback(coverageRenderHandle);
        else clearTimeout(coverageRenderHandle);
      }
      const run = () => {
        coverageRenderHandle = null;
        renderCoverageTable();
      };
      coverageRenderHandle = "requestIdleCallback" in window
        ? requestIdleCallback(run, { timeout: 900 })
        : setTimeout(run, 120);
    }

    function renderTable() {
      const tbody = document.getElementById("tbody");
      tbody.innerHTML = "";
      trElements = [];
      crewCompletenessCache.clear();
      const fragment = document.createDocumentFragment();

      const loggedIndex = findLoggedAgentIndex();
      const loggedLocation = getLoggedAgentLocation();
      const orderedIndexes = [];
      const alreadyOrdered = new Set();
      if (loggedIndex >= 0) { orderedIndexes.push(loggedIndex); alreadyOrdered.add(loggedIndex); }
      if (pinnedAgentIdx !== null && pinnedAgentIdx !== loggedIndex && currentAgentsList[pinnedAgentIdx]) {
        orderedIndexes.push(pinnedAgentIdx);
        alreadyOrdered.add(pinnedAgentIdx);
      }
      currentAgentsList.forEach((agent, index) => { if (!alreadyOrdered.has(index)) orderedIndexes.push(index); });

      if (loggedLocation && loggedLocation.residence !== currentResidence) {
        const loggedRow = createRowDOM(
          loggedLocation.agent,
          loggedLocation.index,
          false,
          loggedLocation.residence,
          true
        );
        loggedRow.classList.remove("temporary-transfer-row");
        loggedRow.classList.add("cross-residence-logged-row");
        const referenceLabel = loggedRow.querySelector(".transfer-table-label");
        if (referenceLabel) referenceLabel.textContent = `La mia riga · ${loggedLocation.residence}`;
        fragment.appendChild(loggedRow);
        trElements.push(loggedRow);
      }

      orderedIndexes.forEach(ri => {
        const agenteObj = currentAgentsList[ri];
        const tr = createRowDOM(agenteObj, ri, ri === pinnedAgentIdx);
        fragment.appendChild(tr);
        trElements.push(tr);
      });
      tbody.appendChild(fragment);

      hidePastColumns();
      highlightSharedCrewDays();
      requestAnimationFrame(updateLoggedStickyOffset);
      scheduleCoverageRender();
    }

    function highlightSharedCrewDays() {
      document.querySelectorAll("#tbody tr.has-shared-crew").forEach(row => row.classList.remove("has-shared-crew"));
      document.querySelectorAll("#tbody td.shared-crew-day, #tbody td.pinned-shared-crew-day, #tbody td.departed-crew-day").forEach(cell => {
        cell.classList.remove("shared-crew-day", "pinned-shared-crew-day", "departed-crew-day");
        cell.querySelector(".shared-crew-change-label")?.remove();
        if (cell.dataset.sharedCrewPreviousTitle) cell.title = cell.dataset.sharedCrewPreviousTitle;
        else cell.removeAttribute("title");
        delete cell.dataset.sharedCrewTitle;
        delete cell.dataset.sharedCrewPreviousTitle;
      });
      const loggedLocation = getLoggedAgentLocation();
      if (!loggedLocation) return;
      const loggedIndex = findLoggedAgentIndex();
      const loggedAgent = loggedLocation.agent;
      const loggedRow = document.querySelector("#tbody tr.logged-agent-row");
      const pinnedAgent = pinnedAgentIdx !== null ? currentAgentsList[pinnedAgentIdx] : null;
      if (!loggedAgent || !loggedRow) return;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const markSharedCell = (row, cal, title) => {
        const cell = row?.querySelector(`td[data-col="${cal.col}"]`);
        if (!cell) return;
        row.classList.add("has-shared-crew");
        cell.classList.add("shared-crew-day");
        cell.dataset.sharedCrewPreviousTitle = cell.title || "";
        cell.dataset.sharedCrewTitle = title;
        cell.title = cell.title ? `${cell.title} · ${title}` : title;
      };

      const markDepartedCell = (row, cal, originalShift, updatedShift, variation) => {
        const cell = row?.querySelector(`td[data-col="${cal.col}"]`);
        if (!cell) return;
        const original = getCrewShiftKey(originalShift).replace(/^TERRA_/, "TERRA ");
        const updated = getCrewShiftKey(updatedShift).replace(/^TERRA_/, "TERRA ") || "RIPOSO";
        const ods = variation?.ods ? ` · ODS ${variation.ods}` : "";
        const title = `Ha lasciato ${original} per ${updated}${ods}`;
        cell.classList.add("departed-crew-day");
        cell.dataset.sharedCrewPreviousTitle = cell.title || "";
        cell.dataset.sharedCrewTitle = title;
        cell.title = cell.title ? `${cell.title} · ${title}` : title;
        const label = document.createElement("span");
        label.className = "shared-crew-change-label";
        label.textContent = `da ${original}`;
        cell.appendChild(label);
      };

      dateCalendario.forEach(cal => {
        const calendarDay = new Date(cal.realObj);
        calendarDay.setHours(0, 0, 0, 0);
        if (!Number.isFinite(calendarDay.getTime())) return;
        const dayIndex = (cal.col - 3) % 7;
        const loggedRaw = (loggedAgent.turni_settimanali[cal.weekKey] || [])[dayIndex] || "rip";
        const loggedShift = ottieniTurnoPulito(loggedRaw);
        if (!getShiftResidence(loggedShift)) return;

        if (pinnedAgent && pinnedAgent !== loggedAgent) {
          const pinnedRaw = (pinnedAgent.turni_settimanali?.[cal.weekKey] || [])[dayIndex] || "rip";
          const pinnedShift = ottieniTurnoPulito(pinnedRaw);
          if (getShiftResidence(pinnedShift) && isSameCrewShift(loggedShift, pinnedShift)) {
            loggedRow.querySelector(`td[data-col="${cal.col}"]`)?.classList.add("pinned-shared-crew-day");
          }
        }

        const matchingIndexes = [];
        const departedIndexes = [];
        currentAgentsList.forEach((agent, index) => {
          if (index === loggedIndex) return;
          const colleagueRaw = (agent.turni_settimanali[cal.weekKey] || [])[dayIndex] || "rip";
          const colleagueShift = ottieniTurnoPulito(colleagueRaw);
          if (getShiftResidence(colleagueShift) && isSameCrewShift(loggedShift, colleagueShift)) matchingIndexes.push(index);
          const variation = agent.variazioni_ods?.[cal.iso];
          if (!variation) return;
          const originalShift = ottieniTurnoPulito(variation.turno_originale);
          const updatedShift = ottieniTurnoPulito(variation.turno_nuovo);
          if (isSameCrewShift(loggedShift, originalShift) && !isSameCrewShift(loggedShift, updatedShift)) {
            departedIndexes.push({ index, originalShift, updatedShift, variation });
          }
        });
        const departedSet = new Set(departedIndexes.map(item => item.index));
        for (let index = matchingIndexes.length - 1; index >= 0; index--) {
          if (departedSet.has(matchingIndexes[index])) matchingIndexes.splice(index, 1);
        }
        if (!matchingIndexes.length && !departedIndexes.length) return;

        const label = getCrewShiftKey(loggedShift).replace(/^TERRA_/, "TERRA ");
        matchingIndexes.forEach(index => {
          const colleagueRow = trElements.find(row =>
            row.dataset.residence === currentResidence && parseInt(row.dataset.rowIndex) === index
          );
          markSharedCell(colleagueRow, cal, `Turno ${label} in comune con ${loggedAgent.agente}`);
        });
        departedIndexes.forEach(({ index, originalShift, updatedShift, variation }) => {
          const colleagueRow = trElements.find(row =>
            row.dataset.residence === currentResidence && parseInt(row.dataset.rowIndex) === index
          );
          markDepartedCell(colleagueRow, cal, originalShift, updatedShift, variation);
        });
      });
    }

    function hasCurrentOrFutureSharedCrewWithLogged(agent) {
      const loggedLocation = getLoggedAgentLocation();
      const loggedAgent = loggedLocation?.agent;
      if (!agent || !loggedAgent || agent === loggedAgent) return false;

      // Il pallino riguarda esclusivamente collaborazioni da oggi in avanti.
      // La data ISO locale evita che il fuso orario trasformi "oggi" in ieri.
      const now = new Date();
      const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const effectiveShift = (person, cal, dayIndex) => {
        const weeklyShift = (person.turni_settimanali?.[cal.weekKey] || [])[dayIndex] || "rip";
        const odsShift = person.variazioni_ods?.[cal.iso]?.turno_nuovo;
        return ottieniTurnoPulito(odsShift || weeklyShift);
      };

      return dateCalendario.some(cal => {
        if (!cal.iso || cal.iso < todayIso) return false;
        const dayIndex = (cal.col - 3) % 7;
        const loggedShift = effectiveShift(loggedAgent, cal, dayIndex);
        const colleagueShift = effectiveShift(agent, cal, dayIndex);
        const shiftKey = getCrewShiftKey(loggedShift);

        // Riposi e servizi di terra non generano il pallino equipaggio.
        if (!getShiftResidence(loggedShift) || shiftKey.startsWith("TERRA_")) return false;
        return isSameCrewShift(loggedShift, colleagueShift);
      });
    }

    function updateLoggedStickyOffset() {
      const dateHeader = document.querySelector(".date-header");
      const height = dateHeader ? Math.ceil(dateHeader.getBoundingClientRect().height) : 38;
      document.documentElement.style.setProperty("--logged-row-sticky-top", height + "px");
    }
    window.addEventListener("resize", updateLoggedStickyOffset);

    function getCrewRequirements(residence) {
      const key = String(residence || "").trim().toUpperCase();
      let requirements = { ...(defaultCrewRequirements[key] || {}) };
      try {
        const saved = JSON.parse(localStorage.getItem(`ggnl_turni_requisiti_${residence}`) || "{}");
        requirements = { ...requirements, ...saved };
      } catch (e) {
        // Mantiene i requisiti predefiniti se le preferenze locali non sono valide.
      }
      return requirements;
    }

    function getCrewDeficiencies(crew, shift, residence = currentResidence) {
      if (!shift || shift === "RIPOSO") return { required:null, incomplete:false };
      const requirements = getCrewRequirements(residence);
      const shiftKey = getCrewRequirementKey(shift);
      const requiredValue = requirements[shiftKey] ?? requirements[String(shiftKey).toUpperCase()];
      const required = requiredValue == null || requiredValue === "" ? null : parseInt(requiredValue, 10);
      if (required == null || Number.isNaN(required)) return { required:null, incomplete:false };
      const operatingCrew = crew.filter(person => !person.isBarista);
      return { required, incomplete:operatingCrew.length < required };
    }

    function getCrewBaristas(calInfo, shift) {
      const cleanShift = ottieniTurnoPulito(shift).toUpperCase();
      if (!calInfo?.iso || !["D2", "D3", "P2", "P3"].includes(cleanShift)) return [];
      const records = Array.isArray(globalData?.bariste)
        ? globalData.bariste
        : (Array.isArray(globalData?.barista) ? globalData.barista : []);
      return records.filter(item => {
        const active = item.attiva !== false && !/^(no|false|0)$/i.test(String(item.attiva || ""));
        return active && String(item.data || "").slice(0, 10) === calInfo.iso &&
          String(item.corsa || "").trim().toUpperCase() === cleanShift &&
          String(item.barista || item.agente || item.nome || "").trim();
      });
    }

    function getCrewStatusForDate(cal, shiftValue) {
      const emptyStatus = { incomplete:false, overstaffed:false, hasTransfer:false };
      if (!cal || !currentResidence) return emptyStatus;
      const cleanShift = getCrewShiftKey(shiftValue);
      const residenceKey = currentResidence.trim().toLowerCase();
      const validShifts = turniMappaResidenze[residenceKey] || [];
      if (!validShifts.some(shift => getCrewShiftKey(shift) === cleanShift)) return emptyStatus;

      const requirements = getCrewRequirements(currentResidence);
      const requirementKey = getCrewRequirementKey(cleanShift);
      const requiredValue = requirements[requirementKey];
      const required = requiredValue == null || requiredValue === "" ? null : parseInt(requiredValue, 10);
      if (required == null || Number.isNaN(required)) return emptyStatus;

      const cacheKey = `${currentResidence}|${cal.col}|${cleanShift}|${required}`;
      if (crewCompletenessCache.has(cacheKey)) return crewCompletenessCache.get(cacheKey);

      const dayIndex = (cal.col - 3) % 7;
      let count = 0;
      let hasTransfer = false;
      Object.entries(globalData.residenze || {}).forEach(([residence, agents]) => {
        (agents || []).forEach(agent => {
          const rawShift = (agent.turni_settimanali?.[cal.weekKey] || [])[dayIndex] || "rip";
          if (isSameCrewShift(rawShift, cleanShift)) {
            count++;
            const rawUpper = String(rawShift).trim().toUpperCase();
            if (residence !== currentResidence || rawUpper.startsWith("C") || rawUpper.endsWith("C")) {
              hasTransfer = true;
            }
          }
        });
      });
      const status = {
        incomplete:count < required,
        overstaffed:count > required,
        hasTransfer
      };
      crewCompletenessCache.set(cacheKey, status);
      return status;
    }

    function toggleCrewMinimumPanel() {
      const panel = document.getElementById("crew-minimum-panel");
      const button = document.getElementById("crew-minimum-toggle");
      if (!panel) return;
      const isOpen = panel.classList.toggle("open");
      button?.classList.toggle("active", isOpen);
      if (isOpen) renderCrewMinimumControls();
    }

    function renderCrewMinimumControls() {
      const grid = document.getElementById("crew-minimum-grid");
      if (!grid || !currentResidence) return;
      const residenceKey = currentResidence.trim().toLowerCase();
      const shifts = getResidenceCrewShifts();
      const requirements = getCrewRequirements(currentResidence);
      grid.innerHTML = shifts.map(shift => {
        const value = requirements[shift] ?? requirements[String(shift).toUpperCase()] ?? "";
        return `<label class="crew-minimum-item"><span>${shift}</span><input class="crew-minimum-input" type="number" min="1" max="20" inputmode="numeric" value="${escapeAttribute(value)}" aria-label="Minimo equipaggio ${shift}" onchange="updateCrewMinimum('${shift}', this.value)"></label>`;
      }).join("");
    }

    function updateCrewMinimum(shift, rawValue) {
      if (!currentResidence) return;
      const storageKey = `ggnl_turni_requisiti_${currentResidence}`;
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch (e) { saved = {}; }
      const value = String(rawValue).trim();
      if (value === "") {
        delete saved[shift];
      } else {
        saved[shift] = Math.max(1, Math.min(20, parseInt(value, 10) || 1));
      }
      localStorage.setItem(storageKey, JSON.stringify(saved));
      renderTable();
      const selectedCal = dateCalendario.find(cal => cal.col === selectedCol);
      if (selectedCal) selectDay(selectedCal.col, selectedCal.labelEstesa, selectedShiftValue);
    }

    function escapeAttribute(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    const odsPdfFiles = {
      "16/2026": "O.d.S. n. 16-2026 ESTATE.pdf",
      "18/2026": "O.d.S. n. 18-2026.pdf",
      "19/2026": "O.d.S. n. 19-2026.pdf",
      "20/2026": "O.d.S. n. 20-2026.pdf",
      "21/2026": "O.d.S. n. 21-2026.pdf",
      "22/2026": "O.d.S. n. 22-2026.pdf",
      "23/2026": "O.d.S. n. 23-2026.pdf",
      "24/2026": "O.d.S. n. 24-2026.pdf",
      "25/2026": "O.d.S. n. 25-2026 firmato.pdf",
      "26/2026": "O.d.S. n. 26-2026.pdf"
    };

    function getOdsPdfHref(ods) {
      const fileName = odsPdfFiles[String(ods || "").trim()];
      if (fileName) return `ods/${encodeURIComponent(fileName)}`;
      return String(ods || "").trim() ? "turni.html#ods-docs" : "";
    }

    function renderAgentOdsBadge(variation) {
      if (!variation) return "";
      const ods = escapeAttribute(variation.ods || "ODS");
      const original = escapeAttribute(normalizeOdsShift(variation.turno_originale).toUpperCase());
      const updated = escapeAttribute(normalizeOdsShift(variation.turno_nuovo).toUpperCase());
      const href = getOdsPdfHref(variation.ods);
      const label = `ODS ${ods} · ${original} → ${updated}`;
      const change = `${original} → ${updated}`;
      return href
        ? `<a class="agent-ods-badge" href="${href}" target="_blank" rel="noopener" title="${label}">${change}</a>`
        : `<span class="agent-ods-badge" title="${label}">${change}</span>`;
    }

    function getShipDayInfo(calInfo, shift) {
      const cleanShift = ottieniTurnoPulito(shift).toUpperCase();
      if (!calInfo?.iso || !cleanShift || !Array.isArray(globalData?.turni_navi)) return null;
      return globalData.turni_navi.find(item => {
        const active = item.attiva !== false && !/^(no|false|0)$/i.test(String(item.attiva || ""));
        return active && String(item.data || "").slice(0, 10) === calInfo.iso &&
          String(item.corsa || "").trim().toUpperCase() === cleanShift;
      }) || null;
    }

    function renderShipDayInfo(calInfo, shift) {
      const info = getShipDayInfo(calInfo, shift);
      if (!info) return "";
      const ship = escapeAttribute(info.nave || "Non indicata");
      const refuel = /^(sì|si|true|1)$/i.test(String(info.rifornimento_mattina || "").trim());
      const mooring = String(info.ormeggio_serale || "").trim();
      return `<div class="ship-day-info" aria-label="Dati nave della giornata">
        <span class="ship-day-badge"><strong>Nave</strong>${ship}</span>
        ${mooring ? `<span class="ship-day-badge mooring"><strong>Ormeggio serale</strong>${escapeAttribute(mooring)}</span>` : ''}
        ${refuel ? '<span class="ship-day-badge refuel">⛽ Rifornimento</span>' : ''}
      </div>`;
    }

    function appendCrewOdsVariations(container, calInfo, selectedShift) {
      if (!container || !calInfo) return;
      const targetShift = getCrewShiftKey(selectedShift);
      if (!targetShift) return;
      const matches = [];

      Object.values(globalData.residenze || {}).forEach(agents => {
        (agents || []).forEach(agent => {
          const variation = agent.variazioni_ods?.[calInfo.iso];
          if (!variation) return;
          const originalShift = ottieniTurnoPulito(variation.turno_originale).toUpperCase();
          const newShift = ottieniTurnoPulito(variation.turno_nuovo).toUpperCase();
          if (!isSameCrewShift(originalShift, targetShift) || isSameCrewShift(newShift, targetShift)) return;
          matches.push({ agent, variation });
        });
      });

      if (!matches.length) return;
      const box = document.createElement("div");
      box.className = "departed-crew-group";
      box.innerHTML = `<div class="departed-crew-list">${matches.map(({ agent, variation }) => {
        const ods = escapeAttribute(variation.ods || "ODS");
        const original = escapeAttribute(normalizeOdsShift(variation.turno_originale).toUpperCase());
        const updated = escapeAttribute(normalizeOdsShift(variation.turno_nuovo).toUpperCase());
        const href = getOdsPdfHref(variation.ods);
        const variationLabel = `${original} → ${updated}`;
        const variationBadge = href
          ? `<a class="agent-ods-badge departed-ods-badge" href="${href}" target="_blank" rel="noopener" title="Apri ODS ${ods}">${variationLabel}</a>`
          : `<span class="agent-ods-badge departed-ods-badge" title="ODS ${ods}">${variationLabel}</span>`;
        const gradeClass = getGradeClass(agent.id, agent.agente, agent.qualifica);
        const grade = gradeInfo[gradeClass] || { label:"Marinaio", color:"#9ca3af" };
        return `<div class="colleague-card departed-card" style="border-left-color:${grade.color};"><span class="c-num">${escapeAttribute(agent.id || "—")}</span><span class="c-name">${escapeAttribute(agent.agente)}${variationBadge}</span><span class="c-grade" style="color:${grade.color};background:${grade.color}22;border:1px solid ${grade.color}44;">${grade.label}</span></div>`;
      }).join("")}</div>`;
      container.appendChild(box);
    }

    function getCalendarVisualClasses(cal, index) {
      const classes = [cal.weekIdx % 2 === 0 ? "week-even" : "week-odd"];
      if (cal.giornoSett === "Lun") classes.push("week-start");
      if (cal.giornoSett === "Dom") classes.push("week-end");
      if (isTodayDate(cal.realObj)) classes.push("today-col");
      if (cal.isBozza) classes.push("bozza-col");
      if (cal.isBozza && dateCalendario[index - 1]?.isBozza !== true) classes.push("bozza-start");
      return classes.join(" ");
    }

    function renderCoverageTable() {
      const section = document.getElementById("coverage-section");
      const thead = document.getElementById("coverage-thead");
      const tbody = document.getElementById("coverage-tbody");
      if (!section || !thead || !tbody || !globalData || !currentResidence) return;

      const residenceKey = currentResidence.trim().toLowerCase();
      const shifts = turniMappaResidenze[residenceKey] || [];
      const requirements = getCrewRequirements(currentResidence);
      document.getElementById("coverage-title").textContent = `Completezza equipaggi — ${currentResidence}`;
      const shiftButtons = document.getElementById("coverage-shift-buttons");
      if (shiftButtons) {
        shiftButtons.innerHTML = shifts.map(shift =>
          `<button class="coverage-shift-btn" type="button" data-shift="${shift}" onclick="switchCoverageShift('${shift}')">${shift}</button>`
        ).join("");
        updateCoverageShiftButtons(ottieniTurnoPulito(selectedShiftValue));
      }
      const residenceButtons = document.getElementById("coverage-residence-buttons");
      if (residenceButtons) {
        residenceButtons.innerHTML = Object.keys(globalData.residenze || {}).map(residence =>
          `<button class="coverage-residence-btn ${residence === currentResidence ? "active" : ""}" data-res="${escapeAttribute(residence)}" type="button" onclick="selectCoverageResidence(decodeURIComponent('${encodeURIComponent(residence)}'))">${residence}</button>`
        ).join("");
      }
      if (document.getElementById("crew-minimum-panel")?.classList.contains("open")) {
        renderCrewMinimumControls();
      }

      thead.innerHTML = `<tr><th>Corsa</th>${dateCalendario.map((cal, index) =>
        `<th data-col="${cal.col}" class="${getCalendarVisualClasses(cal, index)}"><span class="date-head-day">${cal.giornoSett}</span><span class="date-head-num">${cal.dayNum}</span>${cal.isBozza || cal.odsCoverageNumber ? `<span class="date-head-markers">${cal.isBozza ? '<span class="date-head-draft" aria-label="Bozza" title="Bozza"></span>' : ''}${cal.odsCoverageNumber ? `<span class="date-head-ods" aria-label="Coperto dall’ODS ${cal.odsCoverageNumber}" title="Coperto dall’ODS ${cal.odsCoverageNumber} fino al ${cal.odsCoverageUntil.split('-').reverse().join('/')}"></span>` : ''}</span>` : ''}</th>`
      ).join("")}</tr>`;

      tbody.innerHTML = shifts.map(shift => {
        const shiftColor = shiftBorderColor[classify(shift)] || "#94a3b8";
        const requiredValue = requirements[shift] ?? requirements[shift.toUpperCase()];
        const required = requiredValue === "" || requiredValue == null ? null : parseInt(requiredValue, 10);

        const cells = dateCalendario.map((cal, calIndex) => {
          const dayIndex = (cal.col - 3) % 7;
          const crew = [];
          let hasTransfer = false;
          Object.entries(globalData.residenze || {}).forEach(([residence, agents]) => {
            (agents || []).forEach(agent => {
              const rawShift = (agent.turni_settimanali?.[cal.weekKey] || [])[dayIndex] || "rip";
              if (isSameCrewShift(rawShift, shift)) {
                const rawUpper = String(rawShift).trim().toUpperCase();
                const isTransfer = residence !== currentResidence || rawUpper.startsWith("C") || rawUpper.endsWith("C");
                hasTransfer ||= isTransfer;
                crew.push(isTransfer ? `${agent.agente} (trasferta da ${residence})` : agent.agente);
              }
            });
          });

          const count = crew.length;
          const hasOdsVariation = Object.values(globalData.residenze || {}).some(agents =>
            (agents || []).some(agent => {
              const variation = agent.variazioni_ods?.[cal.iso];
              if (!variation) return false;
              return [variation.turno_originale, variation.turno_nuovo].some(value =>
                isSameCrewShift(value, shift)
              );
            })
          );
          const status = required == null || Number.isNaN(required) ? "unconfigured" :
            count < required ? "incomplete" : count > required ? "overstaffed" : "complete";
          const label = required == null || Number.isNaN(required) ? String(count) : `${count}/${required}`;
          const hasRequirement = required != null && !Number.isNaN(required);
          const cellNotices = [
            hasRequirement && count > required ? "Sovrannumero" : "",
            hasTransfer ? "Trasferta" : "",
            hasOdsVariation ? "Variazione ODS" : ""
          ].filter(Boolean);
          const title = escapeAttribute(
            (crew.length ? crew.join(", ") : "Nessun agente assegnato") +
            (cellNotices.length ? ` · ${cellNotices.join(" · ")}` : "")
          );
          const indicators =
            (hasRequirement ? `<span class="coverage-indicator ${count < required ? "incomplete" : "complete"}"></span>` : "") +
            (hasRequirement && count > required ? `<span class="coverage-indicator overstaffed"></span>` : "") +
            (hasTransfer ? `<span class="coverage-indicator transfer"></span>` : "") +
            (hasOdsVariation ? `<span class="coverage-indicator ods"></span>` : "");
          return `<td data-col="${cal.col}" class="coverage-cell ${status} ${hasTransfer ? "has-transfer" : ""} ${getCalendarVisualClasses(cal, calIndex)}" title="${title}" onclick="openCoverageCrew(${cal.col}, '${shift}')"><span class="coverage-indicators">${indicators}</span><span class="coverage-count">${label}</span></td>`;
        }).join("");

        return `<tr data-shift="${shift}" style="--coverage-shift-color:${shiftColor};--coverage-shift-bg:${shiftColor}24"><td>${shift}</td>${cells}</tr>`;
      }).join("");

      section.style.display = shifts.length ? "block" : "none";
    }

    function getTableGradeRank(tr) {
      const gradeOrder = {
        "grado-capitano": 1,
        "grado-capo": 2,
        "grado-timoniere": 3,
        "grado-motorista": 4,
        "grado-aiuto": 5,
        "grado-marinaio": 6,
        "grado-operaio": 7
      };
      const gradeClass = Object.keys(gradeOrder).find(cls => tr.classList.contains(cls));
      return gradeOrder[gradeClass] || 99;
    }

    function getAgentForTableRow(tr) {
      const rowIndex = parseInt(tr.dataset.rowIndex);
      const residence = tr.dataset.residence || currentResidence;
      return globalData?.residenze?.[residence]?.[rowIndex] || null;
    }

    function getTableRowShift(tr, cal = dateCalendario.find(item => item.col === selectedCol)) {
      const agent = getAgentForTableRow(tr);
      if (!agent || !cal) return "";
      const dayIndex = (cal.col - 3) % 7;
      return ottieniTurnoPulito((agent.turni_settimanali?.[cal.weekKey] || [])[dayIndex] || "rip").toUpperCase();
    }

    function removeTemporaryTransferRows() {
      const temporaryRows = trElements.filter(tr => tr.classList.contains("temporary-transfer-row"));
      temporaryRows.forEach(tr => tr.remove());
      trElements = trElements.filter(tr => !tr.classList.contains("temporary-transfer-row"));
    }

    function importTemporaryTransferRows(calInfo, dayIndex, selectedShift) {
      removeTemporaryTransferRows();
      if (!globalData?.residenze || !calInfo || !selectedShift) return;

      const tbody = document.getElementById("tbody");
      const loggedLocation = getLoggedAgentLocation();
      Object.keys(globalData.residenze).forEach(residence => {
        if (residence === currentResidence) return;

        globalData.residenze[residence].forEach((agent, rowIndex) => {
          if (loggedLocation && residence === loggedLocation.residence && rowIndex === loggedLocation.index) return;
          const shifts = agent.turni_settimanali[calInfo.weekKey] || [];
          const rawShift = shifts[dayIndex] || "rip";
          if (!isSameCrewShift(rawShift, selectedShift)) return;

          const tr = createRowDOM(agent, rowIndex, false, residence, true);
          tbody.appendChild(tr);
          trElements.push(tr);
        });
      });
    }

    function moveSelectedCrewToTop() {
      const tbody = document.getElementById("tbody");
      if (!tbody) return;
      const selectedCal = dateCalendario.find(item => item.col === selectedCol);
      const selectedCrewKey = getCrewShiftKey(selectedShiftValue);
      const selectedIsGroundCrew = isGroundCrewShiftKey(selectedCrewKey);

      trElements.sort((a, b) => {
        const loggedA = a.classList.contains("logged-agent-row") ? 0 : 1;
        const loggedB = b.classList.contains("logged-agent-row") ? 0 : 1;
        if (loggedA !== loggedB) return loggedA - loggedB;
        const pinnedA = a.classList.contains("pinned-row") ? 0 : 1;
        const pinnedB = b.classList.contains("pinned-row") ? 0 : 1;
        if (pinnedA !== pinnedB) return pinnedA - pinnedB;

        const shiftA = getTableRowShift(a, selectedCal);
        const shiftB = getTableRowShift(b, selectedCal);
        const matchA = isSameCrewShift(shiftA, selectedCrewKey) ? 0 : 1;
        const matchB = isSameCrewShift(shiftB, selectedCrewKey) ? 0 : 1;
        if (matchA !== matchB) return matchA - matchB;

        if (matchA === 0 && selectedIsGroundCrew) {
          const serviceDifference = (ordineServiziTerra[shiftA] || 99) -
            (ordineServiziTerra[shiftB] || 99);
          if (serviceDifference !== 0) return serviceDifference;
        }

        const gradeDifference = getTableGradeRank(a) - getTableGradeRank(b);
        if (gradeDifference !== 0) return gradeDifference;

        const agentA = getAgentForTableRow(a);
        const agentB = getAgentForTableRow(b);
        return String(agentA?.agente || "").localeCompare(String(agentB?.agente || ""), "it");
      });

      trElements.forEach(tr => tbody.appendChild(tr));
    }

    function restoreDefaultTableOrder() {
      const tbody = document.getElementById("tbody");
      if (!tbody) return;

      removeTemporaryTransferRows();

      trElements.sort((a, b) => {
        const loggedA = a.classList.contains("logged-agent-row") ? 0 : 1;
        const loggedB = b.classList.contains("logged-agent-row") ? 0 : 1;
        if (loggedA !== loggedB) return loggedA - loggedB;
        const pinnedA = a.classList.contains("pinned-row") ? 0 : 1;
        const pinnedB = b.classList.contains("pinned-row") ? 0 : 1;
        if (pinnedA !== pinnedB) return pinnedA - pinnedB;
        return parseInt(a.dataset.rowIndex) - parseInt(b.dataset.rowIndex);
      });

      trElements.forEach(tr => tbody.appendChild(tr));
    }

    function createRowDOM(agenteObj, ri, isPinned = false, residence = currentResidence, isTemporaryTransfer = false) {
      const tr = document.createElement("tr");
      tr.dataset.rowIndex = ri;
      tr.dataset.residence = residence;
      tr.classList.add(getGradeClass(agenteObj.id, agenteObj.agente, agenteObj.qualifica));
      if (isPinned) tr.classList.add("pinned-row");
      if (ri === findLoggedAgentIndex(residence)) tr.classList.add("logged-agent-row");
      if (isTemporaryTransfer) tr.classList.add("temporary-transfer-row");

      const transferLabel = isTemporaryTransfer ? `<span class="transfer-table-label">Trasferta da ${residence}</span>` : "";
      let html = `<td class="td-name" title="${agenteObj.id || ''} ${agenteObj.agente} — ${agenteObj.qualifica || ''}"><span class="agent-name-text">${agenteObj.agente}</span>${transferLabel}</td>`;
      tr.innerHTML = html;

      tr.querySelector(".td-name").addEventListener("click", () => {
        if (isEditMode) return;
        if (isTemporaryTransfer) return;
        if (pinnedAgentIdx === ri) {
          resetCleanTable();
          return;
        }

        placeDayPanel("main");
        pinnedAgentIdx = ri;
        const todayCal = dateCalendario.find(cal => isTodayDate(cal.realObj));
        renderTable();
        if (todayCal) selectDayForPinnedAgent(todayCal);
        setTimeout(() => {
          scrollCrewPanelIntoView();
        }, 80);
      });

      dateCalendario.forEach(cal => {
        let arrayTurniSettimana = agenteObj.turni_settimanali[cal.weekKey] || ["rip", "rip", "rip", "rip", "rip", "rip",
          "rip"
        ];
        let giornoInternoIdx = (cal.col - 3) % 7;
        let turnoVal = arrayTurniSettimana[giornoInternoIdx] || "rip";

        const td = document.createElement("td");
        const tdClasses = [];
        tdClasses.push(cal.weekIdx % 2 === 0 ? "week-even" : "week-odd");
        if (cal.giornoSett === "Lun") tdClasses.push("week-start");
        if (cal.giornoSett === "Dom") tdClasses.push("week-end");
        if (isTodayDate(cal.realObj)) tdClasses.push("today-col");
        if (cal.isBozza) tdClasses.push("bozza-col");
        const prevCal = dateCalendario[dateCalendario.indexOf(cal) - 1];
        if (cal.isBozza && (!prevCal || !prevCal.isBozza)) tdClasses.push("bozza-start");
          const crewStatus = getCrewStatusForDate(cal, turnoVal);
        const odsVariation = agenteObj.variazioni_ods?.[cal.iso] || null;
        const shipInfo = getShipDayInfo(cal, turnoVal);
        const hasRefuel = /^(sì|si|true|1)$/i.test(String(shipInfo?.rifornimento_mattina || "").trim());
        const hasCrewIndicators = crewStatus.incomplete || crewStatus.overstaffed || crewStatus.hasTransfer || odsVariation;
        if (hasCrewIndicators) tdClasses.push("has-crew-indicators");
        if (hasRefuel) tdClasses.push("has-refuel-indicator");
        td.className = tdClasses.join(" ");
        td.dataset.col = cal.col;
        const cellNotices = [
          crewStatus.overstaffed ? "Sovrannumero" : "",
          crewStatus.hasTransfer ? "Trasferta" : "",
          hasRefuel ? "Rifornimento" : "",
          odsVariation ? `Variazione ODS${odsVariation.ods ? ` ${odsVariation.ods}` : ""}` : ""
        ].filter(Boolean);
        if (cellNotices.length) td.title = cellNotices.join(" · ");

        if (isEditMode) {
          const input = document.createElement("input");
          input.type = "text";
          input.className = "edit-input";
          input.value = turnoVal;
          input.dataset.weekKey = cal.weekKey;
          input.dataset.dayIdx = giornoInternoIdx;
          input.dataset.agentIdx = ri;
          td.appendChild(input);
        } else {
          const crewIndicators = hasCrewIndicators
            ? `<span class="upper-cell-indicators">${crewStatus.incomplete ? '<span class="upper-cell-indicator incomplete"></span>' : ''}${crewStatus.overstaffed ? '<span class="upper-cell-indicator overstaffed"></span>' : ''}${crewStatus.hasTransfer ? '<span class="upper-cell-indicator transfer"></span>' : ''}${odsVariation ? '<span class="upper-cell-indicator ods"></span>' : ''}</span>`
            : "";
          const refuelIndicator = hasRefuel ? '<span class="upper-cell-refuel" aria-label="Rifornimento"></span>' : '';
          td.innerHTML = `${crewIndicators}${refuelIndicator}${pill(turnoVal)}`;
          td.addEventListener("click", () => {
            clearPinnedAgentSelection();
            placeDayPanel("main");
            // Il clic su una cella deve sempre aprire la corsa scritta nella cella,
            // indipendentemente dal filtro o dall'agente selezionato in precedenza.
            selectDay(cal.col, cal.labelEstesa, turnoVal, agenteObj);
          });
          td.addEventListener("pointerenter", event => {
            if (event.pointerType === "touch" || !tr.classList.contains("logged-agent-row")) return;
            highlightCommonColleaguesForMyCell(cal, turnoVal, td);
          });
          td.addEventListener("pointerleave", event => {
            if (event.pointerType === "touch" || !tr.classList.contains("logged-agent-row")) return;
            clearMyCellCommonColleagues();
          });
        }
        tr.appendChild(td);
      });

      tr.addEventListener("pointerenter", event => {
        if (tr.classList.contains("logged-agent-row")) return;
        if (event.pointerType !== "touch" && tr.querySelector("td.shared-crew-day")) {
          setSharedCrewFocus(tr, true);
        }
      });
      tr.addEventListener("pointerleave", event => {
        if (tr.classList.contains("logged-agent-row") || event.pointerType === "touch") return;
        setSharedCrewFocus(tr, false);
      });
      tr.addEventListener("touchstart", () => {
        if (!tr.querySelector("td.shared-crew-day")) return;
        setSharedCrewFocus(tr, true);
      }, { passive:true });

      return tr;
    }

    function clearMyCellCommonColleagues() {
      document.querySelectorAll("#tbody tr.hover-common-colleague").forEach(row => row.classList.remove("hover-common-colleague"));
      document.querySelectorAll("#tbody td.hover-common-cell").forEach(cell => cell.classList.remove("hover-common-cell"));
      document.querySelectorAll(".date-header th.hover-current-cell-date").forEach(th => th.classList.remove("hover-current-cell-date"));
    }

    function highlightCommonColleaguesForMyCell(cal, rawShift, sourceCell) {
      clearMyCellCommonColleagues();
      const shift = ottieniTurnoPulito(rawShift);
      const shiftKey = getCrewShiftKey(shift);
      if (!cal || !shiftKey || isGroundCrewShiftKey(shiftKey)) return;
      const dayIndex = (cal.col - 3) % 7;
      let found = false;
      trElements.forEach(row => {
        if (row.classList.contains("logged-agent-row")) return;
        const agent = getAgentForTableRow(row);
        if (!agent) return;
        const agentShift = (agent.turni_settimanali?.[cal.weekKey] || [])[dayIndex] || "rip";
        const variation = agent.variazioni_ods?.[cal.iso] || null;
        const movedAway = variation &&
          isSameCrewShift(variation.turno_originale, shift) &&
          !isSameCrewShift(variation.turno_nuovo, shift);
        if (!movedAway && isSameCrewShift(agentShift, shift)) {
          row.classList.add("hover-common-colleague");
          row.querySelector(`td[data-col="${cal.col}"]`)?.classList.add("hover-common-cell");
          found = true;
        }
      });
      if (found) {
        sourceCell?.classList.add("hover-common-cell");
        document.querySelector(`.date-header th[data-col="${cal.col}"]`)?.classList.add("hover-current-cell-date");
      }
    }

    function setSharedCrewFocus(row, active) {
      if (!active) {
        row?.classList.remove("shared-crew-focus");
        document.querySelectorAll(".date-header th.hover-shared-date").forEach(th => th.classList.remove("hover-shared-date"));
        return;
      }
      if (!row) return;
      document.querySelectorAll("#tbody tr.shared-crew-focus").forEach(otherRow => {
        if (otherRow !== row) otherRow.classList.remove("shared-crew-focus");
      });
      document.querySelectorAll(".date-header th.hover-shared-date").forEach(th => th.classList.remove("hover-shared-date"));
      row.classList.add("shared-crew-focus");
      row.querySelectorAll("td.shared-crew-day[data-col]").forEach(cell => {
        document.querySelector(`.date-header th[data-col="${cell.dataset.col}"]`)?.classList.add("hover-shared-date");
      });
    }

    function selectDay(col, label, cellShiftValue, focusAgent = null) {
      if (isEditMode) return;
      const clickedShiftKey = getCrewShiftKey(ottieniTurnoPulito(cellShiftValue));
      const selectedShiftKey = getCrewShiftKey(ottieniTurnoPulito(selectedShiftValue));
      if (selectedCol === col && clickedShiftKey === selectedShiftKey) {
        clearSelection();
        return;
      }
      // Ogni nuova selezione usa il giorno scelto come prima colonna visibile.
      showPastColumns = false;
      selectedCol = col;
      selectedShiftValue = cellShiftValue || selectedShiftValue;
      selectedCrewAgent = focusAgent;
      document.querySelectorAll(".date-header th").forEach(t => t.classList.remove("selected-day"));
      document.querySelectorAll("#tbody td.selected-shared-crew-day").forEach(td => td.classList.remove("selected-shared-crew-day"));
      let targetTh = document.querySelector(`.date-header th[data-col="${col}"]`);
      if (targetTh) targetTh.classList.add("selected-day");

      let calInfo = dateCalendario.find(c => c.col === col);
      let giornoInternoIdx = (col - 3) % 7;
      const cleanShift = ottieniTurnoPulito(cellShiftValue);
      const crewShift = getCrewShiftKey(cleanShift);
      const isRest = cleanShift === "";
      const crewResidence = getShiftResidence(cleanShift);
      const isCrewShift = Boolean(crewResidence);
      const myShiftPuro = isRest ? "RIPOSO" : (isGroundCrewShiftKey(crewShift) ? "TERRA" : crewShift);
      updateCoverageShiftButtons(crewShift);
      updateCoverageCellSelection(col, crewShift);

      if (!calInfo) {
        document.getElementById("tbody").classList.remove("has-selection");
        trElements.forEach(tr => tr.classList.remove("row-match"));
        restoreDefaultTableOrder();
        document.getElementById("day-panel").classList.remove("open");
        document.getElementById("day-panel").setAttribute("aria-hidden", "true");
        return;
      }

      document.getElementById("tbody").classList.add("has-selection");

      if (isCrewShift) importTemporaryTransferRows(calInfo, giornoInternoIdx, cleanShift);
          hidePastColumns();

      trElements.forEach(tr => {
        let ag = getAgentForTableRow(tr);
        if (!ag) return;
        let turniSett = ag.turni_settimanali[calInfo.weekKey] || [];
        let hisShiftRaw = turniSett[giornoInternoIdx] || "rip";
        let hisShiftPuro = ottieniTurnoPulito(hisShiftRaw);

        let match = isSameCrewShift(hisShiftPuro, cleanShift);
        tr.classList.toggle("row-match", match);
        if (tr.classList.contains("logged-agent-row")) {
          tr.classList.toggle("logged-in-selected-crew", match && isCrewShift);
        }

        tr.querySelectorAll("td[data-col]").forEach(td => {
          td.classList.toggle("col-selected", parseInt(td.dataset.col) === col);
        });
      });

      const loggedMatchingRow = trElements.find(tr =>
        tr.classList.contains("logged-agent-row") && tr.classList.contains("row-match")
      );
      const hasMatchingColleague = trElements.some(tr =>
        !tr.classList.contains("logged-agent-row") && tr.classList.contains("row-match")
      );
      if (loggedMatchingRow && hasMatchingColleague && isCrewShift) {
        loggedMatchingRow.querySelector(`td[data-col="${col}"]`)?.classList.add("selected-shared-crew-day");
      }

      moveSelectedCrewToTop();
      setTimeout(scrollGroupedCrewTableToTop, 60);

      const panelGroups = document.getElementById("panel-groups");
      panelGroups.innerHTML = "";

      const shipDayInfo = isCrewShift ? renderShipDayInfo(calInfo, cleanShift) : "";
      const infoDiv = document.createElement("div");
      infoDiv.className = "shift-group crew-info-group";
      infoDiv.innerHTML = `<div class="colleague-cards"><div class="colleague-card crew-info-card">
        <div class="panel-controls-box" aria-label="Selezione corsa e data">
          <div class="panel-shift-selector" id="panel-shift-selector" aria-label="Corse della residenza"></div>
          <div class="panel-header-main">
            <div class="panel-date" id="panel-date-label"></div>
            <div class="panel-date-navigation" aria-label="Navigazione primaria della data">
              <button class="panel-arrow" id="previous-day-btn" type="button" onclick="changeSelectedDay(-1)" aria-label="Giorno precedente">←</button>
              <button class="panel-arrow panel-today" id="today-day-btn" type="button" onclick="goToToday()" aria-label="Vai a oggi">OGGI</button>
              <button class="panel-arrow" id="next-day-btn" type="button" onclick="changeSelectedDay(1)" aria-label="Giorno successivo">→</button>
            </div>
          </div>
        </div>
        ${shipDayInfo}
      </div></div>`;
      panelGroups.appendChild(infoDiv);
      document.getElementById("panel-shift-selector").innerHTML = renderResidenceShiftBubbles(cleanShift);

      if (isCrewShift) {
        let allColleagues = [];
        Object.keys(globalData.residenze).forEach(resKey => {
        globalData.residenze[resKey].forEach(ag => {
          let turniSett = ag.turni_settimanali[calInfo.weekKey] || [];
          let hisShiftRaw = turniSett[giornoInternoIdx] || "rip";
          let hisShiftPuro = ottieniTurnoPulito(hisShiftRaw);
          const odsVariation = ag.variazioni_ods?.[calInfo.iso] || null;
          const movedAwayByOds = odsVariation &&
            isSameCrewShift(odsVariation.turno_originale, cleanShift) &&
            !isSameCrewShift(odsVariation.turno_nuovo, cleanShift);

          if (isSameCrewShift(hisShiftPuro, cleanShift) && !movedAwayByOds) {
            let rawUpper = hisShiftRaw.toUpperCase();
            let isTrasfertaFlag = rawUpper.startsWith("C") || rawUpper.endsWith("C") || resKey !==
              crewResidence;

            allColleagues.push({
              agentRecord: ag,
              id: ag.id,
              agente: ag.agente,
              qualifica: ag.qualifica,
              residenzaOrigine: resKey,
              isTrasferta: isTrasfertaFlag,
              rawShift: hisShiftRaw,
              isInstructor: /\*/.test(String(hisShiftRaw)),
              odsVariation
            });
          }
        });
        });

        getCrewBaristas(calInfo, cleanShift).forEach((record, index) => {
          allColleagues.push({
            id: record.id || `BAR${index + 1}`,
            agente: record.barista || record.agente || record.nome,
            qualifica: "barista",
            residenzaOrigine: crewResidence,
            isTrasferta: false,
            rawShift: cleanShift,
            isInstructor: false,
            isBarista: true,
            odsVariation: null
          });
        });

        const div = document.createElement("div");
        div.className = "shift-group";
        const crewStatus = getCrewDeficiencies(allColleagues, myShiftPuro, crewResidence);
        const shortageText = crewStatus.incomplete
          ? `<div class="crew-alert"><strong>Incompleto</strong></div>`
          : "";
        div.innerHTML = `${shortageText}<div class="colleague-cards" id="colleague-list"></div>`;
        panelGroups.appendChild(div);

      const list = div.querySelector("#colleague-list");
      const gradeOrder = {
        "grado-capitano": 1,
        "grado-capo": 2,
        "grado-timoniere": 3,
        "grado-motorista": 4,
        "grado-aiuto": 5,
        "grado-marinaio": 6,
        "grado-operaio": 7
        ,"grado-barista": 8
      };
      allColleagues.sort((a, b) => {
        if (myShiftPuro === "TERRA") {
          const serviceA = ottieniTurnoPulito(a.rawShift).toUpperCase();
          const serviceB = ottieniTurnoPulito(b.rawShift).toUpperCase();
          const serviceDifference = (ordineServiziTerra[serviceA] || 99) - (ordineServiziTerra[serviceB] || 99);
          if (serviceDifference !== 0) return serviceDifference;
        }
        const gradeA = gradeOrder[getGradeClass(a.id, a.agente, a.qualifica)] || 99;
        const gradeB = gradeOrder[getGradeClass(b.id, b.agente, b.qualifica)] || 99;
        return gradeA - gradeB || String(a.agente).localeCompare(String(b.agente), "it");
      });

        allColleagues.forEach(r => {
        const gradeClass = getGradeClass(r.id, r.agente, r.qualifica);
        const grade = gradeInfo[gradeClass] || { label: "Marinaio", color: "#9ca3af" };
        const card = document.createElement("div");
        card.className = `colleague-card${r.isInstructor ? " instructor-card" : ""}${r.isTrasferta ? " transfer-card" : ""}${r.isBarista ? " barista-card" : ""}`;
        card.style.cssText = `border-left-color:${grade.color};`;
        if (r.isTrasferta) card.title = `In trasferta da ${r.residenzaOrigine}`;

        let infoResidenza = "";
        if (r.isTrasferta) {
          infoResidenza = `<span class="c-res" style="color:#93c5fd;border-color:rgba(96,165,250,.45);">TRASFERTA DA ${String(r.residenzaOrigine).toUpperCase()}</span>`;
        }

        const instructorMark = r.isInstructor ? `<span class="c-res instructor-mark">SOVRANNUMERO</span>` : "";
        const groundServiceCode = ottieniTurnoPulito(r.rawShift).toUpperCase();
        const groundService = myShiftPuro === "TERRA"
          ? `<span class="c-res">${escapeAttribute(etichetteServiziTerra[groundServiceCode] || groundServiceCode)}</span>`
          : "";
        const odsBadge = renderAgentOdsBadge(r.odsVariation);
        const futureSharedDot = hasCurrentOrFutureSharedCrewWithLogged(r.agentRecord)
          ? '<span class="future-shared-dot" title="Avete turni in comune da oggi in avanti" aria-label="Turni in comune da oggi in avanti"></span>'
          : "";
        card.innerHTML = `<span class="c-num">${r.id || "—"}</span>
          <span class="c-name">${r.agente}${odsBadge}${groundService}${instructorMark} ${infoResidenza}</span>
          ${futureSharedDot}<span class="c-grade" style="color:${grade.color}; background:${grade.color}22; border:1px solid ${grade.color}44;">${grade.label}</span>`;
          if (!r.isBarista) {
            card.classList.add("pinnable-colleague");
            card.title = [card.title, "Clicca per pinnare l’agente"].filter(Boolean).join(" · ");
            card.addEventListener("click", event => {
              if (event.target.closest("a, button")) return;
              pinCrewColleague(r.residenzaOrigine, r.id, r.agente, calInfo);
            });
          }
          list.appendChild(card);
        });
        appendCrewOdsVariations(div, calInfo, cellShiftValue);
      }

      document.getElementById("panel-date-label").innerHTML = `<span>⬡</span>${label}`;
      const currentIndex = dateCalendario.findIndex(c => c.col === col);
      document.getElementById("previous-day-btn").disabled = currentIndex <= 0;
      document.getElementById("next-day-btn").disabled = currentIndex < 0 || currentIndex >= dateCalendario.length - 1;
      const drawer = document.getElementById("day-panel");
      const drawerToggle = document.getElementById("crew-drawer-toggle");
      drawerToggle.hidden = false;
      drawerToggle.textContent = drawer.classList.contains("open") ? "⌃" : "⌄";
      drawerToggle.setAttribute("aria-expanded", String(drawer.classList.contains("open")));
      drawerToggle.setAttribute("aria-label", drawer.classList.contains("open") ? "Nascondi equipaggio" : "Mostra equipaggio");
      drawer.setAttribute("aria-hidden", String(!drawer.classList.contains("open")));
      if (drawer.classList.contains("open")) {
        requestAnimationFrame(() => {
          updateCrewDrawerOffset();
          scrollCrewPanelIntoView();
        });
      }
    }


    function scrollGroupedCrewTableToTop() {
      const target = dayPanelPlacement === "coverage"
        ? document.getElementById("coverage-section")
        : document.getElementById("matrix-scroll-wrap");
      if (!target) return;
      const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 8);
      window.scrollTo({ top, behavior:"smooth" });
    }

    function getDefaultCrewSelection() {
      if (!dateCalendario.length) return null;

      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const cal = dateCalendario.find(item => isTodayDate(item.realObj)) ||
        dateCalendario.find(item => new Date(item.realObj) >= now) ||
        dateCalendario[0];
      if (!cal) return null;

      const loggedLocation = getLoggedAgentLocation();
      if (loggedLocation && currentResidence !== loggedLocation.residence) {
        selectResidence(loggedLocation.residence);
      }

      const location = getLoggedAgentLocation();
      const agent = location?.agent || null;
      let rawShift = "";
      if (agent) {
        const dayIndex = (cal.col - 3) % 7;
        rawShift = (agent.turni_settimanali?.[cal.weekKey] || [])[dayIndex] || "rip";
        const odsShift = agent.variazioni_ods?.[cal.iso]?.turno_nuovo;
        if (odsShift) rawShift = odsShift;
      }

      const cleanShift = ottieniTurnoPulito(rawShift);
      const residenceShifts = getResidenceCrewShifts();
      const fallbackShift = residenceShifts[0] || "";
      return {
        cal,
        shift: cleanShift || fallbackShift,
        agent
      };
    }

    function toggleCrewDrawer() {
      if (selectedCol === null) {
        const initial = getDefaultCrewSelection();
        if (!initial) return;
        placeDayPanel("main");
        activeShiftFilter = getCrewShiftKey(initial.shift) || null;
        generaFiltriTurnoRiferimento();
        selectDay(initial.cal.col, initial.cal.labelEstesa, initial.shift, initial.agent);
      }
      const panel = document.getElementById("day-panel");
      const button = document.getElementById("crew-drawer-toggle");
      const opening = !panel.classList.contains("open");
      panel.classList.toggle("open", opening);
      panel.setAttribute("aria-hidden", String(!opening));
      button.textContent = opening ? "⌃" : "⌄";
      button.setAttribute("aria-expanded", String(opening));
      button.setAttribute("aria-label", opening ? "Nascondi equipaggio" : "Mostra equipaggio");
      document.body.classList.toggle("crew-drawer-open", opening);
      document.body.classList.toggle("crew-drawer-main", opening && dayPanelPlacement !== "coverage");
      document.body.classList.toggle("crew-drawer-coverage", opening && dayPanelPlacement === "coverage");
      if (opening) {
        requestAnimationFrame(() => {
          updateCrewDrawerOffset();
          scrollCrewPanelIntoView();
          setTimeout(updateCrewDrawerOffset, 80);
        });
      } else {
        document.documentElement.style.setProperty("--crew-drawer-offset", "0px");
        updateCrewDrawerOffset();
      }
    }

    function updateCrewDrawerOffset() {
      const panel = document.getElementById("day-panel");
      const matrix = document.getElementById("matrix-scroll-wrap");
      const coverageWrap = document.querySelector("#coverage-section .coverage-wrap");
      const open = Boolean(panel?.classList.contains("open"));
      const height = open ? Math.ceil(panel.getBoundingClientRect().height) + 14 : 0;
      document.documentElement.style.setProperty("--crew-drawer-offset", `${height}px`);
      if (matrix) matrix.style.marginTop = open && dayPanelPlacement !== "coverage" ? `${height}px` : "";
      if (coverageWrap) coverageWrap.style.marginTop = open && dayPanelPlacement === "coverage" ? `${height}px` : "";
    }
    window.addEventListener("resize", updateCrewDrawerOffset);

    function pinCrewColleague(residence, id, name, calInfo) {
      const agents = globalData?.residenze?.[residence] || [];
      const targetIndex = agents.findIndex(agent =>
        (id && String(agent.id || "") === String(id)) ||
        String(agent.agente || "").trim().toLocaleLowerCase("it") === String(name || "").trim().toLocaleLowerCase("it")
      );
      if (targetIndex < 0) return;
      if (currentResidence !== residence) selectResidence(residence);
      else clearSelection();
      pinnedAgentIdx = targetIndex;
      renderTable();
      if (calInfo) selectDayForPinnedAgent(calInfo);
      setTimeout(scrollCrewPanelIntoView, 60);
    }

    function scrollCrewPanelIntoView() {
      const panel = document.getElementById("day-panel");
      if (!panel) return;
      panel.scrollTo({ top:0, behavior:"smooth" });
    }

    function placeDayPanel(placement) {
      const panel = document.getElementById("day-panel");
      const matrix = document.getElementById("matrix-scroll-wrap");
      const coverage = document.getElementById("coverage-section");
      if (!panel || !matrix || !coverage) return;
      dayPanelPlacement = placement;
      if (document.body.classList.contains("crew-drawer-open")) {
        document.body.classList.toggle("crew-drawer-main", placement !== "coverage");
        document.body.classList.toggle("crew-drawer-coverage", placement === "coverage");
      }
      const target = placement === "coverage"
        ? coverage.querySelector(".coverage-wrap")
        : matrix;
      if (!target) return;
      if (panel.nextElementSibling !== target) target.parentNode.insertBefore(panel, target);
      if (placement !== "coverage") updateCoverageCellSelection(null, "");
    }

    function setupSynchronizedTableScrolls() {
      const mainWrap = document.getElementById("matrix-scroll-wrap");
      const coverageWrap = document.getElementById("coverage-matrix-wrap");
      if (!mainWrap || !coverageWrap || mainWrap.dataset.scrollSyncReady) return;
      mainWrap.dataset.scrollSyncReady = "true";
      const synchronize = (source, target) => {
        if (syncingHorizontalScroll) return;
        syncingHorizontalScroll = true;
        target.scrollLeft = source.scrollLeft;
        requestAnimationFrame(() => { syncingHorizontalScroll = false; });
      };
      mainWrap.addEventListener("scroll", () => synchronize(mainWrap, coverageWrap), { passive:true });
      coverageWrap.addEventListener("scroll", () => synchronize(coverageWrap, mainWrap), { passive:true });
    }

    function openCoverageCrew(col, shift) {
      const cal = dateCalendario.find(item => item.col === col);
      if (!cal) return;
      clearPinnedAgentSelection();
      placeDayPanel("coverage");
      selectDay(cal.col, cal.labelEstesa, shift);
    }

    function updateCoverageShiftButtons(shift) {
      const selectedShift = String(shift || "").toUpperCase();
      document.querySelectorAll(".coverage-shift-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.shift.toUpperCase() === selectedShift);
      });
    }

    function updateCoverageCellSelection(col, shift) {
      document.querySelectorAll(".coverage-cell.coverage-selected").forEach(cell => {
        cell.classList.remove("coverage-selected");
      });
      if (dayPanelPlacement !== "coverage" || col == null || !shift) return;
      const selectedRow = Array.from(document.querySelectorAll("#coverage-tbody tr"))
        .find(row => row.dataset.shift.toUpperCase() === String(shift).toUpperCase());
      const selectedCell = selectedRow?.querySelector(`.coverage-cell[data-col="${col}"]`);
      selectedCell?.classList.add("coverage-selected");
    }

    function switchCoverageShift(shift) {
      let cal = dateCalendario.find(item => item.col === selectedCol);
      if (!cal) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        cal = dateCalendario.find(item => {
          const date = new Date(item.realObj);
          date.setHours(0, 0, 0, 0);
          return date.getTime() === today.getTime();
        }) || dateCalendario.find(item => item.realObj >= today) || dateCalendario[0];
      }
      if (cal) openCoverageCrew(cal.col, shift);
    }

    function selectCoverageResidence(residence) {
      selectResidence(residence);
      placeDayPanel("coverage");
    }

    function changeSelectedDay(direction) {
      const currentIndex = dateCalendario.findIndex(c => c.col === selectedCol);
      const target = dateCalendario[currentIndex + direction];
      if (!target) return;
      if (pinnedAgentIdx !== null && currentAgentsList[pinnedAgentIdx]) {
        selectDayForPinnedAgent(target);
      } else {
        const shift = activeShiftFilter || selectedShiftValue;
        clearPinnedAgentSelection();
        selectDay(target.col, target.labelEstesa, shift);
      }
      setTimeout(() => revealSelectedDate(target), 90);
    }

    function revealSelectedDate(cal) {
      scrollDateColumnIntoView(cal);
    }

    function scrollDateColumnIntoView(cal, behavior = "smooth") {
      const coverageMode = dayPanelPlacement === "coverage";
      const wrap = document.getElementById(coverageMode ? "coverage-matrix-wrap" : "matrix-scroll-wrap");
      const header = document.querySelector(coverageMode ? "#coverage-thead" : ".date-header");
      const th = header?.querySelector(`th[data-col="${cal.col}"]`);
      const fixedHeader = header?.querySelector("th:first-child");
      if (!wrap || !th) return;
      const offset = Math.max(0, th.getBoundingClientRect().left + window.scrollX - (fixedHeader?.offsetWidth || 0) - 8);
      window.scrollTo({ left:offset, top:window.scrollY, behavior });
    }

    function getResidenceCrewShifts() {
      const residenceKey = String(currentResidence || "").trim().toLowerCase();
      return (turniMappaResidenze[residenceKey] || []).filter(shift =>
        !isGroundCrewShiftKey(getCrewShiftKey(shift)) &&
        !serviziTerraPerResidenza[String(currentResidence || "").trim().toUpperCase()]?.includes(String(shift).toUpperCase())
      );
    }

    function renderResidenceShiftBubbles(selectedShift) {
      const selected = ottieniTurnoPulito(selectedShift).toUpperCase();
      const shifts = getResidenceCrewShifts();
      if (!shifts.length) return "";
      return shifts.map(shift => {
        const clean = String(shift).toUpperCase();
        const active = clean === selected;
        const color = shiftBorderColor[classify(shift)] || "#94a3b8";
        const safeShift = escapeAttribute(shift);
        return `<button class="crew-shift-bubble${active ? " active" : ""}" type="button" style="--shift-color:${color}" ${active ? `disabled aria-current="true"` : `onclick="selectResidenceCrewShift('${safeShift}')"`} aria-label="${active ? "Corsa selezionata" : "Mostra equipaggio"} ${safeShift}">${safeShift}</button>`;
      }).join("");
    }

    function selectResidenceCrewShift(shift) {
      const cal = dateCalendario.find(item => item.col === selectedCol);
      if (!cal || !getResidenceCrewShifts().some(item => item.toUpperCase() === String(shift).toUpperCase())) return;
      clearPinnedAgentSelection();
      activeShiftFilter = shift;
      generaFiltriTurnoRiferimento();
      selectDay(cal.col, cal.labelEstesa, shift);
    }

    function changeSelectedShift(direction) {
      const residenceKey = String(currentResidence || "").trim().toLowerCase();
      const shifts = turniMappaResidenze[residenceKey] || [];
      const cal = dateCalendario.find(item => item.col === selectedCol);
      if (!shifts.length || !cal) return;
      const currentShift = ottieniTurnoPulito(selectedShiftValue);
      const currentIndex = shifts.findIndex(shift => shift.toUpperCase() === currentShift.toUpperCase());
      const targetIndex = currentIndex < 0
        ? (direction < 0 ? shifts.length - 1 : 0)
        : (currentIndex + direction + shifts.length) % shifts.length;
      const targetShift = shifts[targetIndex];
      clearPinnedAgentSelection();
      activeShiftFilter = targetShift;
      generaFiltriTurnoRiferimento();
      selectDay(cal.col, cal.labelEstesa, targetShift);
    }

    function goToToday() {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const target = dateCalendario.find(cal => {
        const date = new Date(cal.realObj);
        date.setHours(0, 0, 0, 0);
        return date.getTime() === now.getTime();
      });
      if (!target) return;
      if (pinnedAgentIdx !== null && currentAgentsList[pinnedAgentIdx]) {
        selectDayForPinnedAgent(target);
      } else {
        const shift = activeShiftFilter || selectedShiftValue;
        clearPinnedAgentSelection();
        selectDay(target.col, target.labelEstesa, shift);
      }
      setTimeout(() => revealSelectedDate(target), 90);
    }

    function clearSelection() {
      selectedCol = null;
      selectedShiftValue = "";
      selectedCrewAgent = null;
      document.getElementById("day-panel").classList.remove("open");
      document.getElementById("day-panel").setAttribute("aria-hidden", "true");
      document.body.classList.remove("crew-drawer-open", "crew-drawer-main", "crew-drawer-coverage");
      document.documentElement.style.setProperty("--crew-drawer-offset", "0px");
      const drawerToggle = document.getElementById("crew-drawer-toggle");
      drawerToggle.hidden = true;
      drawerToggle.textContent = "⌄";
      drawerToggle.setAttribute("aria-expanded", "false");
      drawerToggle.setAttribute("aria-label", "Mostra equipaggio");
      document.getElementById("tbody").classList.remove("has-selection");
      document.querySelectorAll(".date-header th").forEach(t => t.classList.remove("selected-day"));
      document.querySelectorAll("#tbody td.selected-shared-crew-day").forEach(td => td.classList.remove("selected-shared-crew-day"));
      trElements.forEach(tr => {
        tr.classList.remove("row-match");
        tr.classList.remove("logged-in-selected-crew");
        tr.querySelectorAll("td").forEach(td => td.classList.remove("col-selected"));
      });
      restoreDefaultTableOrder();
      showPastColumns = false;
      hidePastColumns();
      window.scrollTo({ left:0, top:window.scrollY, behavior:"auto" });
    }

    function resetCleanTable() {
      pinnedAgentIdx = null;
      activeShiftFilter = null;
      const search = document.getElementById("agent-search");
      if (search) search.value = "";
      clearSelection();
      generaFiltriTurnoRiferimento();
      renderTable();
      window.scrollTo({ left:0, top:0, behavior:"smooth" });
    }

    function filterAgents(query) {
      const q = (query || "").trim().toLocaleLowerCase("it");
      let visible = 0;
      document.querySelectorAll("#tbody tr").forEach(tr => {
        const match = !q || tr.textContent.toLocaleLowerCase("it").includes(q);
        tr.classList.toggle("agent-hidden", !match);
        if (match) visible++;
      });
      document.getElementById("stat-agents").textContent = visible;
    }

    function selectResidence(resName) {
      if (isEditMode) {
        if (!confirm("Uscire dalla modalità modifica senza salvare i cambi correnti?")) return;
        toggleEditMode();
      }
      clearPinnedAgentSelection();
      clearSelection();
      currentResidence = resName;
      activeShiftFilter = null;

      currentAgentsList = globalData.residenze[resName] || [];
      document.getElementById("stat-residence").textContent = resName;
      document.getElementById("stat-agents").textContent = currentAgentsList.length;
      const search = document.getElementById("agent-search");
      if (search) search.value = "";
      document.querySelectorAll(".res-btn, .coverage-residence-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.res === resName));

      generaFiltriTurnoRiferimento();

      if (currentAgentsList.length > 0) {
        document.getElementById("matrix-scroll-wrap").style.display = "block";
        renderTable();
      } else {
        clearSelection();
      }
    }

    function hidePastColumns() {
      // Il limite resta sempre oggi: la selezione di una data futura non deve
      // nascondere le giornate comprese tra oggi e la data selezionata.
      const referenceDate = new Date();
      referenceDate.setHours(0, 0, 0, 0);
      dateCalendario.forEach(cal => {
        const isPast = cal.realObj < referenceDate;
        const displayValue = (!showPastColumns && isPast) ? "none" : "table-cell";
        document.querySelectorAll(`th[data-col="${cal.col}"]`).forEach(el => {
          el.style.display = displayValue;
          el.style.opacity = "1";
        });
        document.querySelectorAll(`td[data-col="${cal.col}"]`).forEach(td => {
          td.style.display = displayValue;
          td.style.opacity = "1";
        });
      });

      const btn = document.getElementById("togglePastBtn");
      if (btn) btn.textContent = showPastColumns ? "🙈 Nascondi passato" : "👁 Mostra passato";
    }

    function togglePastColumns() {
      showPastColumns = !showPastColumns;
      hidePastColumns();
      const selectedCal = dateCalendario.find(cal => cal.col === selectedCol);
      setTimeout(() => selectedCal ? scrollDateColumnIntoView(selectedCal, "auto") : scrollToToday(), 30);
    }

    function toggleEditMode() {
      isEditMode = !isEditMode;
      const btn = document.getElementById("toggle-edit-btn");
      const btnSave = document.getElementById("save-edit-btn");
      const btnDl = document.getElementById("download-json-btn");

      if (isEditMode) {
        clearSelection();
        btn.textContent = "✕ Annulla";
        btn.classList.add("editing");
        btnSave.style.display = "inline-flex";
        btnDl.style.display = "inline-flex";
      } else {
        btn.textContent = "✍ Abilita Modifiche";
        btn.classList.remove("editing");
        btnSave.style.display = "none";
        btnDl.style.display = "none";
      }

      generaFiltriTurnoRiferimento();
      renderTable();
    }

    function saveChanges() {
      const inputs = document.querySelectorAll(".edit-input");
      inputs.forEach(input => {
        const aIdx = parseInt(input.dataset.agentIdx);
        const wKey = input.dataset.weekKey;
        const dIdx = parseInt(input.dataset.dayIdx);
        const nuovoValore = input.value.trim() === "" ? "rip" : input.value.trim();

        if (currentAgentsList[aIdx]) {
          if (!currentAgentsList[aIdx].turni_settimanali[wKey]) {
            currentAgentsList[aIdx].turni_settimanali[wKey] = ["rip", "rip", "rip", "rip", "rip", "rip", "rip"];
          }
          currentAgentsList[aIdx].turni_settimanali[wKey][dIdx] = nuovoValore;
        }
      });

      globalData.residenze[currentResidence] = currentAgentsList;
      localStorage.setItem("turno_finali_data", JSON.stringify(globalData));

      alert("Cambio turni salvato correttamente in memoria locale!");
      toggleEditMode();
    }

    function downloadUpdatedJSON() {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(globalData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "turni_finali.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }

    function renderResidenceButtons() {
      const container = document.getElementById("top-residence-buttons");
      if (!container) return;
      container.innerHTML = "";
      Object.keys(globalData.residenze).forEach(res => {
        const btn = document.createElement("button");
        btn.className = "coverage-residence-btn";
        btn.dataset.res = res;
        btn.textContent = res;
        btn.addEventListener("click", () => selectResidence(res));
        container.appendChild(btn);
      });
    }


    function formatDateISOClient(d) {
      return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
    }

    function normalizeOdsAgentName(value) {
      return String(value || "")
        .trim()
        .toLocaleLowerCase("it")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.'’`]/g, "")
        .replace(/\s+/g, " ");
    }

    function normalizeOdsShift(value) {
      const shift = String(value || "").trim();
      if (!shift || /^={3,}$/.test(shift) || /^(rip|rip\.|riposo)$/i.test(shift)) return "rip";
      return shift.toUpperCase();
    }

    function applyOdsVariations(data) {
      const variations = Array.isArray(data?.variazioni_ods)
        ? [...data.variazioni_ods].sort((a, b) => {
            const odsNumber = value => Number.parseInt(String(value?.ods || "").match(/\d+/)?.[0] || "0", 10);
            return odsNumber(a) - odsNumber(b);
          })
        : [];
      if (!variations.length) return data;

      const agents = Object.values(data.residenze || {}).flat();

      variations.forEach(variation => {
        if (!variation || variation.attiva === false || !variation.data || !variation.agente) return;

        const variationId = String(variation.id_agente || "").trim();
        const variationName = normalizeOdsAgentName(variation.agente);
        const agent = agents.find(item => {
          const agentName = normalizeOdsAgentName(item.agente);
          return (variationId && String(item.id || "").trim() === variationId) ||
            agentName === variationName ||
            agentName.startsWith(variationName + " ");
        });
        if (!agent) return;

        const week = settimaneInfo.find(item => item.dateIso.includes(variation.data));
        if (!week) return;
        const dayIndex = week.dateIso.indexOf(variation.data);
        const weeklyShifts = agent.turni_settimanali?.[week.key];
        if (!weeklyShifts || dayIndex < 0) return;

        const currentShift = weeklyShifts[dayIndex] || "rip";
        const newShift = normalizeOdsShift(variation.turno_nuovo);
        weeklyShifts[dayIndex] = newShift;

        if (!agent.variazioni_ods) agent.variazioni_ods = {};
        agent.variazioni_ods[variation.data] = {
          ...variation,
          // Il turno di partenza deve riflettere sempre il valore corrente
          // di Foglio1; quello riportato nell'ODS potrebbe essere precedente
          // a una successiva correzione del turno base.
          turno_originale: normalizeOdsShift(currentShift),
          turno_nuovo: newShift
        };
      });

      return data;
    }

    function adattaFormatoNaviturni(data) {
      if (!data || !Array.isArray(data.date)) return data;

      settimaneInfo.length = 0;
      const date = [...data.date].sort((a, b) => a.iso.localeCompare(b.iso));

      for (let i = 0; i < date.length; i += 7) {
        const blocco = date.slice(i, i + 7);
        if (!blocco.length) continue;

        const inizio = new Date(blocco[0].iso + "T00:00:00");
        const fine = new Date(blocco[blocco.length - 1].iso + "T00:00:00");

        const key =
          "settimana_" +
          String(inizio.getDate()).padStart(2, "0") + "-" +
          String(inizio.getMonth() + 1).padStart(2, "0") +
          "_al_" +
          String(fine.getDate()).padStart(2, "0") + "-" +
          String(fine.getMonth() + 1).padStart(2, "0");

        settimaneInfo.push({
          label: "Settimana " +
            String(inizio.getDate()).padStart(2, "0") + "-" +
            String(inizio.getMonth() + 1).padStart(2, "0") +
            " al " +
            String(fine.getDate()).padStart(2, "0") + "-" +
            String(fine.getMonth() + 1).padStart(2, "0"),
          key,
          startDay: inizio.getDate(),
          month: inizio.getMonth(),
          year: inizio.getFullYear(),
          count: blocco.length,
          dateIso: blocco.map(x => x.iso)
        });
      }

      const residenze = {};

      Object.keys(data.residenze || {}).forEach(residenza => {
        residenze[residenza] = (data.residenze[residenza] || []).map(ag => {
          const turni_settimanali = {};

          settimaneInfo.forEach(sett => {
            turni_settimanali[sett.key] = sett.dateIso.map(iso =>
              (ag.turni && ag.turni[iso]) ? ag.turni[iso] : "rip"
            );
          });

          return {
            id: ag.id || "",
            agente: ag.agente || "",
            qualifica: ag.qualifica || "marinaio",
            turni_settimanali
          };
        });
      });

      return {
        ...data,
        residenze
      };
    }

    function processJSONData(data) {
      data = adattaFormatoNaviturni(data);
      data = applyOdsVariations(data);
      globalData = data;
      inizializzaCalendario();
      buildTableHeader();
      document.getElementById("stat-status").textContent = "Aggiornati";
      document.getElementById("welcome-notice").style.display = "none";
      
      // Aggiorna il periodo nel titolo
      if (data.periodo) {
        document.getElementById("periodLabel").textContent = String(data.periodo).replace(/^.*?\bDAL\b\s*/i, "");
      }
      
      renderResidenceButtons();
      populateLoginSurnameOptions();
      loggedAgentProfile = readLoggedAgentProfile();
      updateLoginUserPanel();
      if (loggedAgentProfile && applyLoggedAgentProfile()) return;
      if (loggedAgentProfile) {
        localStorage.removeItem(AGENT_LOGIN_STORAGE_KEY);
        loggedAgentProfile = null;
        updateLoginUserPanel();
      }
      const keys = Object.keys(data.residenze || {});
      const defaultResidence = keys.find(key => key.trim().toLowerCase() === "desenzano") || keys[0];
      if (defaultResidence) selectResidence(defaultResidence);
      showLoginModal();
    }

    function loadPastedJSON() {
      const txt = document.getElementById("json-paste-input").value.trim();
      try {
        const parsed = JSON.parse(txt);
        localStorage.setItem("turno_finali_data", txt);
        processJSONData(parsed);
        setTimeout(scrollToToday, 80);
        toggleUpload();
        document.getElementById("upload-status").textContent = "✅ Dati caricati con successo!";
      } catch (e) {
        alert("Errore nel file JSON: " + e.message);
        document.getElementById("upload-status").textContent = "❌ Errore: " + e.message;
      }
    }

    function clearSavedMemory() {
      if (confirm("Cancellare i turni memorizzati?")) {
        localStorage.removeItem("turno_finali_data");
        location.reload();
      }
    }

    function toggleUpload() {
      const body = document.getElementById("upload-body");
      const icon = document.getElementById("upload-toggle-icon");
      if (body.style.display === "none" || body.style.display === "") {
        body.style.display = "flex";
        icon.textContent = "▲ comprimi";
      } else {
        body.style.display = "none";
        icon.textContent = "▼ espandi";
      }
    }

    function scrollToToday() {
      const wrap = document.getElementById("matrix-scroll-wrap");
      if (!wrap || wrap.style.display === "none") return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let target = dateCalendario.find(cal => {
        const d = new Date(cal.realObj);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      });

      if (!target) {
        target = dateCalendario.find(cal => cal.realObj > today) || dateCalendario[dateCalendario.length - 1];
      }

      const th = document.querySelector(`.date-header th[data-col="${target.col}"]`);
      const fixedCols = document.querySelectorAll(".date-header th:nth-child(1)");
      if (!th) return;
      const fixedWidth = Array.from(fixedCols).reduce((sum, el) => sum + el.offsetWidth, 0);

      const offset = Math.max(0, th.getBoundingClientRect().left + window.scrollX - fixedWidth - 8);
      window.scrollTo({ left:offset, top:window.scrollY, behavior:"auto" });
      document.querySelectorAll(".date-header th").forEach(t => t.classList.remove("selected-day"));
      th.classList.add("selected-day");
    }

    // Carica i dati dal Google Sheet condiviso tramite Apps Script.
    // Se il Google Sheet non risponde, usa l'ultima copia salvata nel browser.
    const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw38IoMZJ50bun_AL-KjQ7jG4UbMPRKxjr22TXrzpZ_pIM2s9ZqOR0LYFXgC007Yc0PpQ/exec";

    async function caricaDatiDaGoogleSheet(force = false) {
      let localDataShown = false;
      const saved = !force ? localStorage.getItem("turno_finali_data") : null;

      // Mostra subito l'ultima copia disponibile: l'utente non deve attendere la rete.
      if (saved) {
        try {
          lastLoadedDataSignature = saved;
          processJSONData(JSON.parse(saved));
          localDataShown = true;
          const menuStatus = document.getElementById("turniMenuStatus");
          if (menuStatus) menuStatus.textContent = "Locale";
          document.getElementById("upload-status").textContent = "⚡ Turni aperti dalla memoria locale; controllo aggiornamenti…";
          setTimeout(scrollToToday, 30);
        } catch (e) {
          localStorage.removeItem("turno_finali_data");
          lastLoadedDataSignature = "";
        }
      }

      try {
        const datiJson = await NaviSharedData.load(GOOGLE_SCRIPT_URL, { force });
        const networkSignature = JSON.stringify(datiJson);
        localStorage.setItem("turno_finali_data", networkSignature);

        // Evita un secondo rendering completo quando i dati sono identici.
        if (!localDataShown || networkSignature !== lastLoadedDataSignature) {
          lastLoadedDataSignature = networkSignature;
          processJSONData(datiJson);
          setTimeout(scrollToToday, 30);
        }

        const menuStatus = document.getElementById("turniMenuStatus");
        if (menuStatus) menuStatus.textContent = NaviSharedData.source() === "network" ? "Aggiornato" : "Locale";
        document.getElementById("upload-status").textContent = "✅ Dati aggiornati — " + new Date().toLocaleTimeString("it-IT");
      } catch (errore) {
        console.warn("Caricamento dal Google Sheet fallito.", errore);
        if (localDataShown) {
          document.getElementById("upload-status").textContent = "⚠️ Google Sheet non raggiungibile — uso i dati salvati";
          return;
        }
        const welcomeNotice = document.getElementById("welcome-notice");
        welcomeNotice.classList.add("is-error");
        welcomeNotice.innerHTML = `<h3>⚠️ Dati non disponibili</h3><p>Non è stato possibile caricare i turni. Riprova con il pulsante Aggiorna.</p>`;
        welcomeNotice.style.display = "block";
        document.getElementById("upload-status").textContent = "❌ Impossibile caricare i dati: " + errore.message;
      }
    }

    function ricaricaDati() {
      const btn = document.getElementById("refreshBtn");
      const testoOriginale = btn.textContent;
      btn.textContent = "🔄 Aggiorno...";
      btn.disabled = true;
      NaviSharedData.clear();
      caricaDatiDaGoogleSheet(true).finally(() => {
        btn.textContent = testoOriginale;
        btn.disabled = false;
      });
    }

    window.addEventListener("DOMContentLoaded", () => {
      const dayPanel = document.getElementById("day-panel");
      dayPanel.classList.remove("open");
      dayPanel.setAttribute("aria-hidden", "true");
      document.body.classList.remove("crew-drawer-open", "crew-drawer-main", "crew-drawer-coverage");
      document.documentElement.style.setProperty("--crew-drawer-offset", "0px");
      const drawerToggle = document.getElementById("crew-drawer-toggle");
      drawerToggle.hidden = true;
      drawerToggle.textContent = "⌄";
      drawerToggle.setAttribute("aria-expanded", "false");
      const menuButton = document.getElementById("turni-menu-button");
      menuButton.addEventListener("click", () => {
        const open = document.body.classList.toggle("turni-menu-open");
        menuButton.setAttribute("aria-expanded", String(open));
      });
      document.getElementById("turni-sidebar").addEventListener("click", event => {
        if (event.target.closest("a") && window.innerWidth <= 800) {
          document.body.classList.remove("turni-menu-open");
          menuButton.setAttribute("aria-expanded", "false");
        }
      });
      setupSynchronizedTableScrolls();
      caricaDatiDaGoogleSheet();
    });
