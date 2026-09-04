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

    var API = {
        MAX_SLOTS: MAX_SLOTS,
        ROSA_PIENA: ROSA_PIENA,
        rimborso: rimborso,
        statoSquadra: statoSquadra,
        serveSvincolo: serveSvincolo,
        candidatiSvincolo: candidatiSvincolo,
        ordinaCandidati: ordinaCandidati,
        maxPuntata: maxPuntata,
        valutaOfferta: valutaOfferta,
        sincronizzaRose: sincronizzaRose,
        applicaOperazione: applicaOperazione,
        annullaOperazione: annullaOperazione,
        applicaBonus: applicaBonus
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    else global.RiparazioneCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
