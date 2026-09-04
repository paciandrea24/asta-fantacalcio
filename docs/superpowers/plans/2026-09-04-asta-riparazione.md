# Asta di Riparazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pagina dedicata all'asta di riparazione che, al variare del prezzo di un giocatore all'asta, dice in tempo reale se una squadra può permetterselo e quale giocatore deve svincolare per arrivarci.

**Architecture:** Un motore di calcolo puro in `riparazione-core.js` (nessun DOM, nessun Firebase, testabile con `node`), consumato da una nuova pagina `riparazione.html` che si aggancia allo stesso nodo Firebase `asta_live_2026` già usato da `index.html`. La pagina base viene toccata in tre punti minimi. Nessun build step, nessuna dipendenza nuova.

**Tech Stack:** HTML statico, JavaScript vanilla ES5-compatibile, Tailwind CSS via CDN, Firebase Realtime Database compat v10.12.2, Node 20 come test runner.

**Spec:** `docs/superpowers/specs/2026-09-04-asta-riparazione-design.md`

## Global Constraints

- **Nessun build step, nessun package manager.** I file si aprono direttamente nel browser. Vietato introdurre `npm install`, bundler, o import ES6 fra file.
- **JavaScript compatibile con gli script classici**: `riparazione-core.js` viene caricato sia con `<script src>` sia con `require()` di Node. Nessun `import`/`export`, nessun top-level `await`.
- **Nodo Firebase condiviso:** `asta_live_2026`. La pagina di riparazione scrive con `update()`, mai con `set()`.
- **Limiti di rosa:** `MAX_SLOTS = { P: 3, D: 8, C: 8, A: 6 }`, `ROSA_PIENA = 25`.
- **Regola del rimborso:** `max(1, floor(prezzo / 2))`. Un giocatore preso a 1 restituisce 1.
- **Effetto sul budget di un'operazione:** `team.budget += rimborso - svincolatoPrezzo`.
- **Bonus di inizio asta:** +50 crediti a ogni squadra, una sola volta, protetto da flag condiviso.
- **Lingua dell'interfaccia e dei commenti:** italiano, con accenti corretti.
- **Stile visivo:** riusare le classi Tailwind di `index.html` (badge ruolo, dark mode via classe `dark` sull'elemento `html`, `localStorage` chiave `fanta_dark_mode`).

---

### Task 1: Motore di calcolo — fondamenta e test runner

**Files:**
- Create: `riparazione-core.js`
- Create: `test-riparazione.js`
- Create: `test-riparazione.html`

**Interfaces:**
- Consumes: niente.
- Produces: `RiparazioneCore.MAX_SLOTS`, `RiparazioneCore.ROSA_PIENA`, `rimborso(giocatore) -> number`, `statoSquadra(team) -> { spesi, residui, totale, slotOccupati }`. In Node l'oggetto arriva da `require('./riparazione-core.js')`, nel browser da `window.RiparazioneCore`.

- [ ] **Step 1: Scrivere il test runner e i primi test che falliscono**

Crea `test-riparazione.js`:

```js
// Test del motore di calcolo dell'asta di riparazione.
// Gira headless con `node test-riparazione.js` e in pagina con test-riparazione.html.
var CORE = (typeof require !== 'undefined')
    ? require('./riparazione-core.js')
    : window.RiparazioneCore;

var passati = 0, falliti = 0;
var righe = [];

function eq(nome, ottenuto, atteso) {
    var a = JSON.stringify(ottenuto), b = JSON.stringify(atteso);
    if (a === b) { passati++; righe.push({ ok: true, testo: 'OK   ' + nome }); }
    else { falliti++; righe.push({ ok: false, testo: 'FAIL ' + nome + '\n     atteso:   ' + b + '\n     ottenuto: ' + a }); }
}

function squadra(opzioni) {
    return {
        id: opzioni.id === undefined ? 0 : opzioni.id,
        name: opzioni.name || 'Squadra',
        budget: opzioni.budget,
        players: opzioni.players || []
    };
}

function giocatore(id, role, price, extra) {
    var p = { id: id, name: 'G' + id, role: role, team: 'Inter', status: 'sold', soldTo: 0, price: price, fvm: 10, qta: 5 };
    if (extra) { for (var k in extra) p[k] = extra[k]; }
    return p;
}

// --- rimborso ---
eq('rimborso di un giocatore preso a 1', CORE.rimborso({ price: 1 }), 1);
eq('rimborso di un giocatore preso a 2', CORE.rimborso({ price: 2 }), 1);
eq('rimborso di un giocatore preso a 3', CORE.rimborso({ price: 3 }), 1);
eq('rimborso di un giocatore preso a 20', CORE.rimborso({ price: 20 }), 10);
eq('rimborso di un giocatore preso a 60', CORE.rimborso({ price: 60 }), 30);
eq('rimborso di un giocatore preso a 91', CORE.rimborso({ price: 91 }), 45);
eq('rimborso con prezzo 0', CORE.rimborso({ price: 0 }), 1);
eq('rimborso con prezzo mancante', CORE.rimborso({}), 1);

// --- statoSquadra ---
var t1 = squadra({ budget: 100, players: [giocatore(1, 'P', 10), giocatore(2, 'D', 20), giocatore(3, 'D', 5)] });
eq('spesi', CORE.statoSquadra(t1).spesi, 35);
eq('residui', CORE.statoSquadra(t1).residui, 65);
eq('totale giocatori', CORE.statoSquadra(t1).totale, 3);
eq('slot occupati', CORE.statoSquadra(t1).slotOccupati, { P: 1, D: 2, C: 0, A: 0 });

// --- riepilogo ---
function riepilogo() { return { passati: passati, falliti: falliti, righe: righe }; }
if (typeof module !== 'undefined' && module.exports) {
    module.exports = riepilogo;
    righe.forEach(function (r) { console.log(r.testo); });
    console.log('\n' + passati + ' passati, ' + falliti + ' falliti');
    process.exit(falliti > 0 ? 1 : 0);
} else {
    window.RisultatiTest = riepilogo();
}
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `node test-riparazione.js`
Expected: FAIL con `Cannot find module './riparazione-core.js'`

- [ ] **Step 3: Scrivere l'implementazione minima**

Crea `riparazione-core.js`:

```js
// Motore di calcolo dell'asta di riparazione.
// Funzioni pure: niente DOM, niente Firebase, niente stato globale.
// Caricato sia come <script src> (espone window.RiparazioneCore)
// sia con require() da Node, per poterlo testare headless.
(function (global) {
    'use strict';

    var MAX_SLOTS = { P: 3, D: 8, C: 8, A: 6 };
    var ROSA_PIENA = 25;

    // Meta del prezzo pagato, arrotondata per difetto, con minimo 1:
    // il regolamento restituisce 1 anche per chi era stato preso a 1.
    function rimborso(giocatore) {
        var prezzo = (giocatore && giocatore.price) || 0;
        return Math.max(1, Math.floor(prezzo / 2));
    }

    function statoSquadra(team) {
        var rosa = (team && team.players) || [];
        var spesi = rosa.reduce(function (acc, p) { return acc + (p.price || 0); }, 0);
        return {
            spesi: spesi,
            residui: ((team && team.budget) || 0) - spesi,
            totale: rosa.length,
            slotOccupati: {
                P: rosa.filter(function (p) { return p.role === 'P'; }).length,
                D: rosa.filter(function (p) { return p.role === 'D'; }).length,
                C: rosa.filter(function (p) { return p.role === 'C'; }).length,
                A: rosa.filter(function (p) { return p.role === 'A'; }).length
            }
        };
    }

    var API = {
        MAX_SLOTS: MAX_SLOTS,
        ROSA_PIENA: ROSA_PIENA,
        rimborso: rimborso,
        statoSquadra: statoSquadra
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    else global.RiparazioneCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `node test-riparazione.js`
Expected: `12 passati, 0 falliti`, exit code 0

- [ ] **Step 5: Creare la pagina di test per il browser**

Crea `test-riparazione.html`:

```html
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Test motore asta di riparazione</title>
    <style>
        body { font-family: ui-monospace, Consolas, monospace; background: #0f172a; color: #e2e8f0; padding: 24px; }
        h1 { font-size: 18px; }
        .ok { color: #34d399; }
        .fail { color: #fb7185; font-weight: bold; }
        pre { margin: 2px 0; white-space: pre-wrap; }
        #riepilogo { margin-top: 16px; font-size: 16px; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Test motore asta di riparazione</h1>
    <div id="esiti"></div>
    <div id="riepilogo"></div>
    <script src="riparazione-core.js"></script>
    <script src="test-riparazione.js"></script>
    <script>
        var r = window.RisultatiTest;
        document.getElementById('esiti').innerHTML = r.righe
            .map(function (x) { return '<pre class="' + (x.ok ? 'ok' : 'fail') + '">' + x.testo + '</pre>'; })
            .join('');
        var box = document.getElementById('riepilogo');
        box.textContent = r.passati + ' passati, ' + r.falliti + ' falliti';
        box.className = r.falliti > 0 ? 'fail' : 'ok';
    </script>
</body>
</html>
```

- [ ] **Step 6: Verificare la pagina di test**

Apri `test-riparazione.html` nel browser.
Expected: 12 righe verdi e `12 passati, 0 falliti` in fondo.

- [ ] **Step 7: Commit**

```bash
git add riparazione-core.js test-riparazione.js test-riparazione.html
git commit -m "motore riparazione: rimborso e stato squadra"
```

---

### Task 2: Candidati allo svincolo e massimo puntabile

**Files:**
- Modify: `riparazione-core.js`
- Modify: `test-riparazione.js`

**Interfaces:**
- Consumes: `rimborso()`, `statoSquadra()`, `MAX_SLOTS`, `ROSA_PIENA` dal Task 1.
- Produces:
  - `serveSvincolo(team, ruolo) -> boolean`
  - `candidatiSvincolo(team, ruolo) -> Array<{ player, rimborso, fuoriListone }>`
  - `ordinaCandidati(lista) -> Array` (nuovo array, non muta l'ingresso)
  - `maxPuntata(team, ruolo) -> number`

- [ ] **Step 1: Scrivere i test che falliscono**

Inserisci in `test-riparazione.js`, subito prima del blocco `// --- riepilogo ---`:

```js
// --- serveSvincolo ---
var rosaPiena = [];
for (var i = 0; i < 3; i++) rosaPiena.push(giocatore(100 + i, 'P', 5));
for (var i = 0; i < 8; i++) rosaPiena.push(giocatore(200 + i, 'D', 5));
for (var i = 0; i < 8; i++) rosaPiena.push(giocatore(300 + i, 'C', 5));
for (var i = 0; i < 6; i++) rosaPiena.push(giocatore(400 + i, 'A', 5));
var piena = squadra({ budget: 175, players: rosaPiena });
eq('rosa piena: serve svincolo sui D', CORE.serveSvincolo(piena, 'D'), true);

var mezza = squadra({ budget: 100, players: [giocatore(1, 'D', 20), giocatore(2, 'D', 4)] });
eq('rosa incompleta: non serve svincolo', CORE.serveSvincolo(mezza, 'D'), false);

var repartoPieno = squadra({ budget: 100, players: [giocatore(1, 'P', 6), giocatore(2, 'P', 4), giocatore(3, 'P', 2)] });
eq('reparto P pieno con rosa corta: serve svincolo', CORE.serveSvincolo(repartoPieno, 'P'), true);
eq('reparto D libero con rosa corta: non serve svincolo', CORE.serveSvincolo(repartoPieno, 'D'), false);

// --- candidatiSvincolo ---
var conRuoliMisti = squadra({ budget: 100, players: [giocatore(1, 'D', 20), giocatore(2, 'C', 30), giocatore(3, 'D', 7)] });
eq('candidati solo del ruolo richiesto', CORE.candidatiSvincolo(conRuoliMisti, 'D').map(function (c) { return c.player.id; }), [1, 3]);
eq('rimborsi dei candidati', CORE.candidatiSvincolo(conRuoliMisti, 'D').map(function (c) { return c.rimborso; }), [10, 3]);
eq('nessun candidato per un ruolo assente', CORE.candidatiSvincolo(conRuoliMisti, 'A'), []);

// --- ordinaCandidati: fuori listone prima, col rimborso piu alto ---
var perOrdine = [
    { player: { id: 1 }, rimborso: 3, fuoriListone: false },
    { player: { id: 2 }, rimborso: 20, fuoriListone: true },
    { player: { id: 3 }, rimborso: 8, fuoriListone: false },
    { player: { id: 4 }, rimborso: 40, fuoriListone: true }
];
eq('ordine suggerito', CORE.ordinaCandidati(perOrdine).map(function (c) { return c.player.id; }), [4, 2, 1, 3]);
eq('ordinaCandidati non muta la lista di partenza', perOrdine.map(function (c) { return c.player.id; }), [1, 2, 3, 4]);

// --- maxPuntata: il caso di riferimento del regolamento ---
var riferimento = squadra({ budget: 100, players: rosaPiena.slice(0, 24).concat([giocatore(999, 'D', 20)]) });
// spesi = 23*5 + 20 = 135, budget 185 -> residui 50
riferimento.budget = 185;
eq('residui del caso di riferimento', CORE.statoSquadra(riferimento).residui, 50);
eq('max puntata sui D: 50 residui + 10 di rimborso', CORE.maxPuntata(riferimento, 'D'), 60);

eq('max puntata senza svincolo necessario', CORE.maxPuntata(mezza, 'D'), 76);
eq('max puntata a 0 se il reparto e pieno e non ci sono candidati', CORE.maxPuntata(squadra({ budget: 10, players: [] }), 'D'), 10);
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `node test-riparazione.js`
Expected: FAIL con `CORE.serveSvincolo is not a function`

- [ ] **Step 3: Scrivere l'implementazione**

In `riparazione-core.js`, aggiungi dopo `statoSquadra` e prima di `var API = {`:

```js
    // Nella riparazione la rosa e piena e il reparto anche: e la norma,
    // non un errore. Serve solo a decidere se lo svincolo e obbligatorio.
    function serveSvincolo(team, ruolo) {
        var s = statoSquadra(team);
        return s.slotOccupati[ruolo] >= MAX_SLOTS[ruolo] || s.totale >= ROSA_PIENA;
    }

    function candidatiSvincolo(team, ruolo) {
        return (((team && team.players) || [])
            .filter(function (p) { return p.role === ruolo; })
            .map(function (p) {
                return { player: p, rimborso: rimborso(p), fuoriListone: !!p.fuoriListone };
            }));
    }

    // Prima i fuori listone col rimborso piu alto: hanno lasciato la Serie A,
    // non valgono nulla in campo, quindi tanto vale incassare il massimo.
    // Poi gli altri col rimborso piu basso, per sacrificare il meno possibile.
    function ordinaCandidati(lista) {
        return lista.slice().sort(function (a, b) {
            if (a.fuoriListone !== b.fuoriListone) return a.fuoriListone ? -1 : 1;
            if (a.fuoriListone) return b.rimborso - a.rimborso;
            return a.rimborso - b.rimborso;
        });
    }

    function maxPuntata(team, ruolo) {
        var residui = statoSquadra(team).residui;
        if (!serveSvincolo(team, ruolo)) return Math.max(0, residui);
        var cand = candidatiSvincolo(team, ruolo);
        if (cand.length === 0) return 0;
        var migliore = cand.reduce(function (max, c) { return c.rimborso > max ? c.rimborso : max; }, 0);
        return Math.max(0, residui + migliore);
    }
```

Aggiungi le quattro voci all'oggetto `API`:

```js
        serveSvincolo: serveSvincolo,
        candidatiSvincolo: candidatiSvincolo,
        ordinaCandidati: ordinaCandidati,
        maxPuntata: maxPuntata,
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `node test-riparazione.js`
Expected: `25 passati, 0 falliti`

- [ ] **Step 5: Commit**

```bash
git add riparazione-core.js test-riparazione.js
git commit -m "motore riparazione: candidati svincolo e massimo puntabile"
```

---

### Task 3: Valutazione dinamica dell'offerta

**Files:**
- Modify: `riparazione-core.js`
- Modify: `test-riparazione.js`

**Interfaces:**
- Consumes: tutto il Task 2.
- Produces: `valutaOfferta(team, ruolo, prezzo)` che restituisce
  ```js
  {
    ammessa: boolean,
    serveSvincolo: boolean,
    maxPuntata: number,
    candidati: Array<{ player, rimborso, fuoriListone, residuiDopo, copre }>,  // ordinati
    candidatiValidi: Array<...>,   // sottoinsieme con copre === true
    suggerito: object | null,      // primo dei validi, null se non serve svincolo
    residuiSenzaSvincolo: number | null
  }
  ```
  È la funzione che l'interfaccia richiama a ogni variazione del prezzo.

- [ ] **Step 1: Scrivere i test che falliscono**

Inserisci in `test-riparazione.js` prima di `// --- riepilogo ---`:

```js
// --- valutaOfferta: il caso di riferimento, prezzo per prezzo ---
var v60 = CORE.valutaOfferta(riferimento, 'D', 60);
eq('offerta 60 ammessa', v60.ammessa, true);
eq('offerta 60 richiede uno svincolo', v60.serveSvincolo, true);
eq('offerta 60: un solo candidato copre', v60.candidatiValidi.length, 1);
eq('offerta 60: il candidato e il D da 20', v60.suggerito.player.id, 999);
eq('offerta 60: residui dopo l operazione', v60.suggerito.residuiDopo, 0);

var v61 = CORE.valutaOfferta(riferimento, 'D', 61);
eq('offerta 61 rifiutata', v61.ammessa, false);
eq('offerta 61: nessun candidato valido', v61.candidatiValidi.length, 0);
eq('offerta 61: suggerito nullo', v61.suggerito, null);
eq('offerta 61: max puntata riportato', v61.maxPuntata, 60);

var v30 = CORE.valutaOfferta(riferimento, 'D', 30);
eq('offerta sotto i residui: tutti i candidati coprono', v30.candidatiValidi.length, v30.candidati.length);
eq('offerta sotto i residui: resta comunque obbligatorio svincolare', v30.serveSvincolo, true);

// --- valutaOfferta con slot libero: nessuno svincolo richiesto ---
var vLibero = CORE.valutaOfferta(mezza, 'D', 40);
eq('slot libero: offerta ammessa senza svincolo', vLibero.ammessa, true);
eq('slot libero: nessuno svincolo richiesto', vLibero.serveSvincolo, false);
eq('slot libero: nessun suggerito', vLibero.suggerito, null);
eq('slot libero: residui dopo senza svincolo', vLibero.residuiSenzaSvincolo, 36);
var vTroppo = CORE.valutaOfferta(mezza, 'D', 100);
eq('slot libero ma crediti insufficienti', vTroppo.ammessa, false);

// --- valutaOfferta: il fuori listone viene proposto per primo ---
var conMorto = squadra({
    budget: 175,
    players: rosaPiena.slice(0, 23).concat([giocatore(998, 'A', 4), giocatore(997, 'A', 30, { fuoriListone: true })])
});
conMorto.budget = 200;
var vMorto = CORE.valutaOfferta(conMorto, 'A', 20);
eq('il fuori listone e il suggerito', vMorto.suggerito.player.id, 997);
eq('il fuori listone e marcato', vMorto.suggerito.fuoriListone, true);
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `node test-riparazione.js`
Expected: FAIL con `CORE.valutaOfferta is not a function`

- [ ] **Step 3: Scrivere l'implementazione**

In `riparazione-core.js`, dopo `maxPuntata`:

```js
    // Chiamata a ogni variazione del prezzo in asta: dice se la squadra puo
    // permettersi il giocatore e con quale svincolo ci arriva.
    function valutaOfferta(team, ruolo, prezzo) {
        var residui = statoSquadra(team).residui;
        var obbligatorio = serveSvincolo(team, ruolo);
        var mancante = prezzo - residui;

        var candidati = ordinaCandidati(candidatiSvincolo(team, ruolo)).map(function (c) {
            return {
                player: c.player,
                rimborso: c.rimborso,
                fuoriListone: c.fuoriListone,
                residuiDopo: residui - prezzo + c.rimborso,
                copre: c.rimborso >= mancante
            };
        });
        var validi = candidati.filter(function (c) { return c.copre; });

        if (!obbligatorio) {
            return {
                ammessa: prezzo <= residui,
                serveSvincolo: false,
                maxPuntata: maxPuntata(team, ruolo),
                candidati: candidati,
                candidatiValidi: validi,
                suggerito: null,
                residuiSenzaSvincolo: residui - prezzo
            };
        }
        return {
            ammessa: validi.length > 0,
            serveSvincolo: true,
            maxPuntata: maxPuntata(team, ruolo),
            candidati: candidati,
            candidatiValidi: validi,
            suggerito: validi.length > 0 ? validi[0] : null,
            residuiSenzaSvincolo: null
        };
    }
```

Aggiungi a `API`: `valutaOfferta: valutaOfferta,`

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `node test-riparazione.js`
Expected: `43 passati, 0 falliti`

- [ ] **Step 5: Commit**

```bash
git add riparazione-core.js test-riparazione.js
git commit -m "motore riparazione: valutazione dinamica dell offerta"
```

---

### Task 4: Applicazione, annullo e bonus

**Files:**
- Modify: `riparazione-core.js`
- Modify: `test-riparazione.js`

**Interfaces:**
- Consumes: tutto il Task 3.
- Produces:
  - `sincronizzaRose(stato) -> stato` (muta e restituisce lo stesso oggetto)
  - `applicaOperazione(stato, op) -> { ok, errore?, stato }` con `op = { playerId, teamId, price, svincolatoId, ts? }`
  - `annullaOperazione(stato, voce) -> { ok, errore?, stato }` dove `voce` è un elemento di `historyLog`
  - `applicaBonus(stato, valore) -> { ok, errore?, stato }`

  `stato` è sempre `{ teams, players, historyLog, riparazione }`. Tutte e tre le funzioni **non mutano** lo stato in ingresso: lo clonano e restituiscono il nuovo. In caso di errore restituiscono lo stato originale intatto.

**Nota di progettazione da rispettare:** dopo ogni giro nel cloud i giocatori esistono in due copie, una in `players` e una in `teams[].players`, perché Firebase serializza in JSON e le referenze si perdono. Mutare solo una delle due le fa divergere e i prezzi diventano sbagliati. Per questo ogni funzione modifica **solo `players`** e poi ricostruisce le rose con `sincronizzaRose`.

- [ ] **Step 1: Scrivere i test che falliscono**

Inserisci in `test-riparazione.js` prima di `// --- riepilogo ---`:

```js
// --- stato di prova completo ---
function statoDiProva() {
    var players = [
        giocatore(1, 'D', 20),            // in rosa alla squadra 0
        giocatore(2, 'D', 4),             // in rosa alla squadra 0
        { id: 3, name: 'LIBERO', role: 'D', team: 'Milan', status: 'free', fvm: 40, qta: 12 },
        { id: 4, name: 'LIBERO2', role: 'D', team: 'Roma', status: 'free', fvm: 20, qta: 8 }
    ];
    var stato = {
        teams: [{ id: 0, name: 'Mia', budget: 74, players: [] }],
        players: players,
        historyLog: [],
        riparazione: { bonusApplicato: false, bonusValore: 50, miaSquadraId: 0, ruoloCorrente: 'D' }
    };
    return CORE.sincronizzaRose(stato);
}

var s0 = statoDiProva();
eq('sincronizzaRose ricostruisce la rosa', s0.teams[0].players.map(function (p) { return p.id; }), [1, 2]);
eq('residui di partenza', CORE.statoSquadra(s0.teams[0]).residui, 50);

// --- applicaOperazione ---
var r1 = CORE.applicaOperazione(s0, { playerId: 3, teamId: 0, price: 60, svincolatoId: 1, ts: 111 });
eq('operazione riuscita', r1.ok, true);
eq('residui azzerati dopo acquisto a 60 e svincolo da 20', CORE.statoSquadra(r1.stato.teams[0]).residui, 0);
eq('rosa ancora di 2 giocatori', r1.stato.teams[0].players.length, 2);
eq('il comprato e in rosa', r1.stato.players.find(function (p) { return p.id === 3; }).soldTo, 0);
eq('il comprato ha il prezzo pagato', r1.stato.players.find(function (p) { return p.id === 3; }).price, 60);
eq('lo svincolato e libero', r1.stato.players.find(function (p) { return p.id === 1; }).status, 'free');
eq('lo svincolato non ha piu prezzo', r1.stato.players.find(function (p) { return p.id === 1; }).price, undefined);
eq('voce di cronologia', r1.stato.historyLog[0], {
    playerId: 3, teamId: 0, price: 60, tipo: 'riparazione',
    svincolatoId: 1, svincolatoPrezzo: 20, rimborso: 10, ts: 111
});
eq('lo stato di partenza non e stato mutato', s0.players.find(function (p) { return p.id === 3; }).status, 'free');

var r2 = CORE.applicaOperazione(s0, { playerId: 3, teamId: 0, price: 61, svincolatoId: 1, ts: 112 });
eq('operazione rifiutata per crediti insufficienti', r2.ok, false);

var r3 = CORE.applicaOperazione(s0, { playerId: 3, teamId: 0, price: 10, svincolatoId: 99, ts: 113 });
eq('operazione rifiutata: svincolato inesistente', r3.ok, false);

// --- annullaOperazione: round trip ---
var r4 = CORE.annullaOperazione(r1.stato, r1.stato.historyLog[0]);
eq('annullo riuscito', r4.ok, true);
eq('residui ripristinati', CORE.statoSquadra(r4.stato.teams[0]).residui, 50);
eq('rosa ripristinata', r4.stato.teams[0].players.map(function (p) { return p.id; }).sort(), [1, 2]);
eq('prezzo del ripristinato', r4.stato.players.find(function (p) { return p.id === 1; }).price, 20);
eq('il comprato e tornato libero', r4.stato.players.find(function (p) { return p.id === 3; }).status, 'free');
eq('cronologia svuotata', r4.stato.historyLog.length, 0);
eq('budget ripristinato', r4.stato.teams[0].budget, 74);

// --- annullo bloccato se il liberato e stato ricomprato ---
var dopoRiacquisto = CORE.applicaOperazione(r1.stato, { playerId: 1, teamId: 0, price: 5, svincolatoId: 2, ts: 114 });
eq('riacquisto del giocatore liberato riuscito', dopoRiacquisto.ok, true);
var r5 = CORE.annullaOperazione(dopoRiacquisto.stato, dopoRiacquisto.stato.historyLog[0]);
eq('annullo rifiutato: il liberato e stato ricomprato', r5.ok, false);

// --- applicaBonus ---
var b1 = CORE.applicaBonus(s0, 50);
eq('bonus applicato', b1.ok, true);
eq('budget aumentato di 50', b1.stato.teams[0].budget, 124);
eq('flag alzato', b1.stato.riparazione.bonusApplicato, true);
var b2 = CORE.applicaBonus(b1.stato, 50);
eq('secondo bonus rifiutato', b2.ok, false);
eq('budget invariato dopo il rifiuto', b2.stato.teams[0].budget, 124);
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `node test-riparazione.js`
Expected: FAIL con `CORE.sincronizzaRose is not a function`

- [ ] **Step 3: Scrivere l'implementazione**

In `riparazione-core.js`, dopo `valutaOfferta`:

```js
    function clona(stato) {
        return JSON.parse(JSON.stringify(stato));
    }

    // Dopo ogni giro nel cloud players[] e teams[].players sono due copie
    // JSON scollegate. Ricostruire le rose da players e l unico modo per
    // garantire che prezzi e stati non divergano.
    function sincronizzaRose(stato) {
        var perId = {};
        stato.teams.forEach(function (t) { t.players = []; perId[t.id] = t; });
        stato.players.forEach(function (p) {
            if (p.status === 'sold' && perId[p.soldTo]) perId[p.soldTo].players.push(p);
        });
        return stato;
    }

    // op = { playerId, teamId, price, svincolatoId, ts }
    // Acquisto e svincolo sono una cosa sola: la rosa non passa mai per 26
    // giocatori e i crediti non diventano mai negativi, nemmeno un istante.
    function applicaOperazione(stato, op) {
        var s = sincronizzaRose(clona(stato));
        var team = s.teams.find(function (t) { return t.id === op.teamId; });
        if (!team) return { ok: false, errore: 'Squadra non trovata.', stato: stato };

        var acquistato = s.players.find(function (p) { return p.id === op.playerId; });
        if (!acquistato) return { ok: false, errore: 'Giocatore non trovato nel listone.', stato: stato };
        if (acquistato.status === 'sold') return { ok: false, errore: acquistato.name + ' non e piu svincolato.', stato: stato };

        var prezzo = parseInt(op.price, 10);
        if (isNaN(prezzo) || prezzo < 1) return { ok: false, errore: 'Prezzo non valido.', stato: stato };

        var svincolato = null, prezzoSvincolato = 0, rimborsato = 0;
        if (op.svincolatoId !== null && op.svincolatoId !== undefined) {
            svincolato = s.players.find(function (p) { return p.id === op.svincolatoId; });
            if (!svincolato) return { ok: false, errore: 'Giocatore da svincolare non trovato.', stato: stato };
            if (svincolato.status !== 'sold' || svincolato.soldTo !== team.id) {
                return { ok: false, errore: svincolato.name + ' non e in rosa a ' + team.name + '.', stato: stato };
            }
            if (svincolato.role !== acquistato.role) {
                return { ok: false, errore: 'Lo svincolo deve essere di un giocatore dello stesso ruolo.', stato: stato };
            }
            prezzoSvincolato = svincolato.price || 0;
            rimborsato = rimborso(svincolato);
        } else if (serveSvincolo(team, acquistato.role)) {
            return { ok: false, errore: 'Reparto ' + acquistato.role + ' pieno: serve svincolare un giocatore dello stesso ruolo.', stato: stato };
        }

        var residuiDopo = statoSquadra(team).residui - prezzo + rimborsato;
        if (residuiDopo < 0) {
            return { ok: false, errore: 'Crediti insufficienti: il massimo per un ' + acquistato.role + ' e ' + maxPuntata(team, acquistato.role) + '.', stato: stato };
        }

        if (svincolato) {
            svincolato.status = 'free';
            delete svincolato.soldTo;
            delete svincolato.price;
        }
        acquistato.status = 'sold';
        acquistato.soldTo = team.id;
        acquistato.price = prezzo;
        team.budget = (team.budget || 0) + rimborsato - prezzoSvincolato;

        s.historyLog.push({
            playerId: acquistato.id,
            teamId: team.id,
            price: prezzo,
            tipo: 'riparazione',
            svincolatoId: svincolato ? svincolato.id : null,
            svincolatoPrezzo: prezzoSvincolato,
            rimborso: rimborsato,
            ts: op.ts || Date.now()
        });

        return { ok: true, stato: sincronizzaRose(s) };
    }

    function annullaOperazione(stato, voce) {
        var s = sincronizzaRose(clona(stato));
        var team = s.teams.find(function (t) { return t.id === voce.teamId; });
        var acquistato = s.players.find(function (p) { return p.id === voce.playerId; });
        if (!team || !acquistato) return { ok: false, errore: 'Operazione non ricostruibile.', stato: stato };
        if (acquistato.status !== 'sold' || acquistato.soldTo !== team.id) {
            return { ok: false, errore: acquistato.name + ' non e piu nella rosa di ' + team.name + ': annullo impossibile.', stato: stato };
        }

        var svincolato = null;
        if (voce.svincolatoId !== null && voce.svincolatoId !== undefined) {
            svincolato = s.players.find(function (p) { return p.id === voce.svincolatoId; });
            if (!svincolato) return { ok: false, errore: 'Giocatore liberato non trovato.', stato: stato };
            if (svincolato.status === 'sold') {
                return { ok: false, errore: svincolato.name + ' e stato ricomprato nel frattempo: annullo impossibile.', stato: stato };
            }
        }

        acquistato.status = 'free';
        delete acquistato.soldTo;
        delete acquistato.price;
        if (svincolato) {
            svincolato.status = 'sold';
            svincolato.soldTo = team.id;
            svincolato.price = voce.svincolatoPrezzo;
        }
        team.budget = (team.budget || 0) - voce.rimborso + voce.svincolatoPrezzo;
        s.historyLog = s.historyLog.filter(function (v) {
            return !(v.ts === voce.ts && v.playerId === voce.playerId && v.teamId === voce.teamId);
        });

        return { ok: true, stato: sincronizzaRose(s) };
    }

    function applicaBonus(stato, valore) {
        var s = clona(stato);
        if (!s.riparazione) s.riparazione = { bonusApplicato: false, bonusValore: valore, miaSquadraId: null, ruoloCorrente: 'P' };
        if (s.riparazione.bonusApplicato) return { ok: false, errore: 'Il bonus di inizio asta e gia stato applicato.', stato: stato };
        s.teams.forEach(function (t) { t.budget = (t.budget || 0) + valore; });
        s.riparazione.bonusApplicato = true;
        s.riparazione.bonusValore = valore;
        return { ok: true, stato: sincronizzaRose(s) };
    }
```

Aggiungi a `API`:

```js
        sincronizzaRose: sincronizzaRose,
        applicaOperazione: applicaOperazione,
        annullaOperazione: annullaOperazione,
        applicaBonus: applicaBonus,
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `node test-riparazione.js`
Expected: `70 passati, 0 falliti`

- [ ] **Step 5: Verificare anche nel browser**

Apri `test-riparazione.html`.
Expected: tutte le righe verdi, nessuna rossa.

- [ ] **Step 6: Commit**

```bash
git add riparazione-core.js test-riparazione.js
git commit -m "motore riparazione: applica, annulla e bonus di inizio asta"
```

---

### Task 5: Modifiche minime a `index.html`

**Files:**
- Modify: `index.html:910` (funzione `salvaDati`)
- Modify: `index.html:1790` (funzione `annullaAcquisto`)
- Modify: `index.html:196` circa (header, prima del tasto "Griglia Portieri")

**Interfaces:**
- Consumes: niente dal motore.
- Produces: il ramo `riparazione` del nodo Firebase sopravvive ai salvataggi della pagina base; il link alla nuova pagina.

**Perché servono:** `dbRef.set()` sostituisce l'intero nodo e cancellerebbe il ramo `riparazione` al primo salvataggio dalla pagina base. E il cestino della cronologia della pagina base, su una voce di riparazione, toglierebbe il giocatore comprato senza rimettere in rosa quello liberato né correggere il budget: lascerebbe la squadra a 24 giocatori con i crediti sbagliati.

- [ ] **Step 1: Sostituire `set` con `update` in `salvaDati`**

In `index.html`, dentro `salvaDati()`, cambia:

```js
                dbRef.set({
```

in:

```js
                // update() e non set(): set sostituisce l intero nodo e
                // cancellerebbe il ramo "riparazione" scritto da riparazione.html
                dbRef.update({
```

- [ ] **Step 2: Proteggere `annullaAcquisto` dalle voci di riparazione**

In `index.html`, all'inizio di `annullaAcquisto(playerId)`, subito dopo `const player = players.find(...)`, inserisci:

```js
            // Le operazioni di riparazione sono acquisto + svincolo insieme:
            // annullarle da qui lascerebbe la rosa a 24 con i crediti sbagliati.
            const voceRiparazione = historyLog.find(v => v.playerId === playerId && v.tipo === 'riparazione');
            if (voceRiparazione) {
                alert("Questa e un'operazione dell'asta di riparazione (acquisto + svincolo).\n\nAnnullala dalla pagina \"Asta di Riparazione\", altrimenti la rosa resta a 24 giocatori con i crediti sbagliati.");
                return;
            }
```

- [ ] **Step 3: Aggiungere il tasto nell'header**

In `index.html`, nell'header della dashboard, subito prima del commento `<!-- NUOVO TASTO GRIGLIA PORTIERI -->`, inserisci:

```html
                    <!-- COLLEGAMENTO ALL'ASTA DI RIPARAZIONE -->
                    <a href="riparazione.html"
                        class="bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-bold py-2 px-3 rounded-lg transition flex items-center gap-1.5 shadow-2xs"
                        title="Apri la pagina dell'asta di riparazione (acquisto + svincolo, calcolo del massimo puntabile)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                        </svg>
                        <span>Asta di Riparazione</span>
                    </a>
```

- [ ] **Step 4: Verificare che la pagina base non sia rotta**

Apri `index.html` nel browser, riprendi l'asta salvata o entra nel cloud.
Expected: la dashboard si carica, il badge "Cloud Connesso" diventa verde, compare il tasto fucsia "Asta di Riparazione", un acquisto normale si registra e si annulla dalla cronologia come prima.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "index: update al posto di set, protezione annullo riparazione, link alla nuova pagina"
```

---

### Task 6: Scheletro di `riparazione.html` e controllo dei dati

**Files:**
- Create: `riparazione.html`

**Interfaces:**
- Consumes: `RiparazioneCore` (Task 1-4), `FIREBASE_CONFIG` da `config.js`.
- Produces: le variabili globali di pagina `teams`, `players`, `historyLog`, `riparazione`, e le funzioni `caricaStato()`, `salvaStato()`, `statoCorrente()`, `applicaStato(nuovo)`, `renderTutto()`, `controllaDati()`.

- [ ] **Step 1: Creare la pagina con testata, connessione cloud e diagnostica**

Crea `riparazione.html`:

```html
<!DOCTYPE html>
<html lang="it" class="">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Asta di Riparazione - Fantacalcio</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = { darkMode: 'class', theme: { extend: {} } }
    </script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
    <style>
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
    </style>
</head>

<body class="bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans p-2 md:p-4 min-h-screen transition-colors duration-200">
    <div class="max-w-[1600px] mx-auto space-y-4">

        <header class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xs border border-slate-200 dark:border-slate-700 p-3 flex flex-wrap justify-between items-center gap-3">
            <div class="flex items-center gap-3">
                <h1 class="text-lg font-black text-slate-800 dark:text-slate-100">Asta di Riparazione</h1>
                <span id="cloud-status-badge" class="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 px-2.5 py-1 rounded-full text-[11px] font-black flex items-center">
                    <span class="w-2 h-2 rounded-full bg-slate-400 inline-block mr-1.5"></span><span>Cloud in attesa</span>
                </span>
            </div>

            <div class="flex flex-wrap items-center gap-2">
                <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    La mia squadra
                    <select id="select-mia-squadra" onchange="impostaMiaSquadra(this.value)"
                        class="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 dark:text-slate-100 outline-hidden focus:ring-2 focus:ring-indigo-500">
                        <option value="">— scegli —</option>
                    </select>
                </label>

                <button type="button" id="btn-bonus" onclick="applicaBonusIniziale()"
                    class="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition shadow-2xs">
                    +50 crediti a tutti
                </button>

                <button type="button" onclick="toggleDarkMode()"
                    class="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold py-2 px-3 rounded-lg transition">
                    Tema
                </button>

                <a href="index.html"
                    class="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold py-2 px-3 rounded-lg transition">
                    &larr; Asta principale
                </a>
            </div>
        </header>

        <!-- FASE: SI PROCEDE DAI PORTIERI AGLI ATTACCANTI -->
        <div id="barra-fase" class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xs border border-slate-200 dark:border-slate-700 p-2 flex items-center gap-2">
            <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400 px-1">Reparto in asta</span>
            <div id="fase-bottoni" class="flex gap-1.5"></div>
            <span id="diagnostica" class="ml-auto text-[11px] text-slate-500 dark:text-slate-400 font-mono"></span>
        </div>

        <!-- AVVISO DATI MANCANTI O VECCHI -->
        <div id="avviso-dati" class="hidden bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 px-4 py-3 rounded-xl text-sm shadow-2xs"></div>

        <div id="contenuto" class="grid grid-cols-1 lg:grid-cols-12 gap-4"></div>
    </div>

    <script src="config.js"></script>
    <script src="riparazione-core.js"></script>
    <script>
        // --- STATO DI PAGINA ---
        // Stessa forma di index.html, piu il ramo "riparazione".
        var teams = [];
        var players = [];
        var historyLog = [];
        var riparazione = { bonusApplicato: false, bonusValore: 50, miaSquadraId: null, ruoloCorrente: 'P' };

        var giocatoreSelezionato = null;
        var squadraAcquirente = null;
        var svincolatoScelto = null;
        var ricerca = '';

        function statoCorrente() {
            return { teams: teams, players: players, historyLog: historyLog, riparazione: riparazione };
        }

        function applicaStato(nuovo) {
            teams = nuovo.teams || [];
            players = nuovo.players || [];
            historyLog = nuovo.historyLog || [];
            riparazione = nuovo.riparazione || riparazione;
        }

        // --- TEMA NOTTURNO (stessa chiave di index.html) ---
        function initDarkMode() {
            if (localStorage.getItem('fanta_dark_mode') === '1') document.documentElement.classList.add('dark');
        }
        function toggleDarkMode() {
            var isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('fanta_dark_mode', isDark ? '1' : '0');
        }

        // --- CLOUD ---
        var dbRef = null;
        var firebaseConnesso = false;
        var stoRicevendoDalCloud = false;

        function inizializzaCloud() {
            if (typeof FIREBASE_CONFIG === 'undefined') { caricaDaLocale(); return; }
            try {
                firebase.initializeApp(FIREBASE_CONFIG);
                firebase.auth().signInAnonymously().then(function () {
                    dbRef = firebase.database().ref('asta_live_2026');
                    firebaseConnesso = true;
                    var badge = document.getElementById('cloud-status-badge');
                    badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1.5"></span><span>Cloud Connesso</span>';
                    badge.className = 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 px-2.5 py-1 rounded-full text-[11px] font-black flex items-center';

                    dbRef.on('value', function (snapshot) {
                        var data = snapshot.val();
                        if (!data || !data.teams) return;
                        stoRicevendoDalCloud = true;
                        applicaStato({
                            teams: data.teams,
                            players: data.players,
                            historyLog: data.historyLog,
                            riparazione: data.riparazione
                        });
                        teams.forEach(function (t) { if (!t.players) t.players = []; });
                        RiparazioneCore.sincronizzaRose(statoCorrente());
                        renderTutto();
                        stoRicevendoDalCloud = false;
                    });
                }).catch(function (err) {
                    console.error('Errore autenticazione anonima:', err);
                    caricaDaLocale();
                });
            } catch (err) {
                console.error('Errore inizializzazione cloud:', err);
                caricaDaLocale();
            }
        }

        // Fallback locale: stesse chiavi di index.html, cosi la pagina
        // funziona anche senza rete con l ultimo stato salvato.
        function caricaDaLocale() {
            var t = localStorage.getItem('fanta_teams');
            var p = localStorage.getItem('fanta_players');
            if (!t || !p) { renderTutto(); return; }
            applicaStato({
                teams: JSON.parse(t),
                players: JSON.parse(p),
                historyLog: JSON.parse(localStorage.getItem('fanta_history') || '[]'),
                riparazione: JSON.parse(localStorage.getItem('fanta_riparazione') || 'null')
            });
            teams.forEach(function (x) { if (!x.players) x.players = []; });
            RiparazioneCore.sincronizzaRose(statoCorrente());
            renderTutto();
        }

        function salvaStato() {
            localStorage.setItem('fanta_teams', JSON.stringify(teams));
            localStorage.setItem('fanta_players', JSON.stringify(players));
            localStorage.setItem('fanta_history', JSON.stringify(historyLog));
            localStorage.setItem('fanta_riparazione', JSON.stringify(riparazione));
            if (firebaseConnesso && dbRef && !stoRicevendoDalCloud) {
                dbRef.update({
                    teams: teams, players: players, historyLog: historyLog,
                    riparazione: riparazione, timestamp: Date.now()
                }).catch(function (err) { console.error('Errore invio cloud:', err); });
            }
        }

        // --- DIAGNOSTICA DEI DATI ---
        // Un numero alto di "fuori listone" significa quasi sempre che il
        // listone caricato e quello di agosto, non quello a mercato chiuso.
        function controllaDati() {
            var svincolati = players.filter(function (p) { return p.status === 'free'; }).length;
            var inRosa = players.filter(function (p) { return p.status === 'sold'; });
            var fuori = inRosa.filter(function (p) { return p.fuoriListone; }).length;

            document.getElementById('diagnostica').textContent =
                players.length + ' nel listone · ' + svincolati + ' svincolati · ' + fuori + ' fuori listone';

            var avviso = document.getElementById('avviso-dati');
            if (teams.length === 0 || inRosa.length === 0) {
                avviso.innerHTML = '<strong>Mancano i dati delle rose.</strong><br>' +
                    'Torna alla pagina principale e fai i tre passi <em>in quest ordine</em>:<br>' +
                    '1. Importa Excel (.xlsx) — il listone quotazioni <strong>aggiornato a mercato chiuso</strong><br>' +
                    '2. Importa Rose (.xlsx) — il file esportato dalla lega<br>' +
                    '3. Crediti — correggi i residui di ogni squadra<br>' +
                    'L ordine non e invertibile: importare il listone azzera le rose.';
                avviso.classList.remove('hidden');
                return false;
            }
            if (fuori > 15) {
                avviso.innerHTML = '<strong>' + fuori + ' giocatori in rosa non sono nel listone.</strong> ' +
                    'Probabilmente il listone caricato e quello di agosto. Ricaricalo aggiornato dalla pagina principale e subito dopo reimporta le rose.';
                avviso.classList.remove('hidden');
                return true;
            }
            avviso.classList.add('hidden');
            return true;
        }

        // --- FASE (P -> D -> C -> A) ---
        var RUOLI = ['P', 'D', 'C', 'A'];
        var NOMI_RUOLO = { P: 'Portieri', D: 'Difensori', C: 'Centrocampisti', A: 'Attaccanti' };

        function renderBarraFase() {
            var box = document.getElementById('fase-bottoni');
            box.innerHTML = RUOLI.map(function (r) {
                var attivo = riparazione.ruoloCorrente === r;
                var cls = attivo
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                    : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-300';
                return '<button type="button" onclick="impostaFase(\'' + r + '\')" ' +
                    'class="px-3 py-1.5 rounded-lg border text-xs font-bold transition ' + cls + '">' +
                    r + ' · ' + NOMI_RUOLO[r] + '</button>';
            }).join('');
        }

        function impostaFase(ruolo) {
            riparazione.ruoloCorrente = ruolo;
            giocatoreSelezionato = null;
            svincolatoScelto = null;
            salvaStato();
            renderTutto();
        }

        function impostaMiaSquadra(valore) {
            riparazione.miaSquadraId = valore === '' ? null : parseInt(valore, 10);
            salvaStato();
            renderTutto();
        }

        function applicaBonusIniziale() {
            if (!confirm('Aggiungere ' + (riparazione.bonusValore || 50) + ' crediti a tutte le ' + teams.length + ' squadre?\n\nSi puo fare una sola volta.')) return;
            var esito = RiparazioneCore.applicaBonus(statoCorrente(), riparazione.bonusValore || 50);
            if (!esito.ok) { alert(esito.errore); return; }
            applicaStato(esito.stato);
            salvaStato();
            renderTutto();
        }

        function renderTestata() {
            var sel = document.getElementById('select-mia-squadra');
            sel.innerHTML = '<option value="">— scegli —</option>' + teams.map(function (t) {
                return '<option value="' + t.id + '"' + (t.id === riparazione.miaSquadraId ? ' selected' : '') + '>' + t.name + '</option>';
            }).join('');

            var btn = document.getElementById('btn-bonus');
            btn.disabled = !!riparazione.bonusApplicato || teams.length === 0;
            btn.textContent = riparazione.bonusApplicato
                ? '+' + (riparazione.bonusValore || 50) + ' crediti gia assegnati'
                : '+' + (riparazione.bonusValore || 50) + ' crediti a tutti';
        }

        // In questo task il contenitore centrale resta vuoto: lo riempiono
        // i Task 7 e 8. Qui conta che testata, fase e diagnostica funzionino.
        function renderTutto() {
            renderTestata();
            renderBarraFase();
            var datiOk = controllaDati();
            document.getElementById('contenuto').classList.toggle('hidden', !datiOk);
        }

        // --- AVVIO ---
        initDarkMode();
        inizializzaCloud();
    </script>
</body>

</html>
```

- [ ] **Step 2: Verificare la connessione e la diagnostica**

Apri `riparazione.html` nel browser con la pagina base già popolata (listone + rose + crediti).
Expected: badge verde "Cloud Connesso"; nella barra fase compare la riga di diagnostica tipo `497 nel listone · 247 svincolati · 0 fuori listone`; il selettore "La mia squadra" elenca le 10 squadre; nessun avviso ambrato.

- [ ] **Step 3: Verificare il caso senza dati**

Apri `riparazione.html` in una finestra anonima con il cloud vuoto (oppure rinomina temporaneamente `config.js` e svuota `localStorage`).
Expected: compare l'avviso ambrato coi tre passi in ordine.

- [ ] **Step 4: Verificare il bonus**

Premi "+50 crediti a tutti" e conferma.
Expected: il tasto diventa "+50 crediti già assegnati" e resta disabilitato; riaprendo `index.html` i residui di ogni squadra sono aumentati di 50; premendo di nuovo il tasto (dopo un ricaricamento) non succede nulla.

- [ ] **Step 5: Commit**

```bash
git add riparazione.html
git commit -m "riparazione: pagina, connessione cloud, fase per reparto e bonus iniziale"
```

---

### Task 7: Banco d'asta con candidati allo svincolo dinamici

**Files:**
- Modify: `riparazione.html`

**Interfaces:**
- Consumes: `RiparazioneCore.valutaOfferta`, `statoSquadra`, `maxPuntata`; le globali del Task 6.
- Produces: `renderBanco()`, `selezionaGiocatore(id)`, `selezionaSquadra(id)`, `selezionaSvincolato(id)`, `cambiaPrezzo(delta)`, `prezzoCorrente()`, `badgeRuolo(ruolo)`.

- [ ] **Step 1: Inserire il markup della colonna sinistra**

In `riparazione.html`, sostituisci `<div id="contenuto" class="grid grid-cols-1 lg:grid-cols-12 gap-4"></div>` con:

```html
        <div id="contenuto" class="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <section class="lg:col-span-5 space-y-3">
                <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xs border border-slate-200 dark:border-slate-700 p-3 space-y-3">
                    <h2 class="text-sm font-black text-slate-700 dark:text-slate-200">Banco d'asta</h2>

                    <input type="text" id="input-ricerca" oninput="aggiornaRicerca(this.value)" placeholder="Cerca uno svincolato..."
                        class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 dark:text-slate-100 outline-hidden focus:ring-2 focus:ring-indigo-500">
                    <div id="lista-svincolati" class="max-h-64 overflow-y-auto space-y-1 pr-1"></div>

                    <div id="box-selezione" class="space-y-2"></div>
                </div>

                <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xs border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                    <h2 class="text-sm font-black text-slate-700 dark:text-slate-200">Chi svincolare</h2>
                    <div id="lista-candidati" class="space-y-1"></div>
                    <button type="button" id="btn-conferma" onclick="confermaOperazione()"
                        class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-black py-2.5 rounded-lg transition shadow-2xs">
                        Conferma operazione
                    </button>
                </div>
            </section>

            <section id="colonna-destra" class="lg:col-span-7 space-y-3"></section>
        </div>
```

- [ ] **Step 2: Aggiungere le funzioni del banco**

In `riparazione.html`, dentro il blocco `<script>`, subito prima di `function renderTutto()`:

```js
        var COLORI_RUOLO = {
            P: 'bg-yellow-100 dark:bg-yellow-900/60 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700',
            D: 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700',
            C: 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-700',
            A: 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700'
        };

        function badgeRuolo(ruolo) {
            return '<span class="font-bold px-1 py-0.5 rounded border text-[9px] ' + COLORI_RUOLO[ruolo] + '">' + ruolo + '</span>';
        }

        function prezzoCorrente() {
            var campo = document.getElementById('input-prezzo');
            if (!campo) return 1;
            var v = parseInt(campo.value, 10);
            return isNaN(v) || v < 1 ? 1 : v;
        }

        function aggiornaRicerca(valore) {
            ricerca = (valore || '').toLowerCase();
            renderListaSvincolati();
        }

        function selezionaGiocatore(id) {
            giocatoreSelezionato = id;
            svincolatoScelto = null;
            renderBanco();
        }

        function selezionaSquadra(id) {
            squadraAcquirente = id;
            svincolatoScelto = null;
            renderBanco();
        }

        function selezionaSvincolato(id) {
            svincolatoScelto = id;
            renderCandidati();
        }

        function cambiaPrezzo(delta) {
            var campo = document.getElementById('input-prezzo');
            var v = prezzoCorrente() + delta;
            campo.value = v < 1 ? 1 : v;
            // Il prezzo cambia chi puo permetterselo: si ricalcola tutto.
            svincolatoScelto = null;
            renderCandidati();
            renderColonnaDestra();
        }

        function renderListaSvincolati() {
            var box = document.getElementById('lista-svincolati');
            if (!box) return;
            var ruolo = riparazione.ruoloCorrente;
            var lista = players.filter(function (p) {
                if (p.status !== 'free' || p.role !== ruolo) return false;
                if (!ricerca) return true;
                return p.name.toLowerCase().indexOf(ricerca) !== -1 || String(p.team).toLowerCase().indexOf(ricerca) !== -1;
            }).sort(function (a, b) { return (b.fvm || 0) - (a.fvm || 0); }).slice(0, 60);

            if (lista.length === 0) {
                box.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Nessuno svincolato di ruolo ' + ruolo + '</p>';
                return;
            }
            box.innerHTML = lista.map(function (p) {
                var scelto = giocatoreSelezionato === p.id;
                var riga = scelto
                    ? 'bg-indigo-100/90 dark:bg-indigo-950/80 border-indigo-400 dark:border-indigo-600 font-bold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border-transparent hover:border-slate-200 dark:hover:border-slate-600';
                return '<div class="flex justify-between items-center p-1.5 rounded border cursor-pointer text-[11px] transition ' + riga + '" onclick="selezionaGiocatore(' + p.id + ')">' +
                    '<div class="flex items-center gap-1.5 truncate pr-1">' + badgeRuolo(p.role) +
                    '<span class="font-bold text-slate-800 dark:text-slate-100">' + p.name + '</span>' +
                    '<span class="text-slate-400 text-[10px]">(' + p.team + ')</span></div>' +
                    '<span class="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold px-1.5 rounded text-[10px] shrink-0">FVM ' + (p.fvm || '-') + '</span>' +
                    '</div>';
            }).join('');
        }

        function renderBoxSelezione() {
            var box = document.getElementById('box-selezione');
            if (!box) return;
            var g = players.find(function (p) { return p.id === giocatoreSelezionato; });
            if (!g) {
                box.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-3 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg">Seleziona un giocatore dalla lista</p>';
                return;
            }
            var prezzo = document.getElementById('input-prezzo') ? prezzoCorrente() : 1;
            box.innerHTML =
                '<div class="p-2 bg-indigo-50/80 dark:bg-indigo-950/60 border-2 border-indigo-400 dark:border-indigo-600 rounded-lg flex justify-between items-center text-xs">' +
                '<span class="font-black text-slate-800 dark:text-slate-100">' + badgeRuolo(g.role) + ' ' + g.name + ' <span class="text-slate-400 font-normal">(' + g.team + ')</span></span>' +
                '<button type="button" onclick="selezionaGiocatore(null)" class="text-rose-600 dark:text-rose-400 font-bold">&times;</button>' +
                '</div>' +
                '<div class="flex items-center gap-1.5">' +
                '<button type="button" onclick="cambiaPrezzo(-5)" class="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-black">-5</button>' +
                '<button type="button" onclick="cambiaPrezzo(-1)" class="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-black">-1</button>' +
                '<input type="number" id="input-prezzo" value="' + prezzo + '" min="1" oninput="cambiaPrezzo(0)" ' +
                'class="grow text-center px-2 py-1.5 border-2 border-indigo-300 dark:border-indigo-700 rounded-lg text-lg font-black bg-white dark:bg-slate-900 dark:text-slate-100 outline-hidden focus:ring-2 focus:ring-indigo-500">' +
                '<button type="button" onclick="cambiaPrezzo(1)" class="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-black">+1</button>' +
                '<button type="button" onclick="cambiaPrezzo(5)" class="px-2 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-black">+5</button>' +
                '</div>' +
                '<div id="griglia-squadre" class="grid grid-cols-2 gap-1.5"></div>';
            renderGrigliaSquadre();
        }

        function renderGrigliaSquadre() {
            var box = document.getElementById('griglia-squadre');
            if (!box) return;
            var ruolo = riparazione.ruoloCorrente;
            var prezzo = prezzoCorrente();
            box.innerHTML = teams.map(function (t) {
                var v = RiparazioneCore.valutaOfferta(t, ruolo, prezzo);
                var attiva = squadraAcquirente === t.id;
                var cls = attiva
                    ? 'bg-indigo-600 text-white border-indigo-700 font-extrabold'
                    : v.ammessa
                        ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:border-indigo-300 font-semibold'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-dashed border-slate-300 dark:border-slate-600 opacity-60';
                return '<button type="button" onclick="selezionaSquadra(' + t.id + ')" title="Max ' + v.maxPuntata + ' su un ' + ruolo + '" ' +
                    'class="p-1.5 rounded-lg border text-[11px] transition flex justify-between items-center gap-1 truncate ' + cls + '">' +
                    '<span class="truncate">' + t.name + '</span>' +
                    '<span class="font-mono font-bold shrink-0">' + v.maxPuntata + '</span></button>';
            }).join('');
        }

        function renderCandidati() {
            var box = document.getElementById('lista-candidati');
            var btn = document.getElementById('btn-conferma');
            if (!box) return;

            var g = players.find(function (p) { return p.id === giocatoreSelezionato; });
            var t = teams.find(function (x) { return x.id === squadraAcquirente; });
            if (!g || !t) {
                box.innerHTML = '<p class="text-xs text-slate-400 italic text-center py-3">Scegli un giocatore e la squadra acquirente</p>';
                btn.disabled = true;
                return;
            }

            var prezzo = prezzoCorrente();
            var v = RiparazioneCore.valutaOfferta(t, g.role, prezzo);

            if (!v.serveSvincolo) {
                var libero = v.ammessa;
                box.innerHTML = '<div class="p-2 rounded-lg border text-xs ' +
                    (libero ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                            : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300') + '">' +
                    '<strong>' + t.name + '</strong> ha uno slot ' + g.role + ' libero: nessuno svincolo necessario. ' +
                    'Residui dopo l acquisto: <strong>' + v.residuiSenzaSvincolo + '</strong>.' +
                    (libero ? '' : ' Crediti insufficienti, massimo ' + v.maxPuntata + '.') + '</div>';
                svincolatoScelto = null;
                btn.disabled = !libero;
                return;
            }

            if (v.candidati.length === 0) {
                box.innerHTML = '<p class="text-xs text-rose-600 dark:text-rose-400 py-3">' + t.name + ' non ha giocatori di ruolo ' + g.role + ' da svincolare.</p>';
                btn.disabled = true;
                return;
            }

            // Al primo render proponiamo il suggerito, ma resta modificabile.
            if (svincolatoScelto === null && v.suggerito) svincolatoScelto = v.suggerito.player.id;
            if (svincolatoScelto !== null && !v.candidatiValidi.some(function (c) { return c.player.id === svincolatoScelto; })) {
                svincolatoScelto = v.suggerito ? v.suggerito.player.id : null;
            }

            box.innerHTML =
                '<div class="text-[11px] font-bold px-1 pb-1 ' + (v.ammessa ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400') + '">' +
                (v.ammessa ? 'A ' + prezzo + ' crediti ' + t.name + ' ce la fa' : 'A ' + prezzo + ' crediti ' + t.name + ' non ce la fa: massimo ' + v.maxPuntata) +
                '</div>' +
                v.candidati.map(function (c) {
                    var scelto = svincolatoScelto === c.player.id;
                    var cls = !c.copre
                        ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 opacity-70'
                        : scelto
                            ? 'bg-emerald-100 dark:bg-emerald-950/70 border-emerald-500 dark:border-emerald-600 text-emerald-900 dark:text-emerald-200 ring-1 ring-emerald-400'
                            : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-emerald-400 text-slate-700 dark:text-slate-200';
                    var badgeMorto = c.fuoriListone
                        ? '<span class="bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 px-1 rounded text-[9px] font-bold" title="Non presente nel listone: probabilmente ha lasciato la Serie A. Verifica che non sia un errore di corrispondenza dei nomi.">fuori listone</span>'
                        : '';
                    return '<div class="flex justify-between items-center p-1.5 rounded-lg border text-[11px] transition ' +
                        (c.copre ? 'cursor-pointer ' : '') + cls + '"' +
                        (c.copre ? ' onclick="selezionaSvincolato(' + c.player.id + ')"' : '') + '>' +
                        '<div class="flex items-center gap-1.5 truncate pr-1"><span class="font-bold">' + c.player.name + '</span>' + badgeMorto + '</div>' +
                        '<div class="flex items-center gap-2 shrink-0 font-mono">' +
                        '<span title="Prezzo pagato">pagato ' + (c.player.price || 0) + '</span>' +
                        '<span class="font-black text-emerald-600 dark:text-emerald-400" title="Crediti restituiti">+' + c.rimborso + '</span>' +
                        '<span title="Residui dopo l operazione">&rarr; ' + c.residuiDopo + '</span>' +
                        '</div></div>';
                }).join('');

            btn.disabled = !v.ammessa || svincolatoScelto === null;
        }

        function renderBanco() {
            renderListaSvincolati();
            renderBoxSelezione();
            renderCandidati();
            renderColonnaDestra();
        }
```

- [ ] **Step 3: Collegare il banco al render generale**

Sostituisci il corpo di `renderTutto()` con:

```js
        function renderTutto() {
            renderTestata();
            renderBarraFase();
            var datiOk = controllaDati();
            document.getElementById('contenuto').classList.toggle('hidden', !datiOk);
            if (!datiOk) return;
            renderBanco();
        }
```

Aggiungi uno stub temporaneo, che il Task 8 sostituisce:

```js
        function renderColonnaDestra() { }
```

- [ ] **Step 4: Verificare il comportamento dinamico**

Apri `riparazione.html` con i dati caricati. Seleziona un difensore svincolato, scegli una squadra e alza il prezzo con `+1` e `+5`.
Expected: la lista "Chi svincolare" si ricolora a ogni variazione; i candidati che non coprono il prezzo diventano grigi e non cliccabili; l'intestazione passa da verde a rossa quando il prezzo supera il massimo; il numero accanto a ogni squadra nella griglia è il suo massimo puntabile per quel ruolo; il tasto "Conferma operazione" si disabilita quando l'offerta non è sostenibile.

- [ ] **Step 5: Commit**

```bash
git add riparazione.html
git commit -m "riparazione: banco d asta e candidati allo svincolo dinamici"
```

---

### Task 8: Pannello personale e tabellone avversari

**Files:**
- Modify: `riparazione.html`

**Interfaces:**
- Consumes: `RiparazioneCore.valutaOfferta`, `statoSquadra`, `MAX_SLOTS`.
- Produces: `renderColonnaDestra()` completa (sostituisce lo stub del Task 7), `renderMioPannello()`, `renderTabellone()`.

- [ ] **Step 1: Sostituire lo stub con l'implementazione**

In `riparazione.html`, rimpiazza `function renderColonnaDestra() { }` con:

```js
        function renderColonnaDestra() {
            var box = document.getElementById('colonna-destra');
            if (!box) return;
            box.innerHTML =
                '<div id="mio-pannello" class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xs border border-slate-200 dark:border-slate-700 p-3"></div>' +
                '<div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xs border border-slate-200 dark:border-slate-700 p-3">' +
                '<h2 class="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">Avversari</h2>' +
                '<div class="overflow-x-auto"><table class="w-full text-[11px]"><thead>' +
                '<tr class="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">' +
                '<th class="py-1 px-2">Squadra</th><th class="py-1 px-2">Residui</th><th class="py-1 px-2">Max ' + riparazione.ruoloCorrente + '</th>' +
                '<th class="py-1 px-2">Al prezzo</th><th class="py-1 px-2">Svincolerebbe</th>' +
                '<th class="py-1 px-1 text-center">P</th><th class="py-1 px-1 text-center">D</th><th class="py-1 px-1 text-center">C</th><th class="py-1 px-1 text-center">A</th>' +
                '</tr></thead><tbody id="corpo-tabellone"></tbody></table></div></div>' +
                '<div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xs border border-slate-200 dark:border-slate-700 p-3">' +
                '<h2 class="text-sm font-black text-slate-700 dark:text-slate-200 mb-2">Operazioni</h2>' +
                '<div id="lista-operazioni" class="space-y-1 max-h-64 overflow-y-auto pr-1"></div></div>';
            renderMioPannello();
            renderTabellone();
            renderOperazioni();
        }

        function renderMioPannello() {
            var box = document.getElementById('mio-pannello');
            if (!box) return;
            var mia = teams.find(function (t) { return t.id === riparazione.miaSquadraId; });
            if (!mia) {
                box.innerHTML = '<p class="text-xs text-slate-400 italic">Scegli "La mia squadra" in alto per vedere qui i tuoi crediti e i tuoi candidati allo svincolo.</p>';
                return;
            }
            var ruolo = riparazione.ruoloCorrente;
            var prezzo = giocatoreSelezionato !== null ? prezzoCorrente() : 0;
            var s = RiparazioneCore.statoSquadra(mia);
            var v = RiparazioneCore.valutaOfferta(mia, ruolo, prezzo || 1);

            box.innerHTML =
                '<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">' +
                '<h2 class="text-sm font-black text-slate-700 dark:text-slate-200">' + mia.name + '</h2>' +
                '<span class="text-xs text-slate-500 dark:text-slate-400">Residui <strong class="font-mono text-emerald-600 dark:text-emerald-400 text-sm">' + s.residui + '</strong></span>' +
                '<span class="text-xs text-slate-500 dark:text-slate-400">Massimo su un ' + ruolo + ' <strong class="font-mono text-indigo-600 dark:text-indigo-400 text-sm">' + v.maxPuntata + '</strong></span>' +
                '</div>' +
                '<div class="grid grid-cols-2 md:grid-cols-3 gap-1">' +
                RiparazioneCore.ordinaCandidati(RiparazioneCore.candidatiSvincolo(mia, ruolo)).map(function (c) {
                    var badge = c.fuoriListone ? ' <span class="text-amber-600 dark:text-amber-400 font-bold">!</span>' : '';
                    return '<div class="flex justify-between items-center px-1.5 py-1 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 text-[10px]">' +
                        '<span class="truncate pr-1 font-bold text-slate-700 dark:text-slate-200">' + c.player.name + badge + '</span>' +
                        '<span class="font-mono shrink-0 text-emerald-600 dark:text-emerald-400 font-bold">+' + c.rimborso + '</span></div>';
                }).join('') +
                '</div>';
        }

        function renderTabellone() {
            var corpo = document.getElementById('corpo-tabellone');
            if (!corpo) return;
            var ruolo = riparazione.ruoloCorrente;
            var inAsta = giocatoreSelezionato !== null;
            var prezzo = inAsta ? prezzoCorrente() : 0;

            corpo.innerHTML = teams.map(function (t) {
                var s = RiparazioneCore.statoSquadra(t);
                var v = RiparazioneCore.valutaOfferta(t, ruolo, prezzo || 1);
                var mia = t.id === riparazione.miaSquadraId;

                var semaforo = !inAsta
                    ? '<span class="text-slate-400">—</span>'
                    : v.ammessa
                        ? '<span class="bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded">può a ' + prezzo + '</span>'
                        : '<span class="bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-bold px-1.5 py-0.5 rounded">fuori</span>';

                var costretta = (inAsta && v.ammessa && v.suggerito)
                    ? v.suggerito.player.name + ' <span class="text-emerald-600 dark:text-emerald-400 font-mono">+' + v.suggerito.rimborso + '</span>'
                    : '<span class="text-slate-400">—</span>';

                var slot = ['P', 'D', 'C', 'A'].map(function (r) {
                    var pieno = s.slotOccupati[r] >= RiparazioneCore.MAX_SLOTS[r];
                    return '<td class="py-1 px-1 text-center ' + (pieno ? 'text-slate-400' : 'text-amber-600 dark:text-amber-400 font-bold') + '">' +
                        s.slotOccupati[r] + '/' + RiparazioneCore.MAX_SLOTS[r] + '</td>';
                }).join('');

                return '<tr class="border-b border-slate-100 dark:border-slate-700/60 ' + (mia ? 'bg-indigo-50/70 dark:bg-indigo-950/40 font-bold' : '') + '">' +
                    '<td class="py-1 px-2 truncate max-w-[150px]">' + t.name + '</td>' +
                    '<td class="py-1 px-2 font-mono text-emerald-600 dark:text-emerald-400">' + s.residui + '</td>' +
                    '<td class="py-1 px-2 font-mono text-indigo-600 dark:text-indigo-400">' + v.maxPuntata + '</td>' +
                    '<td class="py-1 px-2">' + semaforo + '</td>' +
                    '<td class="py-1 px-2 truncate max-w-[160px]">' + costretta + '</td>' + slot + '</tr>';
            }).join('');
        }
```

Aggiungi anche uno stub temporaneo, che il Task 9 sostituisce:

```js
        function renderOperazioni() { }
```

- [ ] **Step 2: Verificare il tabellone dal vivo**

Con un giocatore selezionato, alza il prezzo di 5 in 5.
Expected: la colonna "Al prezzo" passa progressivamente da verde a "fuori" per una squadra dopo l'altra man mano che il prezzo sale; la colonna "Svincolerebbe" mostra il giocatore proposto e il rimborso; la riga della propria squadra è evidenziata; la colonna "Max" non cambia col prezzo (dipende solo dalla rosa).

- [ ] **Step 3: Commit**

```bash
git add riparazione.html
git commit -m "riparazione: pannello personale e tabellone avversari"
```

---

### Task 9: Conferma, cronologia e annullo

**Files:**
- Modify: `riparazione.html`

**Interfaces:**
- Consumes: `RiparazioneCore.applicaOperazione`, `RiparazioneCore.annullaOperazione`.
- Produces: `confermaOperazione()`, `renderOperazioni()` completa, `annullaOperazioneRiparazione(ts, playerId)`.

- [ ] **Step 1: Implementare la conferma**

In `riparazione.html`, aggiungi prima di `function renderTutto()`:

```js
        function confermaOperazione() {
            var g = players.find(function (p) { return p.id === giocatoreSelezionato; });
            var t = teams.find(function (x) { return x.id === squadraAcquirente; });
            if (!g || !t) { alert('Scegli il giocatore e la squadra acquirente.'); return; }

            var esito = RiparazioneCore.applicaOperazione(statoCorrente(), {
                playerId: g.id,
                teamId: t.id,
                price: prezzoCorrente(),
                svincolatoId: svincolatoScelto,
                ts: Date.now()
            });
            if (!esito.ok) { alert(esito.errore); return; }

            applicaStato(esito.stato);
            giocatoreSelezionato = null;
            squadraAcquirente = null;
            svincolatoScelto = null;
            ricerca = '';
            salvaStato();
            renderTutto();
        }
```

- [ ] **Step 2: Sostituire lo stub della cronologia**

Rimpiazza `function renderOperazioni() { }` con:

```js
        function renderOperazioni() {
            var box = document.getElementById('lista-operazioni');
            if (!box) return;
            var voci = historyLog.filter(function (v) { return v.tipo === 'riparazione'; });
            if (voci.length === 0) {
                box.innerHTML = '<p class="text-[11px] text-slate-400 italic text-center py-3">Nessuna operazione registrata</p>';
                return;
            }
            box.innerHTML = voci.slice().reverse().map(function (v) {
                var t = teams.find(function (x) { return x.id === v.teamId; });
                var comprato = players.find(function (p) { return p.id === v.playerId; });
                var liberato = v.svincolatoId === null || v.svincolatoId === undefined
                    ? null
                    : players.find(function (p) { return p.id === v.svincolatoId; });
                if (!t || !comprato) return '';
                return '<div class="flex justify-between items-center bg-white dark:bg-slate-700 p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-[11px]">' +
                    '<div class="truncate pr-2">' +
                    '<span class="font-extrabold text-indigo-700 dark:text-indigo-300">' + t.name + '</span> ' +
                    badgeRuolo(comprato.role) + ' <span class="font-bold">' + comprato.name + '</span> ' +
                    '<span class="font-black text-rose-600 dark:text-rose-400">-' + v.price + '</span>' +
                    (liberato ? ' &nbsp;&rarr;&nbsp; svincola <span class="font-bold">' + liberato.name + '</span> <span class="font-black text-emerald-600 dark:text-emerald-400">+' + v.rimborso + '</span>' : ' <span class="text-slate-400">(nessuno svincolo)</span>') +
                    '</div>' +
                    '<button type="button" onclick="annullaOperazioneRiparazione(' + v.ts + ',' + v.playerId + ')" ' +
                    'class="bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-400 px-2 py-1 rounded border border-rose-200 dark:border-rose-800 font-bold shrink-0">Annulla</button>' +
                    '</div>';
            }).join('');
        }

        function annullaOperazioneRiparazione(ts, playerId) {
            var voce = historyLog.find(function (v) { return v.ts === ts && v.playerId === playerId; });
            if (!voce) { alert('Operazione non trovata.'); return; }
            if (!confirm('Annullare questa operazione? Il giocatore comprato torna svincolato e quello liberato rientra in rosa con il suo prezzo.')) return;

            var esito = RiparazioneCore.annullaOperazione(statoCorrente(), voce);
            if (!esito.ok) { alert(esito.errore); return; }
            applicaStato(esito.stato);
            salvaStato();
            renderTutto();
        }
```

- [ ] **Step 3: Verificare il ciclo completo**

Con i dati caricati: seleziona uno svincolato, una squadra, un prezzo sopra i residui, scegli il candidato allo svincolo e conferma.
Expected: il giocatore comprato compare nella rosa della squadra su `index.html`; il liberato torna nella lista svincolati di entrambe le pagine; i residui della squadra sono `residui - prezzo + rimborso`; la rosa resta di 25 giocatori; la riga compare in "Operazioni".

Premi "Annulla" su quella riga.
Expected: tutto torna esattamente come prima, compreso il prezzo del giocatore rientrato in rosa.

- [ ] **Step 4: Verificare l'annullo bloccato**

Fai un'operazione, poi ricompra il giocatore appena liberato con una seconda operazione. Prova ad annullare la prima.
Expected: messaggio "… è stato ricomprato nel frattempo: annullo impossibile." e nessuna modifica allo stato.

- [ ] **Step 5: Verificare la protezione lato pagina base**

Su `index.html`, nella cronologia, premi il cestino sulla voce di riparazione.
Expected: l'avviso che rimanda alla pagina di riparazione, e nessuna modifica.

- [ ] **Step 6: Commit**

```bash
git add riparazione.html
git commit -m "riparazione: conferma operazione, cronologia e annullo"
```

---

### Task 10: Verifica end-to-end e sincronizzazione fra dispositivi

**Files:**
- Nessuna modifica prevista. Se emergono difetti, correggerli e aggiungere il test corrispondente in `test-riparazione.js`.

**Interfaces:**
- Consumes: tutto.
- Produces: la conferma che il flusso regge dal vivo su due dispositivi.

- [ ] **Step 1: Eseguire tutti i test automatici**

Run: `node test-riparazione.js`
Expected: `70 passati, 0 falliti`, exit code 0

- [ ] **Step 2: Preparare i dati veri**

Su `index.html`: importa il listone quotazioni aggiornato, poi il file rose della lega, poi correggi i crediti residui di tutte le squadre.
Expected: 10 squadre da 25 giocatori; la diagnostica su `riparazione.html` mostra un numero di "fuori listone" basso.

- [ ] **Step 3: Applicare il bonus e verificare la propagazione**

Su `riparazione.html` premi "+50 crediti a tutti".
Expected: su `index.html`, aperto in un'altra scheda, i residui di ogni squadra salgono di 50 **senza ricaricare la pagina**.

- [ ] **Step 4: Verificare la sincronizzazione a due**

Apri `riparazione.html` su due dispositivi diversi. Registra un'operazione dal primo.
Expected: entro un paio di secondi il secondo mostra la stessa operazione in cronologia, gli stessi residui e la stessa lista svincolati, senza ricaricare.

- [ ] **Step 5: Verificare il caso di riferimento del regolamento**

Porta una squadra a 50 crediti residui con un difensore pagato 20 in rosa. Seleziona un difensore svincolato e porta il prezzo a 60, poi a 61.
Expected: a 60 la squadra risulta "può a 60" e il difensore da 20 è il candidato valido, con residui dopo pari a 0; a 61 la squadra risulta "fuori" e il tasto di conferma si disabilita.

- [ ] **Step 6: Verificare la fase per reparto**

Passa da P a D a C a A con i tasti della barra fase.
Expected: la lista svincolati mostra solo il ruolo scelto; la colonna "Max" del tabellone si ricalcola sul nuovo ruolo; il cambio di fase si propaga all'altro dispositivo.

- [ ] **Step 7: Commit finale**

```bash
git add -A
git commit -m "riparazione: verifica end-to-end del flusso completo"
```

---

## Note per chi esegue

- **Non toccare la logica dell'asta estiva** in `index.html` oltre alle tre modifiche del Task 5. Quel tool funziona ed è stato usato per l'asta vera.
- **`node test-riparazione.js` deve passare prima di ogni commit** dei Task 1-4.
- I file `.xlsx` e `.csv` nella cartella sono dati reali della lega: non vanno modificati né committati.
- Se un test dei Task 1-4 fallisce dopo una modifica all'interfaccia, il difetto è quasi sempre nel motore: correggilo lì, non nella pagina.
