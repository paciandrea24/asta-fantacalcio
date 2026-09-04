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

    var API = {
        MAX_SLOTS: MAX_SLOTS,
        ROSA_PIENA: ROSA_PIENA,
        rimborso: rimborso,
        statoSquadra: statoSquadra,
        serveSvincolo: serveSvincolo,
        candidatiSvincolo: candidatiSvincolo,
        ordinaCandidati: ordinaCandidati,
        maxPuntata: maxPuntata,
        valutaOfferta: valutaOfferta
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    else global.RiparazioneCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
