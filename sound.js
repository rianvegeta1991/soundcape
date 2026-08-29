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
    /* --- Wal: der Gesang ist ein Dauerklang, keine Folge einzelner Rufe.
     * Deshalb Schleifenbereiche statt Segmente. --- */


    /* --- Ruhiges Atmen im Schlaf: vier Atemzüge --- */

    /* --- Donner: langes Grollen ohne Regen --- */
    donnN1: { datei: 'audio/donnN1.mp3', segmente: [
      [1.08, 6.88], [7.20, 1.96], [10.56, 3.92], [15.88, 2.76]] },
    donnN2: { datei: 'audio/donnN2.mp3', segmente: [
      [32.32, 2.36], [37.52, 2.08], [41.48, 15.40]] },

    /* --- Möwen am Hafen --- */
    moewe1: { datei: 'audio/moewe1.mp3', segmente: [
      [1.72, 0.32], [4.24, 0.36], [9.20, 0.36], [13.64, 0.32], [14.40, 0.32], [15.20, 0.36],
      [15.92, 0.48], [16.88, 0.40], [17.44, 0.32], [17.64, 0.56], [18.44, 0.48], [18.84, 0.32],
      [19.12, 0.40], [19.96, 0.40], [20.72, 0.44], [21.68, 0.36], [22.60, 0.36], [23.56, 0.40]] },
    moewe2: { datei: 'audio/moewe2.mp3', segmente: [[35.0, 20.0]] },

    /* --- Blätter im Wind --- */
    blatt1: { datei: 'audio/blatt1.mp3', segmente: [[14.0, 10.0]] },

    /* --- Nieselregen: einzelne Tropfen bleiben hörbar --- */

    /* --- Wind: pfeifend und böig --- */
    windN1: { datei: 'audio/windN1.mp3', segmente: [[45.0, 12.0]] },
    windN2: { datei: 'audio/windN2.mp3', segmente: [[31.0, 15.0]] },

    /* --- Fließendes Wasser --- */
    flussN1: { datei: 'audio/flussN1.mp3', segmente: [[7.0, 55.0]] },
    flussN2: { datei: 'audio/flussN2.mp3', segmente: [[1.0, 45.0]] },

    /* --- Delfinschnattern --- */

    /* --- Bach: gleichmäßiges Plätschern, als Schleife --- */
    bach1: { datei: 'audio/bach1.mp3', segmente: [[13.0, 20.0]] },
    bach2: { datei: 'audio/bach2.mp3', segmente: [[1.0, 52.0]] },

    /* --- Leichtes Schnarchen als Schleife: ein- und ausatmen im Stück --- */
    schnarchL: { datei: 'audio/schnarchL.mp3', segmente: [[2.0, 30.0]] },

    /* --- Frösche am Teich: nur die tiefe Aufnahme.
     * frosch1 (Laubfrösche) ist raus – gemessen lagen 82 % ihrer Energie über
     * 1,2 kHz und die Sekundenpegel sprangen um den Faktor 50. Das war das
     * hohe, unregelmäßige Quaken. In frosch2 liegen die Sekunden 1 bis 29
     * gleichmäßig zwischen 0,028 und 0,057; danach blendet die Aufnahme aus. */
    frosch2: { datei: 'audio/frosch2.mp3', segmente: [[1.0, 28.0]] },

    /* --- Bauernhof: Hühner ohne Hahn.
     * Die alte Aufnahme (huhn2, "Chickens in the coop, morning") hatte
     * Hahnenschreie: im Band 1,2–3 kHz standen bei den Sekunden 11, 12, 27,
     * 42 und 44 Spitzen von 0,07 bis 0,11 gegen einen Grundwert von 0,005.
     * huhn3 ist dort durchgehend flach (0,003 bis 0,037) – kein Hahn. */
    huhn3: { datei: 'audio/huhn3.mp3', segmente: [[7.0, 10.8]] },
    kuh1: { datei: 'audio/kuh1.mp3', segmente: [
      [0.0, 4.5], [4.5, 4.5], [9.5, 4.5], [14.5, 4.5], [19.5, 4.5], [23.5, 4.0]] },

    /* --- Kaminfeuer --- */
    kamin1: { datei: 'audio/kamin1.mp3', segmente: [[36.0, 12.0]] },
    kamin2: { datei: 'audio/kamin2.mp3', segmente: [[9.0, 16.0]] },

    /* --- Klangschale und Kirchglocke --- */
    schale1: { datei: 'audio/schale1.mp3', segmente: [[4.0, 46.0]] },
    schale2: { datei: 'audio/schale2.mp3', segmente: [[0.5, 22.0]] },
    /* Genau EIN Anschlag, und zwar der bei 25,03 s: danach kommt bis 42,4 s
     * nichts mehr, der Nachklang bleibt also ungestört. Mehrere Segmente
     * hatten zur Folge, dass jeder Schlag anders klang – die Glocke soll aber
     * immer gleich läuten. */
    glocke1: { datei: 'audio/glocke1.mp3', segmente: [[24.99, 4.6]] },

    /* --- OM, von einem Menschen gesungen.
     * Die Sekunden 0,6 bis 11,6 stehen still (0,084 bis 0,123), danach klingt
     * der Gesang aus. Nur dieser Teil läuft als Schleife. --- */
    om1: { datei: 'audio/om1.mp3', segmente: [[0.6, 11.0]] },

    /* --- Wassertropfen: nur der Tropfen, ohne Insekten und Hintergrund --- */
    // Die Segmente reichen bewusst über den Aufschlag hinaus: so bleibt das
    // Ausklingen im Wasser hörbar, statt abgeschnitten zu werden.

    /* --- Walgesang --- */
    walN1: { datei: 'audio/walN1.mp3', segmente: [[2.0, 52.0]] },

    /* --- Zug in der Ferne: gleichmäßiges Rollen --- */
    zugN1: { datei: 'audio/zugN1.mp3', segmente: [[1.0, 28.0]] },

    /* --- Nieselregen ohne Stimmen --- */
    niesN1: { datei: 'audio/niesN1.mp3', segmente: [[2.0, 36.0]] },
    niesN2: { datei: 'audio/niesN2.mp3', segmente: [[2.0, 38.0]] },

    /* --- Afrika: echte Morgenatmosphäre plus Perlhühner --- */
    afrika1: { datei: 'audio/afrika1.mp3', segmente: [[1.0, 55.0]] },
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

    /* --- Donner --- */

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
    moewen: ['moewe1', 'moewe2'],
    vogelAfrika: ['afrika1'],
    wal: ['walN1'],
    donner: ['donnN1', 'donnN2'],
    bach: ['bach1', 'bach2'],
    // tropfen braucht seit 2.1 keine Aufnahme mehr - der Tropfen wird erzeugt
    schnarchen: ['schnarchL'],
    bauernhof: ['huhn3', 'kuh1'],
    froesche: ['frosch2'],
    kamin: ['kamin1', 'kamin2', 'feuerknack'],
    schale: ['schale1', 'schale2'],
    glocke: ['glocke1'],
    om: ['om1'],
    wipfel: ['blatt1'],
    wind: ['windN1', 'windN2'],
    fluss: ['flussN1', 'flussN2'],
    zug: ['zugN1'],
    niesel: ['niesN1', 'niesN2'],
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
        // schnelles Ansprechen: ein Tropfen dauert nur gut hundert Millisekunden,
        // mit trägerer Regelung ist er vorbei, bevor die Bremse greift
        k.attack.value = 0.0012;
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

        /* "gleich" schaltet allen Zufall ab: immer dasselbe Segment, dieselbe
         * Geschwindigkeit, dieselbe Lautstärke, dieselbe Position – und der
         * Abstand wird von Anschlag zu Anschlag gemessen statt vom Ende des
         * vorigen. Nur so bleibt der Takt gleich, unabhängig davon, wie lang
         * das Segment ist. Gebraucht für die Kirchturmglocke. */
        var gleich = !!o.gleich;
        if (gleich) naechste = ctx.currentTime + 0.4;
        var offen = [];

        function planen() {
          var horizont = ctx.currentTime + 120;
          var wache = 0;
          while (naechste < horizont && wache++ < 400) {
            var seg = gleich ? probe.segmente[0]
                             : probe.segmente[Math.floor(Math.random() * probe.segmente.length)];
            var r = gleich ? rate[0] : rate[0] + Math.random() * (rate[1] - rate[0]);
            var dauer = seg[1] / r;
            var t = naechste;

            var q = ctx.createBufferSource();
            q.buffer = puffer;
            q.playbackRate.value = r;
            var g = ctx.createGain();
            var lautstaerke = gleich ? 1 : 0.65 + Math.random() * 0.35;
            /* Ein- und Ausblendung. Bei kurzen Rufen reichen Millisekunden,
             * bei Atemzügen und Tropfen nicht: dort hörte man das Einsetzen
             * und das Abschneiden. "weich" verlängert die Blende anteilig an
             * der Länge – ein Atemzug schwillt an und klingt aus. */
            var weich = o.weich === undefined ? 0 : o.weich;
            var an = Math.max(Math.min(0.03, dauer * 0.2), dauer * weich);
            g.gain.setValueAtTime(0.0001, t);
            if (weich) {
              // weiche, gewölbte Kurve statt gerader Rampe
              g.gain.exponentialRampToValueAtTime(lautstaerke, t + an);
              g.gain.setValueAtTime(lautstaerke, t + dauer - an);
              g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
            } else {
              g.gain.linearRampToValueAtTime(lautstaerke, t + an);
              g.gain.setValueAtTime(lautstaerke, t + dauer - an);
              g.gain.linearRampToValueAtTime(0, t + dauer);
            }
            q.connect(g);
            if (stereo && breite && !gleich) {
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
            // gleichbleibender Takt: Abstand von Anschlag zu Anschlag
            naechste = gleich ? t + pause[0]
                              : t + dauer + pause[0] + Math.random() * (pause[1] - pause[0]);
          }
        }
        planen();
        var taktId = setInterval(planen, 30000);
        takte.push(taktId);
        geplante.push(offen);
        return summe;
      },

      /* Dauerhafte Aufnahme als Schleife (Wind, Feuer, Zirpen, Schnurren).
       *
       * Nicht über loop=true: dort springt die Wiedergabe am Segmentende hart
       * auf den Anfang zurück, und weil Ende und Anfang verschieden laut sind,
       * hört man bei jedem Umlauf einen Absatz – beim Wind als harter Einsatz,
       * beim Laub als abrupt einsetzende Böe.
       *
       * Stattdessen überlappen sich zwei Durchläufe und werden ineinander
       * geblendet. Geplant wird wie bei den Rufen weit im Voraus, damit die
       * Wiedergabe unabhängig von gedrosselten Zeitgebern bleibt. */
      schleife: function (o) {
        var probe = PROBEN[o.probe];
        var puffer = puffercache[schluessel(ctx, o.probe)];
        if (!probe || !puffer) return null;
        var seg = probe.segmente[o.segment || 0];

        /* Bei Schleifen verschiebt die Abspielrate auch die Tonhöhe. Wie stark
         * das Tempo mitgehen soll, entscheidet die Kulisse über "tempoAnteil". */
        var anteil = (o.tempoAnteil === undefined) ? 0.45 : o.tempoAnteil;
        var rate = (o.rate || 1) * (1 + (T - 1) * anteil);
        var dauer = seg[1] / rate;
        var blende = Math.min(o.blende || 2.0, dauer * 0.4);

        var summe = api.v(o.pegel === undefined ? 1 : o.pegel);
        var hin = o.an || ziel;      // "an" leitet die Schleife woandershin
        if (stereo && o.pan) {
          var p = api.reg(ctx.createStereoPanner());
          p.pan.value = o.pan;
          summe.connect(p); p.connect(hin);
        } else {
          summe.connect(hin);
        }

        var naechste = ctx.currentTime + 0.05;
        var offen = [];

        function planen() {
          var horizont = ctx.currentTime + 120;
          var wache = 0;
          while (naechste < horizont && wache++ < 200) {
            var t = naechste;
            var q = ctx.createBufferSource();
            q.buffer = puffer;
            q.playbackRate.value = rate;
            var g = ctx.createGain();
            // hinein- und hinausblenden, damit die Nahtstelle verschwindet
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(1, t + blende);
            g.gain.setValueAtTime(1, t + dauer - blende);
            g.gain.linearRampToValueAtTime(0.0001, t + dauer);
            q.connect(g); g.connect(summe);
            q.start(t, seg[0], seg[1]);
            offen.push(q);
            q.onended = function () {
              try { this.disconnect(); } catch (e) { }
              var i = offen.indexOf(this);
              if (i >= 0) offen.splice(i, 1);
            };
            naechste = t + dauer - blende;   // der nächste Durchlauf überlappt
          }
        }
        planen();
        takte.push(setInterval(planen, 30000));
        geplante.push(offen);
        return summe;
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

    /* ---- Fluss (Aufnahmen) ----
     * Synthetisch klang er reißend wie ein Wasserfall. In echten Aufnahmen
     * hört man das Wasser selbst: Wirbel, Gluckern, einzelne Steine. */
    fluss: function (b) {
      var a = b.schleife({ probe: 'flussN1', rate: 0.98, pegel: 0, pan: -0.22, tempoAnteil: 0.2 });
      var c = b.schleife({ probe: 'flussN2', rate: 1.03, pegel: 0, pan: 0.25, tempoAnteil: 0.2 });
      if (!a || !c) return;
      b.atem(a, 2.6, 0.3, 0.4);      // beide Flussaufnahmen sind leise ausgesteuert
      b.atem(c, 2.1, 0.25, 0.6);
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
      /* Eine Bremse über allem: einzelne Blasen platzen sonst deutlich lauter
       * als der Strom dahinter, und der Pegel schwankte von Aufbau zu Aufbau
       * (gemessen: Spitze 0,62 bis 0,89 bei gleichem Ausgleich). */
      var bremse = b.presser(-20, 5);
      b.raus(bremse, 1.0, 0);
      var raum = b.hall(0.07, 0.45, 2200);
      var nass = b.v(0.35);
      raum.aus.connect(nass); nass.connect(bremse);
      // trocken und verhallt laufen beide durch die Bremse
      var misch = b.v(1);
      misch.connect(bremse); misch.connect(raum.ein);
      // drei Quellen mit verschiedenen Tonlagen: die Abspielgeschwindigkeit
      // verschiebt die Blasengröße mit.
      // stetig statt vereinzelt: kurze Pausen, drei Quellen überlappend
      b.rufe({ probe: 'blasen1', pegel: 0.75, pause: [0.04, 0.22], rate: [0.9, 1.15],
               breite: 0.8, ziel: misch, start: 1, roh: true });
      b.rufe({ probe: 'blasen2', pegel: 0.60, pause: [0.08, 0.4], rate: [0.75, 1.0],
               breite: 0.7, ziel: misch, start: 2, roh: true });   // größere, tiefere Blasen
      b.rufe({ probe: 'blasen3', pegel: 0.55, pause: [0.06, 0.3], rate: [1.0, 1.3],
               breite: 0.85, ziel: misch, start: 3, roh: true });  // feine, hohe Bläschen
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

    /* ---- Wind (Aufnahmen) ----
     * Synthetisch war es ein gleichmäßiger Rauschteppich – echter Wind pfeift,
     * kommt in Böen und hat Struktur. Zwei Aufnahmen driften auseinander. */
    wind: function (b) {
      var a = b.schleife({ probe: 'windN1', rate: 0.98, pegel: 0, pan: -0.2, tempoAnteil: 0.2 });
      var c = b.schleife({ probe: 'windN2', rate: 1.03, pegel: 0, pan: 0.24, tempoAnteil: 0.2 });
      if (!a || !c) return;
      b.atem(a, 2.1, 0.5, 0.5);      // Windaufnahmen ebenfalls leise
      b.atem(c, 1.1, 0.45, 0.8);
      // etwas synthetisches Tieffrequentes darunter gibt Fülle
      var basis = b.kette(b.rausch(true), b.tief(90, 1.0));
      b.atem(b.raus(basis, 0.2, 0), 0.2, 0.08, 0.4);
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
      /* Deutlich kürzere Abstände als zuvor: Donner soll rollen, nicht
       * einzeln zucken. Mit langen Pausen entstand der Eindruck von Flackern,
       * weil jeder Schlag für sich stand statt in ein Grollen überzugehen.
       * Die Tiefpässe sind offen, damit es klar bleibt statt dumpf. */
      ferne('donnN1', 0.95, [3, 12], 1100, 2, 0.4);
      ferne('donnN2', 0.85, [5, 18], 900, 8, 0.35);
      ferne('donnN1', 0.55, [8, 26], 500, 16, 0.25);   // fernere Lage darunter

      // ganz tiefes Nachrollen, synthetisch: verlängert die Aufnahmen nach unten
      var sub = b.kette(b.rausch(true), b.tief(55, 1.4));
      var tor3 = b.v(0);
      sub.connect(tor3);
      b.mod(tor3.gain, b.selten(0.9, 0.60, 3.0), 1.0);
      b.raus(tor3, 0.4, 0);
    },

    /* ---- Baumwipfel-Rascheln (Aufnahme) ----
     * Aus Rauschimpulsen gebaut blieb es ein monotoner Teppich: echtes Laub
     * raschelt in Böen, mit einzelnen Blättern und Zweigen dazwischen.
     * Drei Stimmen derselben Aufnahme in verschiedenen Geschwindigkeiten und
     * mit eigenem Atem machen daraus eine ganze Krone. */
    wipfel: function (b) {
      var lagen = [
        { rate: 0.95, pan: -0.35, mitte: 0.85, tiefe: 0.35, tempo: 0.6 },
        { rate: 1.06, pan: 0.32, mitte: 0.55, tiefe: 0.30, tempo: 0.9 },
        { rate: 1.19, pan: 0.05, mitte: 0.35, tiefe: 0.22, tempo: 1.4 }
      ];
      for (var i = 0; i < lagen.length; i++) {
        var l = lagen[i];
        var g = b.schleife({ probe: 'blatt1', rate: l.rate, pegel: 0, pan: l.pan,
                             tempoAnteil: 0.3 });
        if (!g) return;
        b.atem(g, l.mitte, l.tiefe, l.tempo);
      }
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
      /* Ohne Hall, und mit einem Hochpass gegen das Grundrauschen der
       * Feldaufnahmen: Vogelrufe liegen über 1 kHz, das mitgeschnittene
       * Rauschen vor allem darunter. Ein Hochpass bei 900 Hz nimmt es weg,
       * ohne die Rufe anzutasten – vorher lag hinter den Vögeln ein Zischen. */
      var sauber = b.kette(b.hoch(900, 0.7), b.hoch(700, 0.5));
      b.raus(sauber, 1.0, 0);
      function stimme(o) {
        o.roh = true;
        var k = b.rufe(o);
        if (k) k.connect(sauber);
      }
      stimme({ probe: 'amsel', pegel: 0.80, pause: [3, 11], rate: [0.95, 1.05],
               breite: 0.75, start: 3 });
      stimme({ probe: 'gartenvoegel', pegel: 0.55, pause: [2.5, 9], rate: [0.93, 1.08],
               breite: 0.8, start: 6 });
      stimme({ probe: 'rotkehlchen', pegel: 0.55, pause: [3, 12], rate: [0.96, 1.06],
               breite: 0.7, start: 9 });
      stimme({ probe: 'buchfink', pegel: 0.50, pause: [2, 8], rate: [0.94, 1.06],
               breite: 0.75, start: 5 });
      stimme({ probe: 'meise', pegel: 0.45, pause: [4, 14], rate: [0.96, 1.05],
               breite: 0.7, start: 13 });
      stimme({ probe: 'grasmuecke', pegel: 0.50, pause: [3, 11], rate: [0.95, 1.06],
               breite: 0.65, start: 17 });
    },

    /* ---- Möwen (Aufnahmen) ----
     * Die Hafenatmosphäre läuft als Schleife, darüber einzelne Rufe – so
     * klingt es nach Hafen und nicht nach aneinandergereihten Schreien. */
    moewen: function (b) {
      var hafen = b.schleife({ probe: 'moewe2', rate: 1.0, pegel: 0, pan: 0, tempoAnteil: 0.25 });
      if (!hafen) return;
      b.atem(hafen, 0.9, 0.15, 0.4);
      b.rufe({ probe: 'moewe1', pegel: 0.75, pause: [0.6, 4], rate: [0.94, 1.08],
               breite: 0.85, start: 1 });
      b.rufe({ probe: 'moewe1', pegel: 0.40, pause: [2, 8], rate: [0.82, 0.94],
               breite: 0.6, start: 4 });     // entferntere Möwen
    },

    /* ---- Nieselregen (Aufnahmen) ----
     * Kein geschlossenes Rauschen: die einzelnen Tropfen bleiben hörbar.
     * Zwei leise Schleifen tragen den Grund, darüber einzelne Aufschläge. */
    niesel: function (b) {
      /* Regen auf Laub und tropfendes Schmelzwasser: die einzelnen Aufschläge
       * bleiben hörbar, ohne dass es ein geschlossenes Rauschen wird.
       * Die vorigen Aufnahmen enthielten Menschenstimmen. */
      var a = b.schleife({ probe: 'niesN1', rate: 0.98, pegel: 0, pan: -0.22,
                           tempoAnteil: 0.25, blende: 3 });
      var c = b.schleife({ probe: 'niesN2', rate: 1.03, pegel: 0, pan: 0.24,
                           tempoAnteil: 0.25, blende: 3 });
      if (!a || !c) return;
      b.atem(a, 0.85, 0.12, 0.4);
      b.atem(c, 0.7, 0.10, 0.6);
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
      // Die Perlhühner sind entfernt: ihr Ruf stach hupend und penetrant
      // aus der Morgenatmosphäre heraus.
    },

    /* ---- Walgesang (Aufnahmen) ----
     * Walgesang ist ein Dauerklang, kein Nacheinander einzelner Rufe – als
     * geschnittene Einzelstücke klang er zerhackt. Zwei Schleifen mit leicht
     * verschiedener Geschwindigkeit driften auseinander, der Nachhall setzt
     * das Ganze in die Tiefe. */
    wal: function (b) {
      /* Eine Aufnahme unter Wasser statt zusammengesetzter Rufe: in der alten
       * Fassung klangen einzelne Laute fast menschlich. Zwei Durchläufe
       * derselben Aufnahme in verschiedenen Geschwindigkeiten geben Tiefe. */
      var tiefe = b.hall(0.42, 0.45, 700);
      b.raus(tiefe.aus, 0.16, 0);
      var a = b.schleife({ probe: 'walN1', rate: 0.97, pegel: 0, pan: -0.2,
                           tempoAnteil: 0.3, blende: 4 });
      var c = b.schleife({ probe: 'walN1', rate: 0.71, pegel: 0, pan: 0.24,
                           tempoAnteil: 0.3, blende: 5 });   // tiefer, langsamer
      if (!a || !c) return;
      b.atem(a, 0.34, 0.08, 0.3);
      b.atem(c, 0.19, 0.06, 0.22);
      a.connect(tiefe.ein);
      c.connect(tiefe.ein);
    },

    /* ---- Delfingesang (Aufnahmen) ---- */
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
      // Ohne Hall und ohne Höhle: nur der Tropfen selbst. Die Spitzenbremse
      // bleibt, weil einzelne Tropfen sehr laut gegen die Stille stehen.
      /* Sanft geregelt: mit hohem Verhältnis und tiefer Schwelle klang der
       * Nachklang der Tropfen blechern, weil die Regelung ihn nachpumpte. */
      var hall = b.hall(0.21, 0.42, 4200);
      b.raus(hall.aus, 0.3, 0);
      /* Die Tropfen entstehen hier, statt aus einer Aufnahme zu kommen.
       * Ein Wassertropfen ist genau das, was Beatboxer nachmachen: ein kurzer
       * Ton, dessen Tonhöhe beim Eintauchen schnell nach oben schnellt, mit
       * weichem Ausklang. Als Klangnetz gebaut lässt sich das gleichmäßig
       * halten – aus Aufnahmen geschnitten blieb es abgehackt und blechern. */
      var takte = [1.05, 1.55, 2.35];        // drei ruhige, leicht versetzte Tropfraten
      var lagen = [
        { f: 620, ziel: 1500, pegel: 0.55, pan: -0.3, ton: 0.34 },
        { f: 430, ziel: 1050, pegel: 0.42, pan: 0.28, ton: 0.42 },
        { f: 820, ziel: 2050, pegel: 0.30, pan: 0.05, ton: 0.28 }
      ];
      for (var i = 0; i < lagen.length; i++) {
        var l = lagen[i];
        var o = b.sinus(l.f, 'sine');
        // Der Tropfen: die Tonhöhe steigt beim Eintauchen steil an
        var huelle = b.takt(1 / takte[i], 0.14, 0.55);   // takt() rechnet das Tempo mit
        o.frequency.value = l.f;
        b.mod(o.frequency, huelle, l.ziel - l.f);

        var tor = b.v(0);
        o.connect(tor);
        b.mod(tor.gain, huelle, l.pegel);
        // etwas Körper: eine Oktave darunter, leiser
        var tief = b.sinus(l.f * 0.5, 'sine');
        var tTor = b.v(0);
        tief.connect(tTor);
        b.mod(tTor.gain, huelle, l.pegel * 0.35);

        var misch = b.v(1);
        tor.connect(misch); tTor.connect(misch);
        var weich = b.kette(misch, b.tief(3200, 0.8));
        b.raus(weich, 1.0, l.pan);
        weich.connect(hall.ein);
      }
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
    /* ---- Bauernhof (Aufnahmen) ----
     * Der Hühnerhof trägt als Schleife, Kühe und Schafe rufen gelegentlich
     * dazwischen – so klingt es nach Hof und nicht nach Streichelzoo. */
    bauernhof: function (b) {
      /* Nur Hennen und Kühe – und beides dumpf.
       * Der Hahn steckte in der Aufnahme selbst, nicht im Klangweg: huhn2
       * hatte im Band 1,2–3 kHz Spitzen von 0,07 bis 0,11 gegen einen
       * Grundwert von 0,005, also mehrere Hahnenschreie. Wegzufiltern war das
       * nicht, ohne das Gackern mitzunehmen. Deshalb eine andere Aufnahme.
       *
       * Beide Schichten laufen durch eine gemeinsame Bremse: das Muhen war
       * sonst um ein Vielfaches lauter als der Hof dahinter (gemessen: Spitze
       * 3,9 bei RMS 0,10), und der Ausgleich hätte alles unhörbar gemacht. */
      var bremse = b.presser(-24, 6);
      b.raus(bremse, 1.0, 0);
      // Achtung: kette() gibt das LETZTE Glied zurueck. Der Eingang der Kette
      // ist der Tiefpass – der muss separat gehalten werden, sonst haengt die
      // Schleife am Hochpass und der Tiefpass ist wirkungslos.
      var tief = b.tief(1100, 0.7);       // dumpf: nur der Körper des Gackerns
      var sanft = b.kette(tief, b.hoch(160, 0.6));
      sanft.connect(bremse);
      var hof = b.schleife({ probe: 'huhn3', rate: 1.0, pegel: 0, pan: 0,
                             tempoAnteil: 0.25, blende: 2.5, an: tief });
      if (!hof) return;
      b.atem(hof, 1.5, 0.12, 0.4);
      // Auch die Kühe dumpf: der Tiefpass nimmt dem Muhen das Blöken
      var muh = b.tief(900, 0.7);
      muh.connect(bremse);
      b.rufe({ probe: 'kuh1', pegel: 0.5, pause: [7, 22], rate: [0.95, 1.05],
               breite: 0.6, start: 4, weich: 0.15, roh: true, ziel: muh });
    },

    /* ---- Frösche am Teich (Aufnahme) ----
     * Nur die tiefe Lage, eine Schleife, eine Geschwindigkeit.
     * Vorher lagen zwei Aufnahmen mit verschiedener Rate übereinander; die
     * obere (Laubfrösche) brachte das hohe Quaken mit – 82 % ihrer Energie
     * lagen über 1,2 kHz, und ihre Sekundenpegel sprangen um den Faktor 50.
     * Ein Tiefpass nimmt der verbliebenen Aufnahme die restlichen Höhen. */
    froesche: function (b) {
      var bremse = b.presser(-24, 6);
      b.raus(bremse, 1.0, 0);
      /* Zwei Tiefpässe in Reihe, nicht einer. Ein einzelner Biquad fällt mit
       * 12 dB je Oktave – bei 2 kHz sind das erst -13 dB, und in frosch2
       * sitzen dort 45 % der Energie gegen 31 % im Durchlassbereich. Gemessen
       * blieben mit einem Filter 72 % über 1 kHz stehen, das hohe Quaken war
       * also noch da. Zwei Filter machen 24 dB je Oktave daraus. */
      var t1 = b.tief(850, 0.6);
      var kanal = b.kette(t1, b.tief(850, 0.6), b.hoch(140, 0.6));
      kanal.connect(bremse);
      var teich = b.schleife({ probe: 'frosch2', rate: 1.0, pegel: 0, pan: 0,
                               tempoAnteil: 0.25, blende: 4, an: t1 });
      if (!teich) return;
      b.atem(teich, 2.6, 0.08, 0.3);   // kaum Schwankung: gleichförmig
    },

    /* ---- Kaminfeuer (Aufnahmen) ----
     * Ruhiger als das Lagerfeuer: geschlossener Ofen, gleichmäßiges Brennen,
     * nur ab und zu ein Knacken. */
    kamin: function (b) {
      var bremse = b.presser(-22, 6);
      b.raus(bremse, 1.0, 0);
      var a = b.schleife({ probe: 'kamin1', rate: 0.98, pegel: 0, pan: -0.15,
                           tempoAnteil: 0.12, an: bremse, blende: 3 });
      var c = b.schleife({ probe: 'kamin2', rate: 1.03, pegel: 0, pan: 0.18,
                           tempoAnteil: 0.12, an: bremse, blende: 3 });
      if (!a || !c) return;
      b.atem(a, 0.72, 0.12, 0.5);
      b.atem(c, 0.45, 0.10, 0.8);
      var k = b.rufe({ probe: 'feuerknack', pegel: 0.45, pause: [1.5, 7], rate: [0.9, 1.1],
                       breite: 0.6, start: 2, roh: true });
      if (k) k.connect(bremse);
    },

    /* ---- Klangschale (Aufnahme) ----
     * Der Ton steht und schwingt aus; zwei Durchläufe in verschiedenen
     * Tonlagen überlagern sich zu einem ruhigen Klangfeld. */
    schale: function (b) {
      var raum = b.hall(0.28, 0.5, 5000);
      b.raus(raum.aus, 0.4, 0);
      var a = b.schleife({ probe: 'schale1', rate: 1.0, pegel: 0, pan: -0.15,
                           tempoAnteil: 0.2, blende: 6 });
      var c = b.schleife({ probe: 'schale2', rate: 0.75, pegel: 0, pan: 0.2,
                           tempoAnteil: 0.2, blende: 5 });
      if (!a || !c) return;
      b.atem(a, 0.20, 0.05, 0.25);
      b.atem(c, 0.12, 0.04, 0.18);
      a.connect(raum.ein);
      c.connect(raum.ein);
    },

    /* ---- Kirchturmglocke (Aufnahme) ----
     * Absolut gleichbleibend: ein einziger Anschlag, in festem Abstand
     * wiederholt. Dafür ist "gleich" da – es schaltet in rufe() jeden Zufall
     * ab (Segment, Geschwindigkeit, Lautstärke, Stereoposition) und misst den
     * Abstand von Anschlag zu Anschlag statt vom Ende des vorigen.
     * Vorher lagen fünf Segmente à 5 s vor, die sich überlappten und zufällig
     * gewählt wurden: dadurch klang jeder Schlag anders und der Takt wackelte. */
    glocke: function (b) {
      var weite = b.hall(0.34, 0.55, 1800);
      b.raus(weite.aus, 0.5, 0);
      var s = b.rufe({ probe: 'glocke1', pegel: 0.85, pause: [5.2, 5.2],
                       rate: [1, 1], breite: 0, start: 1, roh: true,
                       weich: 0, gleich: true });
      if (!s) return;
      var fern = b.kette(s, b.tief(2400, 0.7));
      b.raus(fern, 1.0, 0);
      fern.connect(weite.ein);
    },

    /* ---- OM (Aufnahme) ----
     * Gesungen, nicht erzeugt. Die synthetische Fassung war messbar
     * gleichmäßig (Streuung 0,01), klang aber nach Orgel statt nach Stimme –
     * eine menschliche Stimme lebt von Dingen, die sich nicht nachbilden
     * lassen: Formantbewegung, Rauheit, Atem.
     *
     * Aus der Aufnahme läuft nur der stehende Teil (Sekunde 0,6 bis 11,6, dort
     * liegt der Pegel zwischen 0,084 und 0,123); danach klingt der Gesang aus.
     * Die Bremse hält den Rest still, damit wirklich nichts schwankt. */
    om: function (b) {
      var bremse = b.presser(-26, 6);
      b.raus(bremse, 1.0, 0);
      var raum = b.hall(0.34, 0.45, 2400);
      var nass = b.v(0.3);
      raum.aus.connect(nass); nass.connect(bremse);
      /* tempoAnteil klein: bei einer gesungenen Note verschiebt die
       * Abspielrate die Tonhöhe, und ein OM soll auf allen Stufen ein OM
       * bleiben. Die Stufen ändern hier also fast nichts – das ist Absicht. */
      var stimme = b.schleife({ probe: 'om1', rate: 1.0, pegel: 0, pan: 0,
                                tempoAnteil: 0.08, blende: 3.5, an: bremse });
      if (!stimme) return;
      stimme.connect(raum.ein);
      b.atem(stimme, 1.0, 0.03, 0.15);   // praktisch keine Bewegung
    },

    /* ================= Synth ================= */

    /* Drei ruhige Klangflächen. Hier ist die Synthese im Element: keine
     * Aufnahme, keine Wiederholung, und die Töne schweben endlos gegeneinander,
     * weil ihre Steuerkurven nicht zueinander passen. */

    /* ---- Warmes Pad: Grundton, Quinte und Oktave ---- */
    synthWarm: function (b) {
      var raum = b.hall(0.33, 0.55, 3000);
      b.raus(raum.aus, 0.5, 0);
      // A-Dur-artig: 110, 165 (Quinte), 220 (Oktave), 275 (Terz darüber)
      [[110, -0.4, 0.9, 0.5], [165, 0.35, 0.65, 0.7],
       [220, -0.15, 0.5, 0.9], [275, 0.2, 0.28, 1.2]].forEach(function (s) {
        var o = b.sinus(0, 'sine');
        o.frequency.value = 0;
        // ganz leichtes Schweben um den Ton herum
        b.mod(o.frequency, b.steuer(s[0], s[0] * 0.004, 0.6));
        var farbe = b.kette(o, b.tief(1200, 0.7));
        var g = b.raus(farbe, 0, s[1]);
        b.atem(g, s[2] * 0.012, s[2] * 0.006, s[3]);
        g.connect(raum.ein);          // NACH dem Pegel: sonst speist der volle Ton den Hall
      });
    },

    /* ---- Tiefer Drone ---- */
    synthTief: function (b) {
      var raum = b.hall(0.4, 0.5, 900);
      b.raus(raum.aus, 0.45, 0);
      [[55, -0.3, 1.0, 0.3], [82.5, 0.25, 0.6, 0.45], [110, 0, 0.35, 0.6]].forEach(function (s) {
        var o = b.sinus(0, 'sine');
        o.frequency.value = 0;
        b.mod(o.frequency, b.steuer(s[0], s[0] * 0.003, 0.4));
        var farbe = b.kette(o, b.flt('peaking', s[0] * 3, 1.2), b.tief(600, 0.8));
        var g = b.raus(farbe, 0, s[1]);
        b.atem(g, s[2] * 0.016, s[2] * 0.006, s[3]);
        g.connect(raum.ein);          // NACH dem Pegel: sonst speist der volle Ton den Hall
      });
      // ein Hauch Rauschen gibt dem Drone Körper
      var luft = b.kette(b.rausch(true), b.tief(160, 1.0));
      b.atem(b.raus(luft, 0.12, 0), 0.12, 0.05, 0.35);
    },

    /* ---- Glitzern: sparsame hohe Töne mit langem Nachklang ---- */
    synthGlitzer: function (b) {
      /* Deutlich zurückgenommen: eine Oktave tiefer, ein Tiefpass gegen die
       * spitzen Höhen und weichere Anschläge. Vorher stachen einzelne Töne
       * scharf heraus.
       *
       * Die Schwelle war außerdem so hoch (0,62 bei Exponent 4), dass die Töne
       * mal gar nicht und mal alle zugleich aufblühten: gemessen schwankte der
       * Pegel zwischen RMS 0,011 und 0,147, je nachdem, wie die Zufallstempi
       * gerade fielen. Jetzt schwellen sie flach und regelmäßig an. */
      var raum = b.hall(0.42, 0.6, 4200);
      b.raus(raum.aus, 0.5, 0);
      // Achtung: kette() gibt das LETZTE Glied zurueck – der Eingang muss
      // separat gehalten werden, sonst haengt alles am Hochpass.
      var tief = b.tief(2400, 0.6);
      var daempfer = b.kette(tief, b.hoch(280, 0.5));
      b.raus(daempfer, 1.0, 0);
      var toene = [440, 523, 659, 784, 880, 1046];   // Pentatonik
      for (var i = 0; i < 4; i++) {
        var f = toene[Math.floor(Math.random() * toene.length)];
        var o = b.sinus(f, 'sine');
        var tor = b.v(0);
        o.connect(tor);
        b.mod(tor.gain, b.selten(0.3 + Math.random() * 0.3, 0.45, 3.0), 0.24);
        tor.connect(tief);
        tor.connect(raum.ein);
      }
    },


    /* ---- Schwebung: zwei fast gleiche Töne, die langsam gegeneinander laufen ---- */
    synthSchweb: function (b) {
      var raum = b.hall(0.36, 0.5, 2500);
      b.raus(raum.aus, 0.4, 0);
      [[146.83, 0.6], [147.6, 0.6], [220.0, 0.4], [220.9, 0.4]].forEach(function (s, i) {
        var o = b.sinus(0, 'sine');
        o.frequency.value = 0;
        b.mod(o.frequency, b.steuer(s[0], s[0] * 0.002, 0.35));
        var farbe = b.kette(o, b.tief(900, 0.7));
        var g = b.raus(farbe, 0, i % 2 ? 0.4 : -0.4);
        b.atem(g, s[1] * 0.015, s[1] * 0.005, 0.3 + i * 0.1);
        g.connect(raum.ein);          // NACH dem Pegel: sonst speist der volle Ton den Hall
      });
    },

    schnarchen: function (b) {
      /* Als Schleife statt als einzelne Atemzüge: nur so bleibt der ganze
       * Zyklus aus Ein- und Ausatmen erhalten. Aus geschnittenen Einzelzügen
       * wurde immer ein Ein- und Ausschalten, egal wie weich die Blende war.
       *
       * Die Bremse ist hier das eigentliche Werkzeug gegen das Grunzen: roh
       * steht eine Spitze von 0,96 gegen einen Mittelwert von 0,047 – die
       * lauten Stellen sind zwanzigmal so laut wie der ruhige Atem dazwischen.
       * Mit der Bremse rückt beides zusammen, das Atmen wird gleichmäßig. */
      var bremse = b.presser(-30, 5);
      var weich = b.tief(2000, 0.6);   // nimmt dem Schnarchen die Rasselschärfe
      weich.connect(bremse);
      b.raus(bremse, 1.0, -0.08);
      var a = b.schleife({ probe: 'schnarchL', rate: 0.86, pegel: 0, pan: 0,
                           tempoAnteil: 0.25, blende: 6, an: weich });
      if (!a) return;
      b.atem(a, 7.5, 0.12, 0.2);   // kaum Schwankung: ruhiger, gleichmaessiger Atem
    },

    /* ================= Menschenwelt ================= */

    /* ---- Zug in der Ferne (Aufnahme) ----
     * Synthetisch war es ein Bastelwerk aus Takten und Hornsignalen. Eine
     * echte Aufnahme rollt gleichmäßig, ohne Beiwerk – genau das, was eine
     * Hintergrundkulisse braucht. */
    zug: function (b) {
      var weite = b.hall(0.26, 0.5, 900);
      b.raus(weite.aus, 0.35, 0);
      var a = b.schleife({ probe: 'zugN1', rate: 0.99, pegel: 0, pan: -0.15,
                           tempoAnteil: 0.25, blende: 3 });
      if (!a) return;
      b.atem(a, 0.75, 0.06, 0.3);
      a.connect(weite.ein);

      /* Die Schienenstöße kommen aus dem Klangnetz, nicht aus der Aufnahme:
       * In keiner der gefundenen Aufnahmen war das typische Tuck-Tuck klar
       * genug. Synthetisch ist der Takt exakt – und genau das macht den Zug
       * aus. Zwei Schläge kurz nacheinander, weil ein Drehgestell zwei Achsen
       * hat, dann eine Pause bis zum nächsten Wagen. */
      var stoss = b.v(0);
      b.rausch().connect(stoss);
      b.takt(1.35, 0.16, 1.8).connect(stoss.gain);
      var st = b.kette(stoss, b.band(380, 2.4), b.tief(850, 0.9));
      b.raus(st, 0.85, -0.18);
      st.connect(weite.ein);

      var stoss2 = b.v(0);
      b.rausch().connect(stoss2);
      var versetzt = b.verz(0.21);         // zweite Achse, gut zwei Zehntel später
      b.takt(1.35, 0.16, 1.8).connect(versetzt);
      versetzt.connect(stoss2.gain);
      b.raus(b.kette(stoss2, b.band(330, 2.6), b.tief(760, 0.9)), 0.6, 0.2);
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
    regen: 0.82, niesel: 1.08, strand: 1.22, fluss: 1.73, unterwasser: 1.10, blasen: 1.25,
    bach: 1.76, tropfen: 0.55, moewen: 1.08,
    feuer: 0.89,
    wind: 2.09, donner: 0.78, wipfel: 2.02,
    grillen: 2.60, vogelDe: 1.45, vogelAfrika: 2.33,
    wal: 1.14, katze: 1.46, bauernhof: 0.76, kamin: 1.14, froesche: 1.80,
    schnarchen: 0.98, zug: 1.20, strasse: 1.75,
    schale: 0.94, glocke: 1.15, om: 0.52,
    synthWarm: 9.18, synthTief: 3.14, synthGlitzer: 3.00, synthSchweb: 7.96,
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
