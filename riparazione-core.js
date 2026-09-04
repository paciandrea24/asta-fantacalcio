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
