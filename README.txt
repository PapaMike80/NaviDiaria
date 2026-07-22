NAVIDIARIA - VERSIONE LOCALE PULITA

Avvio consigliato su Windows:
1. Aprire il terminale nella cartella del progetto.
2. Eseguire: node server.js
3. Aprire: http://127.0.0.1:8765/

Non aprire direttamente le pagine con file://: la condivisione della sessione tra
le pagine non è garantita dai browser in questa modalità.

Pagina iniziale e accesso unico: index.html
Turni: naviturni.html
Ricerca cambi: cambi_turno.html
Diaria: navidiaria.html
Documenti: documenti.html
Impostazioni: impostazioni.html

La pagina Documenti legge i PDF nelle cartelle /ods e /turni. Il file
documenti.json contiene titoli, date e descrizioni di riserva.

I file non più caricati dal portale sono conservati in /archivio/legacy-code e
non devono essere pubblicati su GitHub.
