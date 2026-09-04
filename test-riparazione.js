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
    budget: 200,
    players: rosaPiena.slice(0, 23).concat([giocatore(998, 'A', 4), giocatore(997, 'A', 30, { fuoriListone: true })])
});
var vMorto = CORE.valutaOfferta(conMorto, 'A', 20);
eq('il fuori listone e il suggerito', vMorto.suggerito.player.id, 997);
eq('il fuori listone e marcato', vMorto.suggerito.fuoriListone, true);

// --- stato di prova completo ---
function statoDiProva() {
    var elenco = [
        giocatore(1, 'D', 20),            // in rosa alla squadra 0
        giocatore(2, 'D', 4),             // in rosa alla squadra 0
        { id: 3, name: 'LIBERO', role: 'D', team: 'Milan', status: 'free', fvm: 40, qta: 12 },
        { id: 4, name: 'LIBERO2', role: 'D', team: 'Roma', status: 'free', fvm: 20, qta: 8 }
    ];
    var stato = {
        teams: [{ id: 0, name: 'Mia', budget: 74, players: [] }],
        players: elenco,
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
// Dopo la prima operazione i residui sono 0: il riacquisto sta in piedi solo
// a 1 credito, coperto dai 2 che rende lo svincolo del giocatore 2 (pagato 4).
var dopoRiacquisto = CORE.applicaOperazione(r1.stato, { playerId: 1, teamId: 0, price: 1, svincolatoId: 2, ts: 114 });
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
