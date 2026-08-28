/* Soundcape – Klangmaschine
 *
 * Grundgedanke: kein einziges Tonsample. Jede Kulisse ist ein kleines Netz aus
 * Rauschquellen, Filtern und sehr langsamen Steuerkurven. Die Steuerkurven sind
 * Summen von Sinuskurven mit absichtlich "unrunden" Frequenzen – ihre Perioden
 * passen nicht zueinander, also wiederholt sich das Gesamtbild praktisch nie.
 *
 * Zweiter Grund für diese Bauart: der Klang entsteht komplett im Audio-Thread.
 * JS-Zeitgeber werden gedrosselt, sobald das Handy schläft – dieser Graph nicht.
 * Deshalb steht hier bewusst kein einziges setTimeout/setInterval.
 *
 * Dritter Grundsatz: **Kulissen sind isoliert.** Hinter den Grillen liegt kein
 * Rauschteppich, hinter dem Donner kein Regen. Wer beides will, mischt es im Pult.
 * Nur dort, wo das Rauschen selbst die Quelle ist (Regen, Brandung, Wind), gehört
 * es dazu.
 */
const Klang = (function () {
  'use strict';

  var PUFFER_S = 20;   // Länge der Rauschpuffer in Sekunden
  var puffer = [];     // je Kontext ein Eintrag; die Puffer entstehen bei Bedarf

  function eintragFuer(ctx) {
    for (var i = 0; i < puffer.length; i++) if (puffer[i].ctx === ctx) return puffer[i];
    var e = { ctx: ctx, weiss: null, braun: null, rosa: null };
    puffer.push(e);
    return e;
  }

  function nahtGlaetten(d, sr) {
    // Anfang in das Ende überblenden, damit die Schleife nicht knackt
    var blend = Math.floor(sr * 0.05), len = d.length;
    for (var i = 0; i < blend; i++) {
      var f = i / blend;
      d[i] = d[i] * f + d[len - blend + i] * (1 - f);
    }
  }

  function pufferFuer(ctx, art) {
    var e = eintragFuer(ctx);
    art = art || 'weiss';
    if (e[art]) return e[art];

    var len = Math.floor(ctx.sampleRate * PUFFER_S);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0), i;

    if (art === 'weiss') {
      for (i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (art === 'braun') {
      // integriertes weißes Rauschen: −6 dB je Oktave, sehr tieflastig
      var letzt = 0;
      for (i = 0; i < len; i++) {
        letzt = (letzt + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = Math.max(-1, Math.min(1, letzt * 3.4));
      }
      nahtGlaetten(d, ctx.sampleRate);
    } else {
      // rosa Rauschen: −3 dB je Oktave (Filterreihe nach Paul Kellet)
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (i = 0; i < len; i++) {
        var w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.4));
        b6 = w * 0.115926;
      }
      nahtGlaetten(d, ctx.sampleRate);
    }

    e[art] = buf;
    return buf;
  }

  /* ==================================================================
   * Aufnahmen
   *
   * Tierstimmen lassen sich nicht überzeugend synthetisieren: sie sind keine
   * Rauschprozesse, sondern hochstrukturierte Signale. Für sie liegen deshalb
   * **gemeinfreie Aufnahmen** bei (Wikimedia Commons, Public Domain / CC0 –
   * Nachweise in audio/QUELLEN.md).
   *
   * Damit trotzdem keine Schleife hörbar wird, liegen die Dateien nicht als
   * fertige Loops vor: Aus jeder Aufnahme sind die brauchbaren Rufe als
   * Zeitmarken vermessen (Start, Dauer). Abgespielt werden immer nur einzelne
   * Rufe, in zufälliger Reihenfolge, mit zufälliger Pause, Lautstärke,
   * Stereoposition und leicht zufälliger Tonhöhe. Die Aufnahme selbst wird
   * dabei nicht verändert – gespielt wird über start(zeit, offset, dauer).
   * ================================================================== */
  var PROBEN = {
    amsel: { datei: 'audio/amsel.mp3', segmente: [
      [1.27, 0.71], [1.87, 0.51], [2.42, 0.36], [2.77, 0.56], [6.67, 1.31],
      [7.92, 0.61], [8.57, 0.66], [13.67, 2.36], [21.57, 1.91]] },
    gartenvoegel: { datei: 'audio/gartenvoegel.mp3', segmente: [
      [2.85, 1.65], [4.85, 1.40], [18.80, 1.15], [20.00, 0.95], [21.70, 1.30],
      [30.10, 0.40], [31.55, 1.05], [33.00, 1.25], [43.40, 0.75], [45.00, 1.40]] },
    tukane: { datei: 'audio/tukane.mp3', segmente: [
      [0.67, 0.31], [0.97, 0.61], [1.72, 0.31], [2.17, 0.36], [2.62, 0.46],
      [3.22, 0.31], [4.22, 0.36], [4.52, 0.56], [5.27, 0.31], [5.82, 0.31],
      [6.27, 0.56], [6.82, 0.36], [8.97, 0.46], [9.77, 0.31], [10.57, 0.41],
      [12.47, 0.46], [12.97, 0.31], [14.07, 0.36], [14.57, 0.36], [14.82, 0.56],
      [16.77, 0.31], [16.97, 0.66], [17.77, 0.36], [18.27, 0.36], [18.77, 0.36],
      [19.02, 0.61], [20.32, 0.36], [20.77, 0.36], [21.12, 0.56], [22.37, 0.31],
      [22.62, 0.56], [23.67, 0.36], [24.17, 1.06], [25.12, 0.31], [25.62, 0.31],
      [26.12, 0.51], [26.62, 0.31], [27.12, 0.31], [28.07, 0.31], [28.57, 0.31]] },
    /* --- Wal: der Gesang ist ein Dauerklang, keine Folge einzelner Rufe.
     * Deshalb Schleifenbereiche statt Segmente. --- */
    wal1: { datei: 'audio/wal1.mp3', segmente: [[2.0, 42.0]] },
    wal2: { datei: 'audio/wal2.mp3', segmente: [[2.0, 60.0]] },

    delfin1: { datei: 'audio/delfin1.mp3', segmente: [
      [3.79, 0.22], [4.34, 0.22], [4.64, 0.32], [5.54, 0.22], [5.89, 0.37], [6.54, 0.22],
      [8.39, 0.22], [10.29, 0.22], [10.74, 0.27], [14.74, 0.27], [15.99, 0.22], [16.24, 0.32],
      [29.84, 0.22], [30.89, 0.87], [31.74, 0.42], [32.19, 0.22], [35.94, 0.22], [37.04, 0.22],
      [51.54, 0.22], [51.74, 0.27]] },
    delfin2: { datei: 'audio/delfin2.mp3', segmente: [
      [5.89, 0.22], [14.84, 1.82], [17.49, 0.27], [26.39, 0.27], [29.19, 0.22], [31.09, 0.22],
      [32.74, 0.47], [33.19, 0.22], [33.44, 0.22], [33.64, 0.27], [34.74, 1.92], [36.64, 0.27],
      [36.89, 0.27]] },

    /* --- Schnarchen: die Segmente sind einzelne Atemzüge --- */
    schnarch1: { datei: 'audio/schnarch1.mp3', segmente: [
      [9.95, 1.20], [16.75, 1.35], [33.05, 1.20], [36.45, 1.65], [39.05, 1.20], [41.50, 2.10]] },
    schnarch2: { datei: 'audio/schnarch2.mp3', segmente: [
      [9.30, 1.50], [12.90, 1.20], [16.20, 1.30], [22.70, 1.25], [25.85, 1.30], [29.20, 1.20]] },

    /* --- Donner --- */
    donnerA: { datei: 'audio/donnerA.mp3', segmente: [
      [8.85, 2.05], [10.40, 1.70], [14.85, 1.95], [16.60, 1.65], [18.25, 1.75]] },
    donnerB: { datei: 'audio/donnerB.mp3', segmente: [[0.35, 1.30]] },
    donnerC: { datei: 'audio/donnerC.mp3', segmente: [[0.30, 1.35]] },

    /* --- Bach: gleichmäßiges Plätschern, als Schleife --- */
    bach1: { datei: 'audio/bach1.mp3', segmente: [[13.0, 20.0]] },
    bach2: { datei: 'audio/bach2.mp3', segmente: [[1.0, 52.0]] },

    /* --- Wassertropfen: einzelne Tropfen --- */
    tropfen1: { datei: 'audio/tropfen1.mp3', segmente: [
      [0.05, 0.20], [1.80, 0.15], [1.95, 0.25], [2.15, 0.15], [2.70, 0.15], [4.35, 0.20],
      [4.60, 0.15], [5.30, 0.15], [6.95, 0.15], [7.20, 0.15], [7.90, 0.20], [9.50, 0.20],
      [9.70, 0.15], [9.80, 0.15], [10.55, 0.15], [12.40, 0.15], [13.15, 0.20], [14.70, 0.15],
      [14.85, 0.15], [15.00, 0.15]] },
    tropfen2: { datei: 'audio/tropfen2.mp3', segmente: [
      [0.00, 0.35], [2.05, 0.15], [2.55, 0.15], [3.00, 0.15], [4.40, 0.15], [4.50, 0.15],
      [4.65, 0.20], [5.15, 0.30], [5.60, 0.20], [7.45, 0.20], [7.70, 0.15], [8.10, 0.15],
      [8.20, 0.25], [8.95, 0.20], [10.05, 0.15], [10.45, 0.50], [11.55, 0.15], [11.70, 0.20],
      [11.95, 0.15], [12.05, 0.25]] },

    /* --- Afrika: echte Morgenatmosphäre plus Perlhühner --- */
    afrika1: { datei: 'audio/afrika1.mp3', segmente: [[1.0, 55.0]] },
    afrika2: { datei: 'audio/afrika2.mp3', segmente: [
      [1.17, 0.56], [1.62, 0.36], [3.77, 0.56], [7.82, 1.01], [10.77, 0.96], [12.37, 0.56],
      [13.67, 0.61], [15.02, 0.56], [16.82, 0.91], [17.62, 0.36], [19.37, 0.51], [19.82, 0.61],
      [22.42, 0.61], [24.77, 0.66], [27.17, 1.06], [28.42, 0.31], [28.62, 0.46]] },
    /* --- heimische Vögel (Xeno-canto über Commons, CC-BY-SA) --- */
    rotkehlchen: { datei: 'audio/rotkehlchen.mp3', segmente: [
      [1.27, 0.41], [17.92, 0.56], [22.02, 0.41], [24.62, 0.36], [26.02, 0.41], [31.82, 0.41]] },
    buchfink: { datei: 'audio/buchfink.mp3', segmente: [
      [2.52, 0.31], [2.97, 0.36], [6.07, 0.46], [6.47, 0.31], [8.07, 0.41], [8.92, 0.31],
      [9.52, 0.31], [9.92, 0.31], [14.47, 0.31], [14.77, 0.41], [15.62, 0.41], [15.97, 0.36]] },
    meise: { datei: 'audio/meise.mp3', segmente: [
      [0.00, 0.86], [0.72, 0.81], [1.67, 0.51], [2.12, 0.31], [2.32, 0.56], [2.77, 0.31],
      [23.67, 0.36], [24.07, 0.61], [31.12, 0.46], [31.47, 0.46], [31.87, 0.31]] },
    grasmuecke: { datei: 'audio/grasmuecke.mp3', segmente: [
      [3.32, 0.36], [7.57, 0.31], [8.77, 0.31], [8.97, 0.56], [9.42, 0.51], [9.82, 0.31],
      [10.02, 0.71], [11.12, 0.31], [11.62, 0.31], [12.02, 0.36], [13.22, 0.36]] },

    /* --- weitere Tukane --- */
    tukan2: { datei: 'audio/tukan2.mp3', segmente: [
      [1.32, 0.36], [4.02, 0.31], [5.47, 0.46], [7.07, 0.51], [11.72, 0.36], [14.52, 0.36],
      [15.62, 0.31], [16.42, 0.36], [17.92, 0.46], [18.57, 0.36], [18.92, 0.46], [20.62, 0.41],
      [21.02, 0.36], [21.52, 0.46], [22.22, 0.36], [23.67, 0.31], [24.37, 0.31], [25.07, 0.46]] },
    tukan3: { datei: 'audio/tukan3.mp3', segmente: [
      [0.42, 0.36], [1.02, 0.36], [2.52, 0.41], [3.07, 0.31], [5.07, 0.56], [5.82, 0.36],
      [7.77, 0.41], [8.37, 0.36], [9.82, 0.41], [10.32, 0.31], [12.07, 0.46], [12.72, 0.41],
      [14.67, 0.51], [15.42, 0.36], [17.32, 0.46], [18.07, 0.31], [19.67, 0.36], [20.27, 0.31],
      [21.57, 0.36], [24.27, 0.46], [24.97, 0.36], [26.57, 0.51], [27.27, 0.41], [28.92, 0.41]] },

    /* --- Donner --- */
    donner1: { datei: 'audio/donner1.mp3', segmente: [
      [3.35, 3.95], [6.75, 2.35], [8.45, 2.00], [11.10, 2.65], [16.85, 2.15], [22.50, 1.90]] },
    donner2: { datei: 'audio/donner2.mp3', segmente: [
      [10.50, 6.00], [16.85, 2.20], [19.00, 1.75], [21.45, 4.75]] },
    donner3: { datei: 'audio/donner3.mp3', segmente: [[0.10, 3.65]] },

    /* --- Feuer: zwei gleichmäßige Lagen als Schleife, dazu einzelne Knacker --- */
    feuer1: { datei: 'audio/feuer1.mp3', segmente: [[2.0, 46.0]] },
    feuer2: { datei: 'audio/feuer2.mp3', segmente: [[2.0, 24.0]] },
    feuerknack: { datei: 'audio/feuerknack.mp3', segmente: [
      [0.35, 0.22], [0.70, 0.27], [1.00, 0.37], [3.20, 0.32], [3.70, 0.47], [4.10, 0.22],
      [4.25, 0.32], [5.05, 0.27], [5.35, 0.37], [5.85, 0.27], [7.10, 0.22], [8.15, 0.42],
      [9.20, 0.32], [9.55, 0.22], [10.65, 0.22], [11.10, 0.22], [11.25, 0.27], [13.25, 0.22],
      [14.00, 0.22], [14.55, 0.22], [15.70, 0.27], [16.10, 0.27]] },

    /* --- Blasen --- */
    blasen1: { datei: 'audio/blasen1.mp3', segmente: [
      [1.60, 0.32], [2.60, 0.27], [8.85, 0.42], [9.20, 0.32], [9.45, 0.22], [9.60, 0.22],
      [18.70, 0.62], [20.45, 0.22], [20.60, 0.27], [20.85, 0.22], [22.55, 0.22], [24.60, 0.27],
      [25.40, 0.42], [25.80, 0.27], [26.10, 0.32], [26.45, 0.27], [26.80, 0.22]] },
    blasen2: { datei: 'audio/blasen2.mp3', segmente: [
      [0.95, 0.32], [4.00, 0.62], [6.50, 0.22], [7.35, 0.77], [8.25, 0.22], [10.55, 0.22], [10.70, 0.57]] },
    blasen3: { datei: 'audio/blasen3.mp3', segmente: [
      [3.80, 0.22], [5.80, 0.22], [7.60, 0.22], [9.10, 0.22], [10.30, 0.22], [15.85, 0.22],
      [16.25, 0.27], [17.00, 0.22], [17.60, 0.22], [18.15, 0.22], [18.90, 0.22]] },

    /* --- Grillen: Schleifenbereiche mit je einigen Zirps, nicht Einzelzirps.
     * Ein einzelner 0,16-s-Zirp als Endlosschleife klang wie ein Summton –
     * mit mehreren Zirps samt natürlichem Abstand und Ausklang stimmt es. --- */
    grille1: { datei: 'audio/grille1.mp3', segmente: [
      [0.10, 2.30], [3.30, 2.20], [5.10, 2.10]] },
    grille2: { datei: 'audio/grille2.mp3', segmente: [
      [0.00, 2.40], [3.60, 2.50], [7.90, 2.40]] },
    schnurren1: { datei: 'audio/schnurren1.mp3', segmente: [[0.5, 8.5]] },
    schnurren2: { datei: 'audio/schnurren2.mp3', segmente: [[0.3, 8.0]] }
  };

  // Welche Aufnahmen eine Kulisse braucht
  var BRAUCHT = {
    vogelDe: ['amsel', 'gartenvoegel', 'rotkehlchen', 'buchfink', 'meise', 'grasmuecke'],
    vogelTropen: ['tukane', 'tukan2', 'tukan3'],
    vogelAfrika: ['afrika1', 'afrika2'],
    wal: ['wal1', 'wal2'],
    delfin: ['delfin1', 'delfin2'],
    donner: ['donnerA', 'donnerB', 'donnerC'],
    bach: ['bach1', 'bach2'],
    tropfen: ['tropfen1', 'tropfen2'],
    schnarchen: ['schnarch1', 'schnarch2'],
    feuer: ['feuer1', 'feuer2', 'feuerknack'],
    blasen: ['blasen1', 'blasen2', 'blasen3'],
    grillen: ['grille1', 'grille2'],
    katze: ['schnurren1', 'schnurren2']
  };

  /* Der Cache-Schlüssel enthält die Abtastrate: decodeAudioData rechnet die
   * Aufnahme auf die Rate des Kontexts um. Ein Puffer aus einem 48-kHz-Kontext
   * würde in einem 44,1-kHz-Kontext zu schnell und zu hoch abgespielt. */
  var puffercache = {};    // "name@rate" -> AudioBuffer
  var laeuftGerade = {};   // "name@rate" -> Promise

  function schluessel(ctx, name) { return name + '@' + ctx.sampleRate; }

  function probeLaden(ctx, name) {
    var k = schluessel(ctx, name);
    if (puffercache[k]) return Promise.resolve(puffercache[k]);
    if (laeuftGerade[k]) return laeuftGerade[k];
    var p = PROBEN[name];
    if (!p) return Promise.reject(new Error('Unbekannte Aufnahme: ' + name));
    laeuftGerade[k] = fetch(p.datei)
      .then(function (r) {
        if (!r.ok) throw new Error(p.datei + ': HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(function (ab) {
        return new Promise(function (ok, fehl) {
          // ältere Safari-Fassungen kennen nur die Rückruf-Form
          var ergebnis = ctx.decodeAudioData(ab, ok, fehl);
          if (ergebnis && ergebnis.then) ergebnis.then(ok, fehl);
        });
      })
      .then(function (buf) {
        puffercache[k] = buf;
        delete laeuftGerade[k];
        return buf;
      })
      .catch(function (e) {
        delete laeuftGerade[k];
        throw e;
      });
    return laeuftGerade[k];
  }

  // Lädt alles, was eine Kulisse braucht. Kulissen ohne Aufnahmen sind sofort fertig.
  function laden(ctx, id) {
    var noetig = BRAUCHT[id] || [];
    if (!noetig.length) return Promise.resolve();
    return Promise.all(noetig.map(function (n) { return probeLaden(ctx, n); }));
  }

  function bereit(ctx, id) {
    var noetig = BRAUCHT[id] || [];
    for (var i = 0; i < noetig.length; i++) {
      if (!puffercache[schluessel(ctx, noetig[i])]) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------
   * Bauer: die Werkzeugkiste, die jede Kulisse benutzt.
   * Merkt sich alle erzeugten Knoten, damit sie sauber abgebaut werden.
   * ------------------------------------------------------------------ */
  function bauer(ziel, opt) {
    opt = opt || {};
    var ctx = ziel.context;
    var teile = [];
    var takte = [];      // Zeitgeber der Ruf-Vorausplanung
    var geplante = [];   // Listen bereits eingeplanter Rufe, für den Abbau
    var stereo = opt.stereo !== false && !!ctx.createStereoPanner;

    /* Geschwindigkeitsstufe der Kulisse (langsam ≈ 0,62 · normal 1 · schnell ≈ 1,55).
     * Sie geht an einer einzigen Stelle ein – hier – und wirkt von dort auf alles,
     * was ein Tempo hat: Steuerkurven, Takte, Impulsdichte und die Pausen zwischen
     * Rufen. Deshalb muss jede neue zeitabhängige Funktion T ebenfalls verrechnen. */
    var T = opt.tempo || 1;

    var api = {
      ctx: ctx,
      ziel: ziel,

      reg: function (n) { teile.push(n); return n; },

      /* --- Quellen --- */

      // Rauschen. Zufälliger Einstiegspunkt und leicht verstimmte Abspielrate:
      // dadurch laufen mehrere Quellen nie synchron und der 20-s-Puffer bleibt unhörbar.
      // art: undefined/false = weiß, true/'braun' = braun, 'rosa' = rosa
      rausch: function (art, rate) {
        var name = (art === true || art === 'braun') ? 'braun' : (art === 'rosa' ? 'rosa' : 'weiss');
        var s = ctx.createBufferSource();
        s.buffer = pufferFuer(ctx, name);
        s.loop = true;
        s.playbackRate.value = rate || (0.91 + Math.random() * 0.18);
        s.start(ctx.currentTime, Math.random() * (PUFFER_S - 1));
        return api.reg(s);
      },

      sinus: function (f, form) {
        var o = ctx.createOscillator();
        if (form) o.type = form;
        o.frequency.value = f;
        o.start();
        return api.reg(o);
      },

      // Gleichspannungsquelle (Arbeitspunkt für Steuersignale)
      dc: function (v) {
        if (ctx.createConstantSource) {
          var c = ctx.createConstantSource();
          c.offset.value = v;
          c.start();
          return api.reg(c);
        }
        var buf = ctx.createBuffer(1, 128, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < 128; i++) d[i] = 1;
        var s = ctx.createBufferSource();
        s.buffer = buf; s.loop = true; s.start();
        var g = ctx.createGain(); g.gain.value = v;
        s.connect(g);
        api.reg(s);
        return api.reg(g);
      },

      /* --- Verarbeitung --- */

      v: function (g) {
        var n = ctx.createGain();
        n.gain.value = (g === undefined ? 1 : g);
        return api.reg(n);
      },

      flt: function (typ, f, q) {
        var n = ctx.createBiquadFilter();
        n.type = typ;
        n.frequency.value = f;
        if (q !== undefined) n.Q.value = q;
        return api.reg(n);
      },
      tief: function (f, q) { return api.flt('lowpass', f, q); },
      hoch: function (f, q) { return api.flt('highpass', f, q); },
      band: function (f, q) { return api.flt('bandpass', f, q); },

      verz: function (t) {
        var n = ctx.createDelay(6);
        n.delayTime.value = t;
        return api.reg(n);
      },

      kette: function () {
        var vor = null;
        for (var i = 0; i < arguments.length; i++) {
          if (vor) vor.connect(arguments[i]);
          vor = arguments[i];
        }
        return vor;
      },

      /* --- Steuersignale --- */

      // Waveshaper aus einer Funktion (Eingang -1..1)
      kurve: function (fn) {
        var n = 2048, c = new Float32Array(n);
        for (var i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1);
        var w = ctx.createWaveShaper();
        w.curve = c;
        w.oversample = 'none';
        return api.reg(w);
      },

      // Alles unterhalb der Schwelle wird zu null, darüber weich hochgezogen.
      schwelle: function (s, exp) {
        var e = exp === undefined ? 1 : exp;
        return api.kurve(function (x) {
          return x <= s ? 0 : Math.pow((x - s) / (1 - s), e);
        });
      },

      // Langsam wanderndes Signal um "mitte" herum. Die drei Sinusfrequenzen
      // sind gegeneinander verstimmt – ihre Summe hat keine brauchbare Periode.
      steuer: function (mitte, tiefe, tempo) {
        var sum = api.v(1);
        var t = (tempo || 1) * T;
        var basis = [0.0370, 0.0194, 0.0083];
        for (var i = 0; i < 3; i++) {
          var o = api.sinus(basis[i] * t * (0.72 + Math.random() * 0.56));
          var g = api.v(tiefe / 3);
          o.connect(g); g.connect(sum);
        }
        api.dc(mitte).connect(sum);
        return sum;
      },

      // Seltene, unregelmäßige Ereignisbögen (0…1). Je höher die Schwelle,
      // desto seltener; "tempo" streckt oder staucht die ganze Zeitskala.
      selten: function (tempo, schw, exp) {
        return api.kette(api.steuer(0, 1, tempo), api.schwelle(schw, exp === undefined ? 1.8 : exp));
      },

      // Regelmäßiger Takt (Schienenstöße, Schnurren, Atemzüge). Anders als
      // "selten" bewusst gleichmäßig – hz ist die Schlagfolge je Sekunde.
      takt: function (hz, breite, exp) {
        return api.kette(api.sinus(hz * T), api.schwelle(1 - (breite === undefined ? 0.4 : breite),
          exp === undefined ? 1.4 : exp));
      },

      // Anregungsimpulse: tiefpassgefiltertes Rauschen über eine hohe Schwelle.
      // Ergibt kurze, unregelmäßige Böen – die Bandbreite bestimmt die Rate,
      // ihr Kehrwert ungefähr die Dauer einer Öffnung.
      // Die Amplitude hinter dem Tiefpass hängt von der Abtastrate ab – ohne
      // den Ausgleich knisterte es auf 44,1 kHz anders als auf 48 kHz.
      funken: function (bw, verst, schw) {
        // Die Verstärkung folgt der Bandbreite: sonst würde mit dem Tempo auch
        // die Lautstärke der Impulse springen.
        var b = bw * T;
        var norm = Math.sqrt(ctx.sampleRate / 48000) / Math.sqrt(T);
        return api.kette(api.rausch(), api.tief(b, 0.7), api.v(verst * norm), api.schwelle(schw, 1));
      },

      // Tor für lange, seltene Ereignisse (Tierrufe, Walgesang, Klickfolgen).
      // Hier sind die Bandbreiten winzig (0,5–40 Hz statt einiger hundert), und
      // je schmaler das Band, desto kleiner die Amplitude dahinter. Ohne die
      // Normierung erreichte das Signal die Schwelle nie und das Tor bliebe
      // für immer zu – genau daran waren die Vogelstimmen zuerst stumm.
      // 0,35 setzt die Streuung so, dass Spitzen etwa 1 erreichen: eine
      // Schwelle von 0,7 heißt also "gut zwei Standardabweichungen".
      torLang: function (bw, schw, exp) {
        var b = bw * T;
        var amp = Math.sqrt(b / (ctx.sampleRate / 2));
        return api.kette(api.rausch(), api.tief(b, 0.7), api.v(0.35 / amp),
          api.schwelle(schw, exp === undefined ? 1 : exp));
      },

      // Knistern/Tropfen/Blasen: Rauschen, das von Funken aufgetort und dann
      // durch einen resonanten Bandpass geschickt wird.
      knister: function (bw, verst, schw, f, q) {
        var tor = api.v(0);
        api.rausch().connect(tor);
        api.funken(bw, verst, schw).connect(tor.gain);
        return api.kette(tor, api.band(f, q));
      },

      /* Spitzenbremse für Aufnahmen mit großem Abstand zwischen leisem Grund
       * und lauten Einzelereignissen (Feuer: leises Brennen, laute Knacker).
       * Ohne sie müsste man die ganze Kulisse so weit absenken, dass das
       * Brennen unhörbar wird – gemessen: Spitze 1,42 bei RMS 0,05. */
      presser: function (schwelle, verhaeltnis) {
        var k = ctx.createDynamicsCompressor();
        k.threshold.value = schwelle === undefined ? -20 : schwelle;
        k.knee.value = 12;
        k.ratio.value = verhaeltnis === undefined ? 5 : verhaeltnis;
        k.attack.value = 0.003;
        k.release.value = 0.12;
        return api.reg(k);
      },

      // Ein schlichter Nachhall aus drei rückgekoppelten Verzögerungen.
      // Die Wege werden abwechselnd nach links und rechts gelegt: sonst kommt
      // alles Verhallte in der Mitte heraus und zieht die ganze Kulisse nach
      // Mono – die Tierstimmen mit viel Hall waren genau deshalb einkanalig.
      hall: function (zeit, fb, daempf) {
        var ein = api.v(1), aus = api.v(1);
        var zeiten = [zeit, zeit * 1.37, zeit * 1.83];
        var seiten = [-0.55, 0.5, 0.15];
        for (var i = 0; i < zeiten.length; i++) {
          var d = api.verz(zeiten[i]);
          var lp = api.tief(daempf || 2200);
          var g = api.v(fb);
          ein.connect(d);
          d.connect(lp); lp.connect(g); g.connect(d);   // Rückkopplung
          if (stereo) {
            var p = api.reg(ctx.createStereoPanner());
            p.pan.value = seiten[i];
            d.connect(p); p.connect(aus);
          } else {
            d.connect(aus);
          }
        }
        return { ein: ein, aus: aus };
      },

      /* --- Verdrahtung --- */

      // Ein Steuersignal auf einen Parameter legen (Parameter vorher auf 0 setzen).
      mod: function (param, signal, skala) {
        var g = api.v(skala === undefined ? 1 : skala);
        signal.connect(g);
        g.connect(param);
        return g;
      },

      // Lautstärke, die um "mitte" herum langsam atmet.
      atem: function (node, mitte, tiefe, tempo) {
        node.gain.value = 0;
        api.steuer(mitte, tiefe, tempo).connect(node.gain);
        return node;
      },

      // Schicht an den Ausgang hängen (mit Pegel und Stereoposition).
      raus: function (node, pegel, pan) {
        var g = api.v(pegel === undefined ? 1 : pegel);
        node.connect(g);
        if (stereo && pan) {
          var p = api.reg(ctx.createStereoPanner());
          p.pan.value = Math.max(-1, Math.min(1, pan));
          g.connect(p); p.connect(ziel);
        } else {
          g.connect(ziel);
        }
        return g;
      },

      /* --- Tierstimmen ---
       * Ein Ruf ist ein kurzer Ton mit gleitender Tonhöhe. Das Tor (funken)
       * bestimmt Länge und Häufigkeit, ein eigener Modulator lässt die Tonhöhe
       * während des Rufs wandern – dadurch klingt kein Ruf wie der vorige.
       * o: {f, hub, tempo, laenge, dichte, phrase, rau, triller, pegel, pan, ziel}
       */
      ruf: function (o) {
        var quelle;
        if (o.rau) {
          // rauer Ruf (Papagei, Krähe): schmalbandiges Rauschen
          var bf = api.band(o.f, o.rau);
          bf.frequency.value = 0;
          api.mod(bf.frequency, api.steuer(o.f, o.hub, o.tempo || 30));
          quelle = api.kette(api.rausch(), bf);
        } else {
          // reiner Pfiff (Meise, Amsel): Oszillator mit gleitender Tonhöhe
          var osc = api.sinus(0, o.form || 'sine');
          osc.frequency.value = 0;
          api.mod(osc.frequency, api.steuer(o.f, o.hub, o.tempo || 30));
          quelle = osc;
        }

        // Triller: schnelle Amplitudenwiederholung innerhalb des Rufs
        if (o.triller) {
          var tr = api.v(0);
          quelle.connect(tr);
          api.kette(api.sinus(o.triller), api.schwelle(-0.1, 0.8)).connect(tr.gain);
          quelle = tr;
        }

        // das eigentliche Rufttor
        var tor = api.v(0);
        quelle.connect(tor);
        api.mod(tor.gain, api.torLang(o.laenge || 12, o.dichte === undefined ? 0.68 : o.dichte), 1.4);

        // Phrasen: das Tier ruft in Serien und schweigt dazwischen
        var aus = tor;
        if (o.phrase) {
          var ph = api.v(0);
          tor.connect(ph);
          // Die Phrase ist meist offen und macht nur gelegentlich Pause: sie
          // liegt hinter dem Ruftor, und zwei enge Tore hintereinander ließen
          // die Vögel fast verstummen (gemessen: 2 % Aktivität).
          api.mod(ph.gain, api.selten(o.phrase, o.phraseSchwelle === undefined ? -0.2 : o.phraseSchwelle, 1.2), 1.0);
          aus = ph;
        }

        var g = api.raus(aus, o.pegel === undefined ? 0.3 : o.pegel, o.pan);
        if (o.ziel) aus.connect(o.ziel);   // zusätzlich in den Hall
        return g;
      },

      /* --- Aufnahmen abspielen ---
       * o: {probe, pegel, pause:[min,max], rate:[min,max], breite, ziel, hallAnteil}
       *
       * Einzelne Rufe in zufälliger Folge. Geplant wird weit im Voraus über
       * start(zeitpunkt): Web Audio hält die Zeitpunkte exakt ein, auch wenn
       * das Handy die JS-Zeitgeber längst eingefroren hat. Der Vorlauf von
       * zwei Minuten überlebt selbst harte Drosselung – deshalb ist der
       * Zeitgeber hier unbedenklich, anders als einer im Klangpfad.
       */
      rufe: function (o) {
        var probe = PROBEN[o.probe];
        var puffer = puffercache[schluessel(ctx, o.probe)];
        if (!probe || !puffer) return null;

        var summe = api.v(o.pegel === undefined ? 1 : o.pegel);
        // "roh" liefert den Knoten unverbunden zurück – dann kann der Aufrufer
        // noch etwas dazwischenhängen (beim Donner ein Tiefpass, der die
        // Aufnahme in die Ferne rückt).
        if (!o.roh) summe.connect(ziel);
        if (o.ziel) summe.connect(o.ziel);

        // schnelleres Tempo = kürzere Pausen zwischen den Rufen
        var roh = o.pause || [1.5, 6];
        var pause = [roh[0] / T, roh[1] / T];
        var rate = o.rate || [0.94, 1.06];
        var breite = o.breite === undefined ? 0.7 : o.breite;
        var naechste = ctx.currentTime + 0.4 + Math.random() * (o.start || 2);
        var offen = [];

        function planen() {
          var horizont = ctx.currentTime + 120;
          var wache = 0;
          while (naechste < horizont && wache++ < 400) {
            var seg = probe.segmente[Math.floor(Math.random() * probe.segmente.length)];
            var r = rate[0] + Math.random() * (rate[1] - rate[0]);
            var dauer = seg[1] / r;
            var t = naechste;

            var q = ctx.createBufferSource();
            q.buffer = puffer;
            q.playbackRate.value = r;
            var g = ctx.createGain();
            var lautstaerke = 0.65 + Math.random() * 0.35;
            // kurze Ein- und Ausblendung: sonst knackt jede Schnittkante
            var an = Math.min(0.03, dauer * 0.2);
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(lautstaerke, t + an);
            g.gain.setValueAtTime(lautstaerke, t + dauer - an);
            g.gain.linearRampToValueAtTime(0, t + dauer);
            q.connect(g);
            if (stereo && breite) {
              var p = ctx.createStereoPanner();
              p.pan.value = (Math.random() * 2 - 1) * breite;
              g.connect(p); p.connect(summe);
            } else {
              g.connect(summe);
            }
            q.start(t, seg[0], seg[1]);
            offen.push(q);
            q.onended = function () {
              try { this.disconnect(); } catch (e) { }
              var i = offen.indexOf(this);
              if (i >= 0) offen.splice(i, 1);
            };
            naechste = t + dauer + pause[0] + Math.random() * (pause[1] - pause[0]);
          }
        }
        planen();
        var taktId = setInterval(planen, 30000);
        takte.push(taktId);
        geplante.push(offen);
        return summe;
      },

      /* Dauerhafte Aufnahme als Schleife (Schnurren, Zirpen). Zwei Quellen mit
       * leicht verschiedener Geschwindigkeit laufen auseinander, dadurch bleibt
       * die Wiederholung unauffällig. */
      schleife: function (o) {
        var probe = PROBEN[o.probe];
        var puffer = puffercache[schluessel(ctx, o.probe)];
        if (!probe || !puffer) return null;
        var seg = probe.segmente[o.segment || 0];

        var q = ctx.createBufferSource();
        q.buffer = puffer;
        q.loop = true;
        q.loopStart = seg[0];
        q.loopEnd = seg[0] + seg[1];
        /* Bei Schleifen verschiebt die Abspielrate auch die Tonhöhe. Wie stark
         * das Tempo mitgehen soll, entscheidet die Kulisse über "tempoAnteil":
         * beim Zirpen darf es deutlich (Grillen zirpen bei Wärme wirklich
         * schneller und höher), beim Feuer kaum – sonst klingt es nach
         * Zeitraffer statt nach lebhafterem Feuer. */
        var anteil = (o.tempoAnteil === undefined) ? 0.45 : o.tempoAnteil;
        q.playbackRate.value = (o.rate || 1) * (1 + (T - 1) * anteil);
        q.start(ctx.currentTime, seg[0] + Math.random() * seg[1] * 0.5);
        api.reg(q);

        var g = api.v(o.pegel === undefined ? 1 : o.pegel);
        q.connect(g);
        var hin = o.an || ziel;      // "an" leitet die Schleife woandershin (z.B. Spitzenbremse)
        if (stereo && o.pan) {
          var p = api.reg(ctx.createStereoPanner());
          p.pan.value = o.pan;
          g.connect(p); p.connect(hin);
        } else {
          g.connect(hin);
        }
        return g;
      },

      abbau: function () {
        for (var t = 0; t < takte.length; t++) clearInterval(takte[t]);
        takte.length = 0;
        for (var k = 0; k < geplante.length; k++) {
          var liste = geplante[k];
          for (var j = liste.length - 1; j >= 0; j--) {
            try { liste[j].onended = null; liste[j].stop(0); } catch (e) { }
            try { liste[j].disconnect(); } catch (e) { }
          }
          liste.length = 0;
        }
        geplante.length = 0;
        for (var i = 0; i < teile.length; i++) {
          var n = teile[i];
          try { if (n.stop) n.stop(0); } catch (e) { }
          try { n.disconnect(); } catch (e) { }
        }
        teile.length = 0;
      }
    };
    return api;
  }

  /* ==================================================================
   * Die Kulissen
   * ================================================================== */

  var SZENEN = {

    /* ================= Wasser ================= */

    /* ---- Regen ---- */
    regen: function (b) {
      // Beim Regen IST das Rauschen die Quelle – hier gehört es dazu.
      var teppich = b.kette(b.rausch(), b.hoch(360, 0.7), b.tief(6200, 0.6));
      b.atem(b.raus(teppich, 0.30, -0.18), 0.30, 0.075, 0.5);

      var fein = b.kette(b.rausch(), b.hoch(3200, 0.6));
      b.atem(b.raus(fein, 0.11, 0.26), 0.11, 0.055, 0.9);

      var koerper = b.kette(b.rausch(true), b.tief(420, 0.8), b.hoch(90));
      b.atem(b.raus(koerper, 0.26, 0), 0.26, 0.06, 0.35);

      // Prasseln auf Blech/Fensterbank. Die Bandbreite im Impulstor bestimmt,
      // wie dicht die Tropfen fallen – die Schwelle, wie laut sie herausstechen.
      var tropfen = b.knister(2200, 5.0, 0.60, 1500, 9);
      b.raus(tropfen, 0.55, 0.32);

      // Einzelne dicke Tropfen. Schmalbandige Tore öffnen selten und liefern
      // daher wenig Energie – der hohe Pegel ist gemessen, nicht geraten.
      var dick = b.knister(140, 5.6, 0.54, 780, 14);
      b.raus(dick, 2.2, -0.38);
    },

    /* ---- Strand / Wellen ---- */
    strand: function (b) {
      // Wellenkurve: Kämme etwa alle 8–20 Sekunden, nie im gleichen Abstand
      var welle = b.selten(2.6, -0.15, 1.5);

      // Brandung – wird beim Brechen lauter und heller zugleich
      var bFilter = b.band(650, 0.5);
      var bQuelle = b.kette(b.rausch(), bFilter);
      bFilter.frequency.value = 380;
      b.mod(bFilter.frequency, welle, 900);
      var bg = b.raus(bQuelle, 0, -0.12);
      bg.gain.value = 0.05;
      b.mod(bg.gain, welle, 0.85);

      // auslaufende Gischt, gut eine Sekunde nach dem Kamm
      var spaet = b.verz(1.15);
      welle.connect(spaet);
      var gischt = b.kette(b.rausch(), b.hoch(2600, 0.6));
      var gg = b.raus(gischt, 0, 0.3);
      gg.gain.value = 0.012;
      b.mod(gg.gain, spaet, 0.42);

      var kies = b.knister(900, 4.2, 0.58, 3600, 3.5);
      var kg = b.raus(kies, 0, 0.18);
      kg.gain.value = 0.015;
      b.mod(kg.gain, spaet, 0.45);

      var grund = b.kette(b.rausch(true), b.tief(240, 0.9));
      b.atem(b.raus(grund, 0.17, 0), 0.17, 0.06, 0.3);

      var fern = b.kette(b.rausch(), b.band(950, 0.4));
      b.atem(b.raus(fern, 0.06, 0.45), 0.06, 0.035, 0.8);
    },

    /* ---- Fluss (über Wasser) ---- */
    fluss: function (b) {
      var grund = b.kette(b.rausch(), b.band(1150, 0.75));
      b.atem(b.raus(grund, 0.3, 0), 0.3, 0.05, 0.7);

      // drei Strudel: schmalbandig, mit langsam wandernder Tonhöhe
      var pans = [-0.45, 0.05, 0.5];
      var tempi = [0.9, 1.5, 2.3];
      for (var i = 0; i < 3; i++) {
        var f = b.band(1000, 7);
        f.frequency.value = 0;
        b.mod(f.frequency, b.steuer(720 + i * 420, 320, tempi[i]));
        var s = b.kette(b.rausch(), f);
        b.atem(b.raus(s, 0.14, pans[i]), 0.14, 0.06, tempi[i] * 0.6);
      }

      var hoehen = b.kette(b.rausch(), b.hoch(4200, 0.7));
      b.atem(b.raus(hoehen, 0.07, 0.35), 0.07, 0.035, 1.2);

      var gluck = b.knister(420, 5.0, 0.52, 640, 16);
      b.raus(gluck, 2.5, -0.3);

      var strom = b.kette(b.rausch(true), b.tief(300, 0.9));
      b.raus(strom, 0.2, 0);
    },

    /* ---- Fluss (unter Wasser) ---- */
    unterwasser: function (b) {
      var raum = b.hall(0.09, 0.55, 500);
      b.raus(raum.aus, 0.32, 0);

      var druck = b.kette(b.rausch(true), b.tief(130, 1.5));
      b.atem(b.raus(druck, 0.28, 0), 0.28, 0.06, 0.4);

      var stroem = b.kette(b.rausch(), b.tief(460, 2.4), b.hoch(80));
      b.atem(b.raus(stroem, 0.17, -0.15), 0.17, 0.06, 0.6);
      stroem.connect(raum.ein);

      var bf = b.band(400, 22);
      bf.frequency.value = 0;
      b.mod(bf.frequency, b.steuer(360, 190, 2.8));
      var tor = b.v(0);
      b.rausch().connect(tor);
      b.funken(300, 5.0, 0.50).connect(tor.gain);
      var blasen = b.kette(tor, bf);
      b.raus(blasen, 5.0, 0.25);
      blasen.connect(raum.ein);

      var rumpel = b.kette(b.rausch(true), b.tief(70, 1.1));
      b.atem(b.raus(rumpel, 0.17, 0), 0.17, 0.07, 0.25);

      var kies = b.knister(560, 4.6, 0.56, 900, 10);
      b.raus(b.kette(kies, b.tief(1200, 1.0)), 1.2, -0.35);
    },

    /* ---- Blubberblasen (Aufnahmen, isoliert ohne Wasserteppich) ---- */
    blasen: function (b) {
      var raum = b.hall(0.07, 0.45, 2200);
      b.raus(raum.aus, 0.35, 0);
      // drei Quellen mit verschiedenen Tonlagen: die Abspielgeschwindigkeit
      // verschiebt die Blasengröße mit
      b.rufe({ probe: 'blasen1', pegel: 0.75, pause: [0.15, 1.6], rate: [0.9, 1.15],
               breite: 0.8, ziel: raum.ein, start: 1 });
      b.rufe({ probe: 'blasen2', pegel: 0.60, pause: [0.4, 3.0], rate: [0.75, 1.0],
               breite: 0.7, ziel: raum.ein, start: 2 });   // größere, tiefere Blasen
      b.rufe({ probe: 'blasen3', pegel: 0.55, pause: [0.3, 2.2], rate: [1.0, 1.3],
               breite: 0.85, ziel: raum.ein, start: 3 });  // feine, hohe Bläschen
    },

    /* ================= Feuer ================= */

    /* ---- Lagerfeuer (Aufnahmen) ----
     * Das gleichmäßige Brennen läuft als Schleife, die einzelnen Knacker
     * kommen als eigene Ereignisse dazu. Zwei Schleifen mit leicht
     * verschiedener Geschwindigkeit driften auseinander, dadurch bleibt die
     * Wiederholung unhörbar. */
    feuer: function (b) {
      var bremse = b.presser(-22, 6);
      b.raus(bremse, 1.0, 0);
      // kaum Tonhöhenwanderung: das Tempo wirkt hier über die Knacker
      var a = b.schleife({ probe: 'feuer1', rate: 0.97, pegel: 0, pan: -0.15, an: bremse, tempoAnteil: 0.12 });
      var c = b.schleife({ probe: 'feuer2', rate: 1.04, pegel: 0, pan: 0.18, an: bremse, tempoAnteil: 0.12 });
      if (!a || !c) return;
      // Die Feldaufnahmen sind leise ausgesteuert: das gleichmäßige Brennen
      // braucht kräftig Pegel, damit es nicht hinter den Knackern verschwindet.
      b.atem(a, 2.3, 0.5, 0.6);
      b.atem(c, 1.7, 0.4, 0.9);
      // einzelne Knacker, ruhig verteilt – ebenfalls durch die Bremse
      var k = b.rufe({ probe: 'feuerknack', pegel: 0.55, pause: [0.6, 4], rate: [0.9, 1.15],
                       breite: 0.7, start: 1, roh: true });
      if (k) k.connect(bremse);
    },


    /* ================= Wind & Wetter ================= */

    /* ---- Wind ---- */
    wind: function (b) {
      var f = b.band(430, 1.3);
      f.frequency.value = 0;
      b.mod(f.frequency, b.steuer(440, 280, 0.55));
      var boe = b.kette(b.rausch(), f);
      b.atem(b.raus(boe, 0.4, -0.2), 0.34, 0.30, 2.8);

      var tief = b.kette(b.rausch(true), b.tief(190, 0.8));
      b.atem(b.raus(tief, 0.36, 0.15), 0.32, 0.22, 1.6);

      var saeuseln = b.kette(b.rausch(), b.hoch(1900, 0.7), b.tief(7500));
      b.atem(b.raus(saeuseln, 0.13, 0.4), 0.12, 0.10, 3.4);

      var pf = b.band(1200, 11);
      pf.frequency.value = 0;
      b.mod(pf.frequency, b.steuer(1150, 620, 1.15));
      var pfeif = b.kette(b.rausch(), pf);
      var pg = b.raus(pfeif, 0, -0.45);
      pg.gain.value = 0;
      b.mod(pg.gain, b.selten(2.0, 0.44, 2.0), 0.55);

      var basis = b.kette(b.rausch(true), b.tief(85, 1.0));
      b.raus(basis, 0.28, 0);
    },

    /* ---- Fernes Donnergrollen (Aufnahmen, isoliert ohne Regen) ----
     * Die Aufnahmen sind teils nahe Schläge. Ein Tiefpass nimmt ihnen die
     * Höhen – genau das macht der Weg durch die Luft mit entferntem Donner,
     * und erst dadurch klingt er nach "weit weg" statt nach "direkt daneben".
     * Ein langer Hall setzt das Grollen in die Landschaft. */
    donner: function (b) {
      var weite = b.hall(0.31, 0.62, 520);
      b.raus(weite.aus, 0.5, 0);

      function ferne(probe, pegel, pause, tiefpass, start, breite) {
        var s = b.rufe({ probe: probe, pegel: pegel, pause: pause, rate: [0.85, 1.0],
                         breite: breite, start: start, roh: true });
        if (!s) return;
        var gedaempft = b.kette(s, b.tief(tiefpass, 0.8), b.tief(tiefpass * 2.2, 0.6));
        // zurückhaltend: drei Donnerlagen plus Hall rissen sonst über die
        // Vollaussteuerung (gemessen: Spitze 1,13)
        b.raus(gedaempft, 0.5, 0);
        gedaempft.connect(weite.ein);
      }

      // "DistantThunder" trägt die Kulisse, die beiden nahen Schläge kommen
      // seltener und stärker gedämpft dazu – Entfernung heißt: weniger Höhen.
      ferne('donnerA', 0.90, [12, 40], 420, 3, 0.4);
      ferne('donnerB', 0.75, [26, 80], 200, 20, 0.3);
      ferne('donnerC', 0.70, [34, 95], 240, 45, 0.5);

      // ganz tiefes Nachrollen, synthetisch: verlängert die Aufnahmen nach unten
      var sub = b.kette(b.rausch(true), b.tief(55, 1.4));
      var tor3 = b.v(0);
      sub.connect(tor3);
      b.mod(tor3.gain, b.selten(0.9, 0.60, 3.0), 1.0);
      b.raus(tor3, 0.4, 0);
    },

    /* ---- Baumwipfel-Rascheln ---- */
    wipfel: function (b) {
      // Blätter: sehr viele winzige Anschläge, keine tiefe Grundschicht
      var bf = b.band(3800, 2.2);
      bf.frequency.value = 0;
      b.mod(bf.frequency, b.steuer(3900, 1400, 2.4));
      var tor = b.v(0);
      b.rausch().connect(tor);
      var dichte = b.v(0);
      b.funken(2600, 5.0, 0.42).connect(dichte);
      b.atem(dichte, 0.9, 0.55, 2.2);          // Böen lassen das Rascheln anschwellen
      dichte.connect(tor.gain);
      b.raus(b.kette(tor, bf), 0.85, -0.2);

      // zweite Lage, etwas dunkler und auf der anderen Seite
      var bf2 = b.band(2200, 2.0);
      var tor2 = b.v(0);
      b.rausch().connect(tor2);
      var dichte2 = b.v(0);
      b.funken(1800, 5.0, 0.46).connect(dichte2);
      b.atem(dichte2, 0.8, 0.5, 1.6);
      dichte2.connect(tor2.gain);
      b.raus(b.kette(tor2, bf2), 0.75, 0.3);

      // einzelne Zweige, die sich reiben
      b.raus(b.knister(120, 5.6, 0.58, 900, 8), 1.6, 0.42);

      // ein Hauch Luftbewegung durch die Krone – schmal gefiltert, kein Teppich
      var luft = b.kette(b.rausch(), b.band(1400, 0.9));
      b.atem(b.raus(luft, 0.1, 0), 0.1, 0.09, 2.4);
    },

    /* ================= Tiere ================= */

    /* ---- Grillenzirpen (Aufnahmen) ----
     * Fünf einzelne Grillen in verschiedenen Tonlagen und Entfernungen ergeben
     * ein Feld. Jede Stimme zirpt in Schüben und macht Pausen – gesteuert von
     * einer synthetischen Kurve, damit die Stimmen nie im Gleichtakt laufen. */
    grillen: function (b) {
      var weite = b.hall(0.16, 0.4, 5200);
      b.raus(weite.aus, 0.32, 0);

      var stimmen = [
        { probe: 'grille2', segment: 0, rate: 1.00, pegel: 0.60, pan: -0.5, phrase: 9 },
        { probe: 'grille1', segment: 0, rate: 1.09, pegel: 0.42, pan: 0.45, phrase: 13 },
        { probe: 'grille2', segment: 1, rate: 0.88, pegel: 0.34, pan: 0.12, phrase: 7 },
        { probe: 'grille1', segment: 2, rate: 1.20, pegel: 0.26, pan: -0.22, phrase: 16 },
        { probe: 'grille2', segment: 2, rate: 0.94, pegel: 0.20, pan: 0.72, phrase: 11 }
      ];
      for (var i = 0; i < stimmen.length; i++) {
        var s = stimmen[i];
        var g = b.schleife({ probe: s.probe, segment: s.segment, rate: s.rate,
                             pegel: 0, pan: s.pan, tempoAnteil: 0.8 });
        if (!g) return;
        b.mod(g.gain, b.selten(s.phrase, -0.05, 1.2), s.pegel);
        if (i > 1) g.connect(weite.ein);   // die entfernteren Stimmen mit Raum
      }
    },

    /* ---- Vogelstimmen: Deutschland (Aufnahmen) ----
     * Sechs Stimmen, jede mit eigenem Rhythmus – so entsteht ein Garten und
     * nicht ein einzelner Vogel. Verrauschtere Aufnahmen laufen leiser. */
    vogelDe: function (b) {
      var weite = b.hall(0.10, 0.25, 4200);
      b.raus(weite.aus, 0.10, 0);   // deutlich weniger Hall: Vogelrufe im Garten sind trocken
      b.rufe({ probe: 'amsel', pegel: 0.80, pause: [3, 11], rate: [0.95, 1.05],
               breite: 0.75, ziel: weite.ein, start: 3 });
      b.rufe({ probe: 'gartenvoegel', pegel: 0.55, pause: [2.5, 9], rate: [0.93, 1.08],
               breite: 0.8, ziel: weite.ein, start: 6 });
      b.rufe({ probe: 'rotkehlchen', pegel: 0.55, pause: [3, 12], rate: [0.96, 1.06],
               breite: 0.7, ziel: weite.ein, start: 9 });
      b.rufe({ probe: 'buchfink', pegel: 0.50, pause: [2, 8], rate: [0.94, 1.06],
               breite: 0.75, ziel: weite.ein, start: 5 });
      b.rufe({ probe: 'meise', pegel: 0.45, pause: [4, 14], rate: [0.96, 1.05],
               breite: 0.7, ziel: weite.ein, start: 13 });
      b.rufe({ probe: 'grasmuecke', pegel: 0.50, pause: [3, 11], rate: [0.95, 1.06],
               breite: 0.65, ziel: weite.ein, start: 17 });
    },

    /* ---- Vogelstimmen: Tropen (Aufnahmen) ---- */
    vogelTropen: function (b) {
      var weite = b.hall(0.14, 0.32, 3200);
      b.raus(weite.aus, 0.16, 0);   // Regenwald hallt etwas, aber nicht wie eine Halle
      // Tukane im Amazonas: viele kurze Rufe dicht hintereinander
      b.rufe({ probe: 'tukane', pegel: 0.60, pause: [0.4, 2.6], rate: [0.9, 1.1],
               breite: 0.85, ziel: weite.ein, start: 2 });
      b.rufe({ probe: 'tukan3', pegel: 0.55, pause: [0.8, 4], rate: [0.92, 1.08],
               breite: 0.8, ziel: weite.ein, start: 4 });
      b.rufe({ probe: 'tukan2', pegel: 0.45, pause: [1.5, 6], rate: [0.88, 1.04],
               breite: 0.7, ziel: weite.ein, start: 7 });
      // tiefere, fernere Rufe derselben Aufnahmen
      b.rufe({ probe: 'tukane', pegel: 0.30, pause: [2, 8], rate: [0.72, 0.85],
               breite: 0.6, ziel: weite.ein, start: 11 });
    },

    /* ---- Vogelstimmen: Afrika (Aufnahmen) ----
     * Eine echte Morgenaufnahme aus Südafrika trägt die Kulisse; darüber
     * kommen einzelne Perlhuhnrufe. Zusammengesetzte Einzelrufe verschiedener
     * Arten klangen wie ein Zoo, nicht wie ein Ort. */
    vogelAfrika: function (b) {
      // Die Perlhühner sind viel lauter als die Morgenatmosphäre – ohne
      // Spitzenbremse bliebe der Morgen unhörbar leise.
      var bremse = b.presser(-24, 4);
      b.raus(bremse, 1.0, 0);
      var morgen = b.schleife({ probe: 'afrika1', rate: 1.0, pegel: 0, pan: 0,
                                tempoAnteil: 0.3, an: bremse });
      if (!morgen) return;
      b.atem(morgen, 2.4, 0.3, 0.4);     // die Feldaufnahme ist leise ausgesteuert
      var p = b.rufe({ probe: 'afrika2', pegel: 1.1, pause: [4, 16], rate: [0.92, 1.06],
                       breite: 0.7, start: 6, roh: true });
      if (p) p.connect(bremse);
    },

    /* ---- Walgesang (Aufnahmen) ----
     * Walgesang ist ein Dauerklang, kein Nacheinander einzelner Rufe – als
     * geschnittene Einzelstücke klang er zerhackt. Zwei Schleifen mit leicht
     * verschiedener Geschwindigkeit driften auseinander, der Nachhall setzt
     * das Ganze in die Tiefe. */
    wal: function (b) {
      var tiefe = b.hall(0.42, 0.48, 700);
      b.raus(tiefe.aus, 0.5, 0);
      var a = b.schleife({ probe: 'wal1', rate: 0.98, pegel: 0, pan: -0.2, tempoAnteil: 0.3 });
      var c = b.schleife({ probe: 'wal2', rate: 1.03, pegel: 0, pan: 0.22, tempoAnteil: 0.3 });
      if (!a || !c) return;
      b.atem(a, 0.85, 0.25, 0.35);
      b.atem(c, 0.55, 0.20, 0.25);
      a.connect(tiefe.ein);
      c.connect(tiefe.ein);
    },

    /* ---- Delfingesang (Aufnahmen) ---- */
    delfin: function (b) {
      var raum = b.hall(0.11, 0.45, 6000);
      b.raus(raum.aus, 0.3, 0);
      // Pfiffe und Klickfolgen kommen in Schüben
      b.rufe({ probe: 'delfin1', pegel: 0.85, pause: [0.2, 2.2], rate: [0.94, 1.08],
               breite: 0.8, ziel: raum.ein, start: 1 });
      b.rufe({ probe: 'delfin2', pegel: 0.70, pause: [0.6, 4], rate: [0.9, 1.05],
               breite: 0.7, ziel: raum.ein, start: 3 });
      b.rufe({ probe: 'delfin1', pegel: 0.40, pause: [2, 7], rate: [0.8, 0.92],
               breite: 0.5, ziel: raum.ein, start: 6 });    // entferntere Tiere
    },

    /* ---- Bach (Aufnahmen) ----
     * Anders als der Fluss: kleiner und näher, plätschernd statt rauschend. */
    bach: function (b) {
      var a = b.schleife({ probe: 'bach1', rate: 0.98, pegel: 0, pan: -0.25, tempoAnteil: 0.25 });
      var c = b.schleife({ probe: 'bach2', rate: 1.03, pegel: 0, pan: 0.28, tempoAnteil: 0.25 });
      if (!a || !c) return;
      b.atem(a, 2.0, 0.3, 0.5);          // beide Bachaufnahmen sind leise
      b.atem(c, 2.3, 0.35, 0.35);
    },

    /* ---- Wassertropfen (Aufnahmen) ----
     * Einzelne Tropfen mit viel Raum dazwischen – das Fallen zählt, nicht der
     * Untergrund. Ein langer Hall gibt jedem Tropfen seine Höhle. */
    tropfen: function (b) {
      // Einzelne Tropfen sind sehr laut gegen die Stille dazwischen; ohne
      // Spitzenbremse müsste die ganze Kulisse fast unhörbar leise laufen.
      var bremse = b.presser(-20, 5);
      b.raus(bremse, 1.0, 0);
      var hoehle = b.hall(0.19, 0.55, 3200);
      hoehle.aus.connect(bremse);
      [{ p: 'tropfen1', g: 3.0, pause: [0.25, 1.8], r: [0.85, 1.15], br: 0.8, s: 1 },
       { p: 'tropfen2', g: 2.5, pause: [0.4, 2.4], r: [0.9, 1.2], br: 0.75, s: 2 },
       { p: 'tropfen1', g: 1.8, pause: [1.2, 4], r: [0.65, 0.8], br: 0.6, s: 4 }
      ].forEach(function (t) {
        var k = b.rufe({ probe: t.p, pegel: t.g, pause: t.pause, rate: t.r,
                         breite: t.br, ziel: hoehle.ein, start: t.s, roh: true });
        if (k) k.connect(bremse);
      });
    },

    /* ---- Katzenschnurren (Aufnahme) ----
     * Schnurren läuft durchgehend, deshalb als Schleife. Zwei Aufnahmen mit
     * leicht verschiedener Geschwindigkeit driften auseinander – dadurch
     * entsteht kein hörbarer Takt. */
    katze: function (b) {
      var a = b.schleife({ probe: 'schnurren1', rate: 0.97, pegel: 0, pan: -0.12 });
      var c = b.schleife({ probe: 'schnurren2', rate: 1.03, pegel: 0, pan: 0.15 });
      if (!a || !c) return;
      // ruhiges An- und Abschwellen, wie beim Atmen der Katze
      b.atem(a, 0.85, 0.2, 0.5);
      b.atem(c, 0.55, 0.18, 0.35);
    },

    /* ---- Leises Schnarchen (Aufnahmen) ----
     * Synthetisch klang es nach Motor: ein Atemzug hat eine Kehle, kein Rasseln
     * aus Rauschen. Die Segmente sind einzelne Atemzüge; die Pausen dazwischen
     * sind eng gehalten, denn Atmung ist regelmäßig – aber nicht metronomisch. */
    schnarchen: function (b) {
      var raum = b.hall(0.09, 0.3, 1400);
      b.raus(raum.aus, 0.12, 0);   // nur ein Hauch Zimmer, kein Hall
      b.rufe({ probe: 'schnarch2', pegel: 0.85, pause: [2.0, 3.2], rate: [0.94, 1.04],
               breite: 0.25, ziel: raum.ein, start: 1 });
      b.rufe({ probe: 'schnarch1', pegel: 0.45, pause: [7, 16], rate: [0.9, 1.02],
               breite: 0.3, ziel: raum.ein, start: 9 });   // gelegentlich ein tieferer Zug
    },

    /* ================= Menschenwelt ================= */

    /* ---- Zug in der Ferne ---- */
    zug: function (b) {
      var weite = b.hall(0.26, 0.6, 900);
      b.raus(weite.aus, 0.8, 0);

      // Das Rollen: tiefes Band, das langsam näher kommt und wieder abfällt
      var naehe = b.steuer(0.55, 0.4, 0.7);
      var rollen = b.kette(b.rausch(true), b.tief(260, 1.0));
      var rTor = b.v(0);
      rollen.connect(rTor);
      rTor.gain.value = 0;
      b.mod(rTor.gain, naehe, 0.65);
      b.raus(rTor, 0.55, 0);
      rTor.connect(weite.ein);

      // Schienenstöße: regelmäßiger Takt, gedämpft durch die Entfernung
      var stoss = b.v(0);
      b.rausch().connect(stoss);
      var taktG = b.v(0);
      b.takt(2.6, 0.22, 1.6).connect(taktG);
      b.mod(taktG.gain, naehe, 1.0);
      taktG.connect(stoss.gain);
      var st = b.kette(stoss, b.band(420, 2.2), b.tief(900, 0.9));
      b.raus(st, 0.9, -0.2);
      st.connect(weite.ein);

      // zweiter Stoß kurz nach dem ersten – ein Drehgestell hat zwei Achsen
      var stoss2 = b.v(0);
      b.rausch().connect(stoss2);
      var takt2 = b.verz(0.17);
      b.takt(2.6, 0.22, 1.6).connect(takt2);
      var takt2G = b.v(0);
      takt2.connect(takt2G);
      b.mod(takt2G.gain, naehe, 1.0);
      takt2G.connect(stoss2.gain);
      b.raus(b.kette(stoss2, b.band(360, 2.4), b.tief(800, 0.9)), 0.65, 0.22);

      // seltenes Signalhorn: zwei Töne im Quintabstand, weit weg
      var hornTor = b.v(0);
      var h1 = b.sinus(311, 'triangle'), h2 = b.sinus(466, 'triangle');
      var hm = b.v(0.5);
      h1.connect(hm); h2.connect(hm);
      hm.connect(hornTor);
      b.mod(hornTor.gain, b.selten(0.8, 0.72, 2.4), 0.9);
      var horn = b.kette(hornTor, b.tief(1400, 0.8));
      b.raus(horn, 0.30, 0.1);
      horn.connect(weite.ein);
    },

    /* ---- Straßengeräusche ---- */
    strasse: function (b) {
      var weite = b.hall(0.16, 0.45, 1600);
      b.raus(weite.aus, 0.5, 0);

      // fernes Grundrauschen der Stadt
      var stadt = b.kette(b.rausch(true), b.tief(400, 0.8), b.hoch(70));
      b.atem(b.raus(stadt, 0.22, 0), 0.22, 0.07, 0.5);

      // vorbeifahrende Fahrzeuge: Lautstärke und Klangfarbe schwellen gemeinsam
      // an und wieder ab – das ergibt den Eindruck von Vorbeifahrt.
      function fahrzeug(tempo, schw, f, pegel, pan) {
        var ev = b.selten(tempo, schw, 1.6);
        var filt = b.band(f, 1.1);
        filt.frequency.value = f * 0.6;
        b.mod(filt.frequency, ev, f * 0.9);
        var quelle = b.kette(b.rausch(), filt);
        var tor = b.v(0);
        quelle.connect(tor);
        b.mod(tor.gain, ev, 1.0);
        b.raus(tor, pegel, pan);
        tor.connect(weite.ein);
      }
      fahrzeug(1.6, 0.34, 700, 0.75, -0.4);
      fahrzeug(1.1, 0.44, 480, 0.85, 0.45);
      fahrzeug(2.3, 0.52, 1100, 0.5, 0.15);

      // Reifenzischen auf nassem Asphalt, nur bei den lauteren Vorbeifahrten
      var zisch = b.kette(b.rausch(), b.hoch(2600, 0.7));
      var zTor = b.v(0);
      zisch.connect(zTor);
      b.mod(zTor.gain, b.selten(1.4, 0.52, 1.8), 0.35);
      b.raus(zTor, 0.5, 0.25);
    },

    /* ================= Rauschen ================= */

    weiss: function (b) {
      // volles Spektrum, nur ganz oben leicht gezähmt
      b.raus(b.kette(b.rausch(), b.tief(16000, 0.6)), 0.30, -0.2);
      b.raus(b.kette(b.rausch(), b.tief(16000, 0.6)), 0.30, 0.2);
    },

    rosa: function (b) {
      // −3 dB je Oktave: das ausgewogenste der drei, angenehm auf Dauer
      b.raus(b.rausch('rosa'), 0.55, -0.2);
      b.raus(b.rausch('rosa'), 0.55, 0.2);
    },

    braun: function (b) {
      // −6 dB je Oktave: dunkel und tieflastig, wie fernes Rauschen
      b.raus(b.rausch(true), 0.5, -0.2);
      b.raus(b.rausch(true), 0.5, 0.2);
    }
  };

  /* Pegelausgleich, damit alle Kulissen ähnlich laut wirken.
   * Die Werte sind gemessen (OfflineAudioContext, Ziel-RMS 0,09),
   * nicht geschätzt – nach jeder Klangänderung neu messen. */
  var AUSGLEICH = {
    regen: 0.82, strand: 1.22, fluss: 1.27, unterwasser: 1.10, blasen: 1.69,
    bach: 1.76, tropfen: 0.88,
    feuer: 0.69,
    wind: 1.23, donner: 0.49, wipfel: 1.25,
    grillen: 0.99, vogelDe: 1.79, vogelTropen: 1.69, vogelAfrika: 1.30,
    wal: 0.72, delfin: 2.21, katze: 1.46,
    schnarchen: 1.50, zug: 0.77, strasse: 1.75,
    weiss: 0.66, rosa: 0.28, braun: 0.95
  };

  function bauen(id, ziel, opt) {
    var fn = SZENEN[id];
    if (!fn) throw new Error('Unbekannte Kulisse: ' + id);
    var b = bauer(ziel, opt);
    fn(b);
    return b;
  }

  return {
    szenen: SZENEN,
    bauen: bauen,
    ausgleich: AUSGLEICH,
    pufferFuer: pufferFuer,
    bauer: bauer,     // für Messungen einzelner Schichten
    laden: laden,     // Aufnahmen einer Kulisse holen (Promise)
    bereit: bereit,   // liegen sie schon im Speicher?
    braucht: BRAUCHT,
    proben: PROBEN
  };
})();
