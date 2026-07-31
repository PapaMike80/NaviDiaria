/**
 * Orari NaviTurni 2026 estratti da:
 * - Orario del servizio pubblico di linea 16/05/2026 - 04/10/2026
 * - Prospetto competenze turni e relative corse
 *
 * Questo file deve essere aggiunto al progetto Google Apps Script.
 */
const NAVI_COURSE_SCHEDULE = {
  "2":{departure:"09:10",from:"PESCHIERA",arrival:"14:00",to:"RIVA"},
  "3":{departure:"15:15",from:"RIVA",arrival:"20:10",to:"PESCHIERA"},
  "5":{departure:"08:50",from:"RIVA",arrival:"14:00",to:"DESENZANO"},
  "6":{departure:"15:00",from:"DESENZANO",arrival:"20:05",to:"RIVA"},
  "8":{departure:"08:20",from:"DESENZANO",arrival:"09:35",to:"GARDA"},
  "9":{departure:"09:35",from:"GARDA",arrival:"11:20",to:"DESENZANO"},
  "10":{departure:"11:30",from:"DESENZANO",arrival:"13:10",to:"GARDA"},
  "11":{departure:"14:15",from:"GARDA",arrival:"15:25",to:"PESCHIERA"},
  "12":{departure:"15:30",from:"PESCHIERA",arrival:"16:35",to:"GARDA"},
  "13":{departure:"16:55",from:"GARDA",arrival:"18:25",to:"DESENZANO"},
  "14":{departure:"08:00",from:"PESCHIERA",arrival:"09:00",to:"GARDA"},
  "15":{departure:"08:28",from:"LAZISE",arrival:"10:05",to:"DESENZANO"},
  "16":{departure:"10:15",from:"DESENZANO",arrival:"13:00",to:"MADERNO"},
  "17":{departure:"14:00",from:"MADERNO",arrival:"17:05",to:"DESENZANO"},
  "18":{departure:"17:10",from:"DESENZANO",arrival:"18:20",to:"GARDA"},
  "19":{departure:"18:20",from:"GARDA",arrival:"19:20",to:"PESCHIERA"},
  "22":{departure:"08:55",from:"DESENZANO",arrival:"10:37",to:"LAZISE"},
  "23":{departure:"10:00",from:"GARDA",arrival:"11:05",to:"PESCHIERA"},
  "24":{departure:"11:20",from:"PESCHIERA",arrival:"14:05",to:"MALCESINE CENTRO"},
  "25":{departure:"15:05",from:"MALCESINE CENTRO",arrival:"17:55",to:"PESCHIERA"},
  "26":{departure:"18:00",from:"PESCHIERA",arrival:"19:10",to:"GARDA"},
  "27":{departure:"18:29",from:"LAZISE",arrival:"20:15",to:"DESENZANO"},
  "28":{departure:"08:00",from:"DESENZANO",arrival:"09:51",to:"GARDONE"},
  "29":{departure:"09:51",from:"GARDONE",arrival:"12:45",to:"DESENZANO"},
  "30":{departure:"13:45",from:"DESENZANO",arrival:"16:30",to:"GARDONE"},
  "31":{departure:"16:30",from:"GARDONE",arrival:"19:20",to:"DESENZANO"},
  "33":{departure:"08:35",from:"GARDA",arrival:"09:35",to:"PESCHIERA"},
  "34":{departure:"09:45",from:"PESCHIERA",arrival:"11:10",to:"GARDA"},
  "35":{departure:"11:10",from:"GARDA",arrival:"12:10",to:"PESCHIERA"},
  "36":{departure:"13:10",from:"PESCHIERA",arrival:"15:25",to:"GARDA"},
  "37":{departure:"15:30",from:"GARDA",arrival:"16:30",to:"PESCHIERA"},
  "38":{departure:"16:35",from:"PESCHIERA",arrival:"17:35",to:"GARDA"},
  "39":{departure:"17:35",from:"GARDA",arrival:"19:00",to:"PESCHIERA"},
  "40":{departure:"08:15",from:"DESENZANO",arrival:"08:45",to:"MANERBA (DUSANO)"},
  "41":{departure:"08:45",from:"MANERBA (DUSANO)",arrival:"09:40",to:"SIRMIONE"},
  "42":{departure:"09:40",from:"SIRMIONE",arrival:"11:00",to:"GARDA"},
  "43":{departure:"11:00",from:"GARDA",arrival:"13:20",to:"PESCHIERA"},
  "44":{departure:"14:20",from:"PESCHIERA",arrival:"15:37",to:"MANERBA (DUSANO)"},
  "45":{departure:"15:37",from:"MANERBA (DUSANO)",arrival:"16:25",to:"DESENZANO"},
  "46":{departure:"16:35",from:"DESENZANO",arrival:"17:21",to:"MANERBA (DUSANO)"},
  "47":{departure:"17:21",from:"MANERBA (DUSANO)",arrival:"18:10",to:"DESENZANO"},
  "48":{departure:"18:15",from:"DESENZANO",arrival:"18:58",to:"MANERBA (DUSANO)"},
  "49":{departure:"18:58",from:"MANERBA (DUSANO)",arrival:"19:45",to:"DESENZANO"},
  "61":{departure:"08:00",from:"RIVA",arrival:"08:55",to:"MALCESINE CENTRO"},
  "62":{departure:"08:55",from:"MALCESINE CENTRO",arrival:"10:00",to:"RIVA"},
  "63":{departure:"10:05",from:"RIVA",arrival:"11:15",to:"MALCESINE CENTRO"},
  "64":{departure:"11:15",from:"MALCESINE CENTRO",arrival:"12:35",to:"RIVA"},
  "65":{departure:"13:35",from:"RIVA",arrival:"14:30",to:"MALCESINE CENTRO"},
  "66":{departure:"14:30",from:"MALCESINE CENTRO",arrival:"15:45",to:"RIVA"},
  "67":{departure:"15:50",from:"RIVA",arrival:"16:35",to:"MALCESINE CENTRO"},
  "68":{departure:"16:35",from:"MALCESINE CENTRO",arrival:"17:45",to:"RIVA"},
  "69":{departure:"17:50",from:"RIVA",arrival:"18:45",to:"MALCESINE CENTRO"},
  "70":{departure:"18:45",from:"MALCESINE CENTRO",arrival:"19:30",to:"RIVA"},
  "71":{departure:"08:40",from:"RIVA",arrival:"09:45",to:"MALCESINE CENTRO"},
  "72":{departure:"09:45",from:"MALCESINE CENTRO",arrival:"11:00",to:"RIVA"},
  "73":{departure:"11:10",from:"RIVA",arrival:"12:25",to:"MALCESINE CENTRO"},
  "74":{departure:"12:25",from:"MALCESINE CENTRO",arrival:"13:30",to:"RIVA"},
  "75":{departure:"14:30",from:"RIVA",arrival:"15:45",to:"MALCESINE CENTRO"},
  "76":{departure:"15:45",from:"MALCESINE CENTRO",arrival:"16:40",to:"RIVA"},
  "77":{departure:"16:50",from:"RIVA",arrival:"18:05",to:"MALCESINE CENTRO"},
  "78":{departure:"18:05",from:"MALCESINE CENTRO",arrival:"19:20",to:"RIVA"},
  "81":{departure:"09:20",from:"RIVA",arrival:"10:42",to:"CAMPIONE (TREMOSINE)"},
  "82":{departure:"10:42",from:"CAMPIONE (TREMOSINE)",arrival:"11:55",to:"RIVA"},
  "83":{departure:"12:00",from:"RIVA",arrival:"13:05",to:"MALCESINE CENTRO"},
  "84":{departure:"14:10",from:"MALCESINE CENTRO",arrival:"14:30",to:"LIMONE CENTRO"},
  "85":{departure:"14:35",from:"LIMONE CENTRO",arrival:"14:55",to:"MALCESINE CENTRO"},
  "86":{departure:"14:55",from:"MALCESINE CENTRO",arrival:"15:55",to:"RIVA"},
  "87":{departure:"16:05",from:"RIVA",arrival:"17:20",to:"ASSENZA DI BRENZONE"},
  "88":{departure:"17:20",from:"ASSENZA DI BRENZONE",arrival:"18:35",to:"RIVA"},
  "89":{departure:"18:40",from:"RIVA",arrival:"19:45",to:"MALCESINE CENTRO"},
  "90":{departure:"19:45",from:"MALCESINE CENTRO",arrival:"20:30",to:"RIVA"},
  "91":{departure:"08:20",from:"MADERNO",arrival:"08:38",to:"PORTESE"},
  "92":{departure:"08:38",from:"PORTESE",arrival:"11:00",to:"LIMONE CENTRO"},
  "93":{departure:"11:00",from:"LIMONE CENTRO",arrival:"13:05",to:"SALO'"},
  "95":{departure:"14:05",from:"SALO'",arrival:"14:15",to:"PORTESE"},
  "96":{departure:"14:15",from:"PORTESE",arrival:"16:30",to:"LIMONE CENTRO"},
  "97":{departure:"16:30",from:"LIMONE CENTRO",arrival:"18:25",to:"GARDA"},
  "98":{departure:"18:25",from:"GARDA",arrival:"19:50",to:"MADERNO"},
  "110":{departure:"08:50",from:"PESCHIERA",arrival:"11:05",to:"LIMONE CENTRO"},
  "111":{departure:"11:10",from:"LIMONE CENTRO",arrival:"13:05",to:"DESENZANO"},
  "112":{departure:"14:30",from:"DESENZANO",arrival:"16:45",to:"RIVA"},
  "113":{departure:"16:45",from:"RIVA",arrival:"19:30",to:"PESCHIERA"},
  "114":{departure:"19:00",from:"DESENZANO",arrival:"19:30",to:"PESCHIERA"},
  "151":{departure:"08:20",from:"RIVA",arrival:"11:40",to:"DESENZANO"},
  "152":{departure:"12:40",from:"DESENZANO",arrival:"13:28",to:"GARDA"},
  "153":{departure:"13:28",from:"GARDA",arrival:"15:00",to:"PESCHIERA"},
  "155":{departure:"16:10",from:"PESCHIERA",arrival:"16:35",to:"DESENZANO"},
  "156":{departure:"16:10",from:"PESCHIERA",arrival:"19:40",to:"RIVA"},
  "159":{departure:"08:30",from:"PESCHIERA",arrival:"09:15",to:"DESENZANO"},
  "160":{departure:"09:20",from:"DESENZANO",arrival:"12:15",to:"RIVA"},
  "161":{departure:"13:25",from:"RIVA",arrival:"15:32",to:"SIRMIONE"},
  "162":{departure:"15:37",from:"SIRMIONE",arrival:"17:15",to:"LIMONE CENTRO"},
  "163":{departure:"17:20",from:"LIMONE CENTRO",arrival:"19:35",to:"PESCHIERA"},
  "201":{departure:"08:00",from:"MADERNO",arrival:"08:30",to:"TORRI"},
  "202":{departure:"08:35",from:"TORRI",arrival:"09:05",to:"MADERNO"},
  "203":{departure:"09:10",from:"MADERNO",arrival:"09:40",to:"TORRI"},
  "204":{departure:"09:45",from:"TORRI",arrival:"10:15",to:"MADERNO"},
  "205":{departure:"10:25",from:"MADERNO",arrival:"10:55",to:"TORRI"},
  "206":{departure:"11:05",from:"TORRI",arrival:"11:35",to:"MADERNO"},
  "207":{departure:"11:45",from:"MADERNO",arrival:"12:15",to:"TORRI"},
  "208":{departure:"12:25",from:"TORRI",arrival:"13:00",to:"MADERNO"},
  "209":{departure:"14:00",from:"MADERNO",arrival:"14:30",to:"TORRI"},
  "210":{departure:"14:40",from:"TORRI",arrival:"15:10",to:"MADERNO"},
  "211":{departure:"15:20",from:"MADERNO",arrival:"15:50",to:"TORRI"},
  "212":{departure:"16:00",from:"TORRI",arrival:"16:30",to:"MADERNO"},
  "213":{departure:"16:40",from:"MADERNO",arrival:"17:10",to:"TORRI"},
  "214":{departure:"17:20",from:"TORRI",arrival:"17:50",to:"MADERNO"},
  "215":{departure:"18:00",from:"MADERNO",arrival:"18:30",to:"TORRI"},
  "216":{departure:"18:40",from:"TORRI",arrival:"19:10",to:"MADERNO"},
  "217":{departure:"19:15",from:"MADERNO",arrival:"19:45",to:"TORRI"},
  "218":{departure:"19:50",from:"TORRI",arrival:"20:20",to:"MADERNO"},
  "231":{departure:"08:35",from:"MADERNO",arrival:"09:05",to:"TORRI"},
  "232":{departure:"09:10",from:"TORRI",arrival:"09:40",to:"MADERNO"},
  "233":{departure:"09:45",from:"MADERNO",arrival:"10:15",to:"TORRI"},
  "234":{departure:"10:25",from:"TORRI",arrival:"10:55",to:"MADERNO"},
  "235":{departure:"11:05",from:"MADERNO",arrival:"11:35",to:"TORRI"},
  "236":{departure:"11:45",from:"TORRI",arrival:"12:15",to:"MADERNO"},
  "237":{departure:"12:25",from:"MADERNO",arrival:"13:00",to:"TORRI"},
  "238":{departure:"14:00",from:"TORRI",arrival:"14:30",to:"MADERNO"},
  "239":{departure:"14:40",from:"MADERNO",arrival:"15:10",to:"TORRI"},
  "240":{departure:"15:20",from:"TORRI",arrival:"15:50",to:"MADERNO"},
  "241":{departure:"16:00",from:"MADERNO",arrival:"16:30",to:"TORRI"},
  "242":{departure:"16:40",from:"TORRI",arrival:"17:10",to:"MADERNO"},
  "243":{departure:"17:20",from:"MADERNO",arrival:"17:50",to:"TORRI"},
  "244":{departure:"18:00",from:"TORRI",arrival:"18:30",to:"MADERNO"},
  "245":{departure:"18:40",from:"MADERNO",arrival:"19:10",to:"TORRI"},
  "246":{departure:"19:15",from:"TORRI",arrival:"19:45",to:"MADERNO"}
};

const NAVI_SHIFT_COURSES = {
  "D1":[22,23,24,25,26,27],
  "D2":[8,9,10,11,12,13],
  "D3":[28,29,30,31],
  "D4":[40,41,42,43,44,45,46,47,48,49],
  "T1":[201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218],
  "T2":[231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246],
  "M1":[91,92,93,95,96,97,98],
  "R1":[5,6],
  "R2":[61,62,63,64,65,66,67,68,69,70],
  "R3":[71,72,73,74,75,76,77,78],
  "R4":[81,82,83,84,85,86,87,88,89,90],
  "CAR1":[151,152,153,155,156],
  "P1":[2,3],
  "P2":[14,15,16,17,18,19],
  "P3":[33,34,35,36,37,38,39],
  "CAP1":[159,160,161,162,163],
  "SR1":[110,111,112,113,114]
};

const NAVI_SPECIAL_SHIFT_TIMES = {
  "P3":{start:"07:45",end:"19:00",from:"PESCHIERA",to:"PESCHIERA",note:"Posizionamento Peschiera → Garda alle 07:45"},
  "IE":{start:"07:00",end:"19:00",from:"",to:"",note:"Orario indicato nel prospetto competenze"},
  "BIS":{start:"09:00",end:"19:15",from:"DESENZANO",to:"DESENZANO",note:"Disponibile a muovere 09:00; rientro 18:45, arrivo 19:15"}
};

function naviCalendarCanonicalShift_(shiftValue) {
  const shift = String(shiftValue || "").trim().toUpperCase().replace(/\*+$/, "");
  const aliases = {"CAR":"CAR1","CAP":"CAP1"};
  return aliases[shift] || shift;
}

function naviCalendarMinutes_(time) {
  const parts = String(time || "").split(":").map(Number);
  return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
}

function getNaviCalendarTiming_(shiftValue) {
  const shift = naviCalendarCanonicalShift_(shiftValue);
  const numbers = NAVI_SHIFT_COURSES[shift] || [];
  const courses = numbers.map(function(number) {
    const course = NAVI_COURSE_SCHEDULE[String(number)];
    return course ? Object.assign({number:number}, course) : null;
  }).filter(Boolean);
  const special = NAVI_SPECIAL_SHIFT_TIMES[shift] || null;
  if (!courses.length && !special) return null;

  let start = special && special.start || "";
  let end = special && special.end || "";
  let from = special && special.from || "";
  let to = special && special.to || "";
  if (courses.length) {
    const first = courses.reduce(function(best, item) {
      return !best || naviCalendarMinutes_(item.departure) < naviCalendarMinutes_(best.departure) ? item : best;
    }, null);
    const last = courses.reduce(function(best, item) {
      return !best || naviCalendarMinutes_(item.arrival) > naviCalendarMinutes_(best.arrival) ? item : best;
    }, null);
    if (!start || naviCalendarMinutes_(first.departure) < naviCalendarMinutes_(start)) {
      start = first.departure;
      from = first.from;
    }
    if (!end || naviCalendarMinutes_(last.arrival) > naviCalendarMinutes_(end)) {
      end = last.arrival;
      to = last.to;
    }
  }
  return {shift:shift,start:start,end:end,from:from,to:to,courses:courses,note:special && special.note || ""};
}
