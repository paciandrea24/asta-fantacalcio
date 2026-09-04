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
