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
// Rosa regolare da 25 (3P 8D 8C 6A) in cui un difensore e costato 20 invece di 5.
// spesi = 24*5 + 20 = 140, budget 190 -> residui 50.
var rosaRiferimento = rosaPiena.slice();
rosaRiferimento[3] = giocatore(999, 'D', 20);
var riferimento = squadra({ budget: 190, players: rosaRiferimento });
eq('residui del caso di riferimento', CORE.statoSquadra(riferimento).residui, 50);
eq('max puntata sui D: 50 residui + 10 di rimborso', CORE.maxPuntata(riferimento, 'D'), 60);

eq('max puntata senza svincolo necessario', CORE.maxPuntata(mezza, 'D'), 76);
eq('max puntata a 0 se il reparto e pieno e non ci sono candidati', CORE.maxPuntata(squadra({ budget: 10, players: [] }), 'D'), 10);

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
