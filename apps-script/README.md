# Attivazione del salvataggio cloud NaviDiaria

1. Aprire il progetto Google Apps Script già collegato al foglio NaviTurni.
2. Creare un nuovo file script chiamato `navidiaria-cloud.gs`.
3. Copiare nel file il contenuto di `navidiaria-cloud.gs` presente in questa cartella.
4. Salvare il progetto.
5. Aprire **Esegui il deployment → Gestisci deployment**.
6. Modificare il deployment Web App esistente e scegliere **Nuova versione**.
7. Mantenere **Esegui come: me** e l’accesso già usato dal sito.
8. Confermare il deployment. L’URL della Web App deve rimanere quello già configurato nel sito.

Al primo accesso aggiornato vengono create automaticamente due schede:

- `NAVIDIARIA_UTENTI`: registra ID, nome, hash del PIN e accessi;
- `NAVIDIARIA_DATI`: conserva il registro personale di ciascun agente.

Non vengono salvati PIN in chiaro. Le schede di NaviTurni esistenti non vengono modificate.

## Migrazione

Quando un agente accede per la prima volta dopo l’aggiornamento:

- il profilo viene registrato online;
- le giornate già presenti nel browser vengono unite all’archivio online;
- le modifiche successive vengono salvate sia localmente sia nel foglio centrale;
- se manca la rete, i dati restano locali e vengono sincronizzati al collegamento successivo.
