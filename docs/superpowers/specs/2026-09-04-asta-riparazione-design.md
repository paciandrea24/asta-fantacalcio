# Asta di riparazione — design

Data: 2026-09-04
Stato: approvato, pronto per il piano di implementazione

## 1. Contesto

L'asta iniziale della lega si è svolta a calciomercato ancora aperto. A mercato
chiuso si tiene un'asta di riparazione con un regolamento diverso da quello
dell'asta estiva: le rose sono già complete a 25 giocatori, quindi ogni acquisto
è possibile solo liberando un giocatore già in squadra.

Il tool attuale (`index.html`) è tarato sull'asta estiva: assume rose da
riempire, e la sua `calcolaStatisticheSquadra()` calcola l'offerta massima come
`residui - (slot mancanti - 1)`, che su una rosa piena vale sempre 0. Non è
utilizzabile così com'è per la riparazione.

L'asta si gioca dal vivo insieme a un socio su due dispositivi diversi: ogni
dato deve essere condiviso in tempo reale, come già avviene oggi via Firebase.

## 2. Regolamento formalizzato

1. Prima di iniziare, ogni squadra riceve **+50 crediti** sul residuo attuale.
2. Si procede per reparto nell'ordine **P → D → C → A**.
3. Si acquista prima il giocatore, poi si libera un giocatore già in rosa
   **dello stesso ruolo** per fargli posto. La rosa resta sempre a 25.
4. Lo svincolo restituisce **metà del prezzo di acquisto, arrotondata per
   difetto**. Un giocatore preso a 1 credito ne restituisce 1.
5. Si può offrire più dei propri crediti residui, a patto che esista in rosa un
   giocatore dello stesso ruolo il cui svincolo copra la differenza.
6. Il giocatore liberato torna immediatamente tra gli svincolati ed è
   riacquistabile da chiunque, compresa la squadra che lo ha liberato.

Esempio di riferimento: 50 crediti residui, in rosa un difensore pagato 20.
Il suo svincolo rende 10, quindi si può arrivare a **60** su un difensore.

## 3. Precondizioni: i dati di partenza

La pagina di riparazione **non importa nulla**. Legge lo stato che la pagina
base ha già prodotto. Prima dell'asta vanno eseguiti, in quest'ordine e dalla
pagina base:

1. **Listone quotazioni aggiornato** (`.xlsx`) — obbligatoriamente la versione
   post-mercato. Quello di agosto contiene giocatori che hanno cambiato squadra
   e non contiene i nuovi arrivati.
2. **Rose della lega** (`.xlsx` esportato da al-fantalega, già post-mercato).
3. **Crediti residui**, corretti a mano dal tasto "Crediti": il file della lega
   non contiene informazioni sui crediti (verificato sia sull'`.xlsx` sia sul
   CSV `Squadra,ID,Costo`).

L'ordine non è invertibile: l'import del listone azzera le rose
(`index.html:1041`).

La lista svincolati non è un file: è `players.filter(p => p.status === 'free')`,
cioè il listone meno i giocatori assegnati alle rose.

Un giocatore presente in rosa ma assente dal listone aggiornato viene mantenuto
in squadra con il flag `fuoriListone` e il suo prezzo pagato
(`index.html:1170`). Sono tipicamente giocatori che hanno lasciato la Serie A:
peso morto, e quindi i primi candidati allo svincolo. Ma possono anche essere
falsi positivi dovuti al match per nome, quindi vanno segnalati, non svincolati
automaticamente.

## 4. Architettura

Nuovo file **`riparazione.html`**, raggiungibile da un tasto nell'header di
`index.html`. Carica lo stesso `config.js` e si aggancia allo **stesso nodo
Firebase** `asta_live_2026`: rose, prezzi e crediti sono gli stessi della pagina
base, e i due dispositivi restano sincronizzati con il meccanismo già in uso.

Il motore di calcolo vive in **`riparazione-core.js`**: funzioni pure, nessun
accesso al DOM, nessuna dipendenza da Firebase. È il file che regge i soldi
veri dell'asta e dev'essere verificabile in isolamento.

**`test-riparazione.html`** carica `riparazione-core.js` ed esegue una batteria
di assert nel browser, stampando gli esiti in pagina. Il repo non ha né build né
test runner: questa è la forma di test che non introduce dipendenze.

### Modifiche a `index.html`

Tre, tutte minime:

1. `salvaDati()` (`index.html:910`): `dbRef.set({...})` → `dbRef.update({...})`.
   `set()` sostituisce l'intero nodo, quindi cancellerebbe il ramo
   `riparazione` a ogni salvataggio della pagina base. `update()` preserva le
   chiavi non menzionate.
2. Un tasto "Asta di Riparazione" nell'header della dashboard.
3. `annullaAcquisto()` (`index.html:1790`) rifiuta le voci con
   `tipo: 'riparazione'`, rimandando alla pagina dedicata. Il cestino della
   cronologia della pagina base toglierebbe il giocatore acquistato senza
   rimettere in rosa quello liberato e senza correggere il budget: lascerebbe
   la squadra a 24 giocatori con i crediti sbagliati. È l'unico modo in cui le
   due pagine possono corrompersi a vicenda, e va chiuso.

Non si tocca altro: il tool dell'asta estiva resta funzionante e invariato.

## 5. Modello dati

Al nodo `asta_live_2026` si aggiunge un solo ramo:

```js
riparazione: {
  bonusApplicato: false,   // impedisce la doppia applicazione del +50
  bonusValore: 50,
  miaSquadraId: null,      // condiviso: io e il socio siamo la stessa squadra
  ruoloCorrente: 'P'       // fase dell'asta, sincronizzata
}
```

Le operazioni finiscono nel `historyLog` esistente, con campi aggiuntivi che
`renderCronologia()` della pagina base ignora senza rompersi:

```js
{
  playerId,          // giocatore acquistato
  teamId,            // squadra acquirente
  price,             // prezzo pagato
  tipo: 'riparazione',
  svincolatoId,      // giocatore liberato (null se non serviva svincolo)
  svincolatoPrezzo,  // prezzo che aveva pagato: indispensabile per l'annullo
  rimborso,          // crediti restituiti
  ts                 // timestamp
}
```

`svincolatoPrezzo` va memorizzato perché lo svincolo cancella `player.price`:
senza di esso l'operazione non è reversibile.

## 6. Motore di calcolo

```js
const MAX_SLOTS  = { P: 3, D: 8, C: 8, A: 6 };
const ROSA_PIENA = 25;
```

### Funzioni

```js
rimborso(giocatore) -> intero >= 1
    max(1, floor((giocatore.price || 0) / 2))
```

Copre sia la regola generale sia il caso esplicito del giocatore preso a 1, che
restituisce 1. Un prezzo 0 o mancante vale 1.

```js
statoSquadra(team) -> { spesi, residui, slotOccupati, totale }
    spesi   = somma dei price della rosa
    residui = team.budget - spesi
```

Identica a `calcolaStatisticheSquadra()` tranne che **non calcola `maxOfferta`**:
la regola "tieni 1 credito per ogni slot mancante" è dell'asta estiva e qui non
si applica.

```js
serveSvincolo(team, ruolo) -> bool
    slotOccupati[ruolo] >= MAX_SLOTS[ruolo] || totale >= ROSA_PIENA
```

```js
candidatiSvincolo(team, ruolo) -> [{ player, rimborso, fuoriListone }]
```

Tutti i giocatori di quel ruolo in rosa, con il loro rimborso.

```js
maxPuntata(team, ruolo) -> intero
    se !serveSvincolo:
        residui
    altrimenti se candidati.length > 0:
        residui + max{ rimborso(c) : c in candidati }
    altrimenti:
        0   // reparto pieno e nessun giocatore liberabile: non puo comprare
```

```js
valutaOfferta(team, ruolo, prezzo) -> {
  ammessa, serveSvincolo, candidatiValidi, suggerito, residuiDopo(c)
}
    mancante        = prezzo - residui
    candidatiValidi = candidati con rimborso >= mancante
    residuiDopo(c)  = residui - prezzo + rimborso(c)
    ammessa         = candidatiValidi.length > 0   (oppure prezzo <= residui
                      quando lo svincolo non serve)
```

### Scelta del suggerito

Tra i candidati validi:

1. prima i `fuoriListone`, ordinati per **rimborso decrescente** — non valgono
   nulla in campo, quindi tanto vale incassare il massimo;
2. poi gli altri, ordinati per **rimborso crescente** — si sacrifica il
   giocatore che copre il costo perdendo il meno possibile.

Il suggerito è il primo della lista. È una proposta: l'utente vede tutti i
candidati e sceglie.

### Effetto sul budget

```js
team.budget += rimborso - svincolatoPrezzo
```

Derivazione: `residui = budget - Σprezzi`. Dopo l'operazione la somma dei prezzi
varia di `+prezzo - svincolatoPrezzo`, e si vuole
`residui_dopo = residui - prezzo + rimborso`. Sostituendo si ottiene
`budget_nuovo = budget + rimborso - svincolatoPrezzo`.

Verifica sull'esempio: residui 50, acquisto a 60, svincolo di un giocatore da 20
(rimborso 10). `budget -= 10`; la somma dei prezzi sale di 40; residui finali
`50 - 60 + 10 = 0`. Corretto.

Il bonus di inizio asta è `team.budget += 50` per ogni squadra, una volta sola,
protetto dal flag `bonusApplicato` condiviso.

## 7. Interfaccia

### Header

Fase ruolo `P | D | C | A` sincronizzata, selettore "La mia squadra", tasto
"+50 crediti a tutti" che si disabilita dopo l'uso, ritorno alla pagina base,
dark mode (stesso meccanismo `localStorage` di `index.html`).

### Controllo di freschezza dei dati

In apertura la pagina mostra: numero di giocatori nel listone, numero di
svincolati, numero di giocatori in rosa marcati `fuoriListone`. Se lo stato è
vuoto o senza rose, al posto del tabellone compare un avviso che rimanda alla
pagina base con i tre passi in ordine. Se i `fuoriListone` sono molti, un
banner segnala che il listone è probabilmente vecchio.

### Colonna sinistra — Banco d'asta

Ricerca tra gli svincolati del ruolo corrente, ordinati per FVM. Giocatore
selezionato, prezzo con `-5 -1 +1 +5`, squadra acquirente da una griglia
compatta. Sotto, la **lista dei candidati allo svincolo** di quella squadra:
ogni riga mostra prezzo pagato, rimborso e residuo risultante, in verde se
copre il prezzo corrente, in rosso se non basta. I `fuoriListone` hanno un badge
dedicato con l'avvertenza che potrebbe trattarsi di un mancato match sul nome.
Tutto si ricolora dinamicamente al variare del prezzo. Un solo tasto "Conferma
operazione".

### Colonna destra — Il mio pannello

Crediti residui, max puntata sul ruolo in corso, elenco dei propri candidati con
rimborso e residuo risultante.

### Colonna destra — Tabellone avversari

Una riga per squadra con: crediti residui, max puntata sul ruolo corrente,
semaforo "può rilanciare al prezzo attuale" che si aggiorna mentre il prezzo
sale, giocatore che sarebbe costretta a svincolare, slot occupati P/D/C/A.

Nota: la logica di `renderGrigliaSquadreAsta()` che marca fuori gioco chi ha il
reparto pieno **non va riportata qui**. Nella riparazione il reparto pieno è la
condizione normale.

### Cronologia riparazione

Voci nella forma `acquisto → svincolo` con i crediti mossi, ciascuna con il
tasto di annullo.

## 8. Flusso operativo e annullo

La conferma è **atomica**: acquisto e svincolo in una sola scrittura di stato.
La rosa non passa mai per 26 giocatori e i crediti non diventano mai negativi,
nemmeno transitoriamente.

L'annullo ripristina lo stato esatto precedente: il giocatore liberato torna in
rosa con `svincolatoPrezzo`, l'acquistato torna tra gli svincolati, il budget
viene riportato indietro di `rimborso - svincolatoPrezzo`.

L'annullo è **rifiutato con un messaggio esplicito** se nel frattempo:

- il giocatore liberato è stato riacquistato da qualcuno, oppure
- il giocatore acquistato non è più nella rosa di quella squadra.

In diretta un rifiuto chiaro è preferibile a un ripristino che sfascia lo stato.

## 9. Casi limite

| Caso | Comportamento |
|---|---|
| Rosa incompleta (< 25 o reparto non pieno) | Compare l'opzione esplicita "nessuno svincolo". Mai default silenzioso. |
| Nessun candidato copre il prezzo | Conferma bloccata, messaggio con il max puntata effettivo. |
| Giocatore con `price` 0 o mancante | Rimborso 1. |
| Stato vuoto o senza rose | Avviso con i tre passi, tabellone non renderizzato. |
| Bonus già applicato | Tasto disabilitato, con indicazione che è già stato usato. |
| Stato in arrivo dal cloud durante un'operazione | Come in `index.html`: il flag `stoRicevendoDalCloud` evita il rimbalzo di scrittura. |
| `miaSquadraId` non impostato | Il pannello personale invita a scegliere la squadra; il resto funziona. |
| Annullo di un'operazione di riparazione tentato dalla pagina base | Rifiutato con un messaggio che rimanda a `riparazione.html`. |

## 10. Testing

`test-riparazione.html` copre almeno:

1. `rimborso`: 0→1, 1→1, 2→1, 3→1, 20→10, 60→30, 91→45.
2. `maxPuntata` su reparto pieno e su reparto con slot libero.
3. **Caso di riferimento**: residui 50, in rosa un D da 20 → max puntata 60;
   offerta 60 ammessa con quel candidato; offerta 61 rifiutata.
4. `valutaOfferta` con prezzo minore dei residui: tutti i candidati validi.
5. Scelta del suggerito: `fuoriListone` prima, poi rimborso crescente.
6. `applicaOperazione`: budget e residui risultanti corretti.
7. Round-trip `applica` + `annulla`: stato identico all'originale.
8. Annullo rifiutato se il liberato è stato riacquistato.
9. Bonus +50 applicato una sola volta.

## 11. Fuori scope

- Import da CSV con match per ID. Il CSV della lega (`Squadra,ID,Costo`) si
  aggancerebbe in modo esatto invece che per nome normalizzato, ma l'import
  `.xlsx` esistente funziona e non va toccato adesso.
- Svincoli multipli per finanziare un singolo acquisto.
- Divieto di riacquisto da parte della squadra che ha liberato il giocatore.
- Modifiche alla logica dell'asta estiva in `index.html`.
