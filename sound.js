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
 */
const Klang = (function () {
  'use strict';

  var PUFFER_S = 20;   // Länge der Rauschpuffer in Sekunden
  var puffer = [];     // [{ctx, weiss, braun}] – je Kontext einmal erzeugt

  function pufferFuer(ctx) {
    for (var i = 0; i < puffer.length; i++) if (puffer[i].ctx === ctx) return puffer[i];
    var len = Math.floor(ctx.sampleRate * PUFFER_S);

    var weiss = ctx.createBuffer(1, len, ctx.sampleRate);
    var w = weiss.getChannelData(0);
    for (var j = 0; j < len; j++) w[j] = Math.random() * 2 - 1;

    // braunes Rauschen: integriertes weißes Rauschen, tiefenbetont
    var braun = ctx.createBuffer(1, len, ctx.sampleRate);
    var b = braun.getChannelData(0);
    var letzt = 0;
    for (var k = 0; k < len; k++) {
      letzt = (letzt + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[k] = Math.max(-1, Math.min(1, letzt * 3.4));
    }
    // Nahtstelle glätten, damit der Loop nicht knackt
    var blend = Math.floor(ctx.sampleRate * 0.05);
    for (var m = 0; m < blend; m++) {
      var f = m / blend;
      b[m] = b[m] * f + b[len - blend + m] * (1 - f);
    }

    var eintrag = { ctx: ctx, weiss: weiss, braun: braun };
    puffer.push(eintrag);
    return eintrag;
  }

  /* ------------------------------------------------------------------
   * Bauer: kleine Werkzeugkiste, die jede Kulisse benutzt.
   * Merkt sich alle erzeugten Knoten, damit sie sauber abgebaut werden.
   * ------------------------------------------------------------------ */
  function bauer(ziel, opt) {
    opt = opt || {};
    var ctx = ziel.context;
    var P = pufferFuer(ctx);
    var teile = [];
    var stereo = opt.stereo !== false && !!ctx.createStereoPanner;

    var api = {
      ctx: ctx,
      ziel: ziel,

      reg: function (n) { teile.push(n); return n; },

      /* --- Quellen --- */

      // Rauschen. Zufälliger Einstiegspunkt und leicht verstimmte Abspielrate:
      // dadurch laufen mehrere Quellen nie synchron und der 20-s-Puffer bleibt unhörbar.
      rausch: function (braun, rate) {
        var s = ctx.createBufferSource();
        s.buffer = braun ? P.braun : P.weiss;
        s.loop = true;
        s.playbackRate.value = rate || (0.91 + Math.random() * 0.18);
        s.start(ctx.currentTime, Math.random() * (PUFFER_S - 1));
        return api.reg(s);
      },

      sinus: function (f) {
        var o = ctx.createOscillator();
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
        var t = tempo || 1;
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

      // Anregungsimpulse: tiefpassgefiltertes Rauschen über eine hohe Schwelle.
      // Ergibt kurze, unregelmäßige Böen – die Bandbreite bestimmt die Rate.
      // Die Amplitude hinter dem Tiefpass hängt von der Abtastrate ab –
      // ohne diesen Ausgleich knisterte es auf einem 44,1-kHz-Gerät anders
      // als auf einem mit 48 kHz.
      funken: function (bw, verst, schw) {
        var norm = Math.sqrt(ctx.sampleRate / 48000);
        return api.kette(api.rausch(), api.tief(bw, 0.7), api.v(verst * norm), api.schwelle(schw, 1));
      },

      // Knistern/Tropfen: Rauschen, das von Funken aufgetort und dann
      // durch einen resonanten Bandpass geschickt wird.
      knister: function (bw, verst, schw, f, q) {
        var tor = api.v(0);
        api.rausch().connect(tor);
        api.funken(bw, verst, schw).connect(tor.gain);
        return api.kette(tor, api.band(f, q));
      },

      // Ein schlichter Nachhall aus drei rückgekoppelten Verzögerungen.
      hall: function (zeit, fb, daempf) {
        var ein = api.v(1), aus = api.v(1);
        var zeiten = [zeit, zeit * 1.37, zeit * 1.83];
        for (var i = 0; i < zeiten.length; i++) {
          var d = api.verz(zeiten[i]);
          var lp = api.tief(daempf || 2200);
          var g = api.v(fb);
          ein.connect(d);
          d.connect(lp); lp.connect(g); g.connect(d);   // Rückkopplung
          d.connect(aus);
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

      abbau: function () {
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

  // Regenschichten, von beiden Regen-Kulissen benutzt.
  function regenSchichten(b, hell) {
    // Prasselteppich – das breite Grundgeräusch
    var teppich = b.kette(b.rausch(), b.hoch(360, 0.7), b.tief(hell ? 6200 : 3400, 0.6));
    b.atem(b.raus(teppich, 0.30, -0.18), 0.30, 0.075, 0.5);

    // feines Zischeln obenauf
    var fein = b.kette(b.rausch(), b.hoch(hell ? 3200 : 2200, 0.6));
    b.atem(b.raus(fein, 0.11, 0.26), 0.11, 0.055, 0.9);

    // Körper: der Regen als dumpfes Rauschen dahinter
    var koerper = b.kette(b.rausch(true), b.tief(420, 0.8), b.hoch(90));
    b.atem(b.raus(koerper, 0.26, 0), 0.26, 0.06, 0.35);

    // Tropfen auf Blech/Fensterbank. Die Bandbreite im Impulstor bestimmt,
    // wie dicht die Tropfen fallen – die Schwelle, wie laut sie herausstechen.
    // Breit gewählt ergibt das ein dichtes Prasseln.
    var tropfen = b.knister(2200, 5.0, 0.60, 1500, 9);
    b.raus(tropfen, 0.55, 0.32);

    // Einzelne dicke Tropfen. Schmalbandige Impulstore öffnen selten und
    // liefern daher wenig Energie – der hohe Pegel ist gemessen, nicht geraten.
    var dick = b.knister(140, 5.6, 0.54, 780, 14);
    b.raus(dick, 2.2, -0.38);
  }

  var SZENEN = {

    /* ---- Regen ---- */
    regen: function (b) {
      regenSchichten(b, true);
    },

    /* ---- Regen mit fernem Donnergrollen ---- */
    gewitter: function (b) {
      regenSchichten(b, false);

      // fernes Grollen: tiefes Rauschen, das nur bei seltenen Ereignissen durchkommt
      // Die Steuerkurve muss vergleichsweise flott laufen: sie wird hoch
      // geschwellt, damit nur die Spitzen durchkommen. Zu langsam gewählt
      // wird daraus ein minutenlanges Anschwellen statt eines Grollens.
      var rumpeln = b.kette(b.rausch(true), b.tief(140, 1.2));
      var tor = b.v(0);
      rumpeln.connect(tor);
      b.mod(tor.gain, b.selten(1.5, 0.58, 2.6), 2.2);

      var weite = b.hall(0.21, 0.62, 700);
      tor.connect(weite.ein);
      b.raus(weite.aus, 1.0, 0);
      b.raus(tor, 0.8, 0);

      // zweite, seltenere Lage mit etwas mehr Kante – das "Krachen" weit weg
      var kante = b.kette(b.rausch(true), b.band(310, 0.9));
      var tor2 = b.v(0);
      kante.connect(tor2);
      b.mod(tor2.gain, b.selten(1.1, 0.70, 3.2), 2.0);
      tor2.connect(weite.ein);
      b.raus(tor2, 0.45, 0.15);
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
      bg.gain.value = 0.05;          // Grundpegel zwischen den Wellen
      b.mod(bg.gain, welle, 0.85);   // Kamm deutlich darüber

      // auslaufende Gischt, gut eine Sekunde nach dem Kamm
      var spaet = b.verz(1.15);
      welle.connect(spaet);
      var gischt = b.kette(b.rausch(), b.hoch(2600, 0.6));
      var gg = b.raus(gischt, 0, 0.3);
      gg.gain.value = 0.012;
      b.mod(gg.gain, spaet, 0.42);

      // zurücklaufendes Wasser über Kies
      var kies = b.knister(900, 4.2, 0.58, 3600, 3.5);
      var kg = b.raus(kies, 0, 0.18);
      kg.gain.value = 0.015;
      b.mod(kg.gain, spaet, 0.45);

      // Meeresgrundrauschen, immer da – bewusst zurückhaltend, sonst
      // deckt es das Auf und Ab der Wellen zu
      var grund = b.kette(b.rausch(true), b.tief(240, 0.9));
      b.atem(b.raus(grund, 0.17, 0), 0.17, 0.06, 0.3);

      // ferne Brandung, breit und leise
      var fern = b.kette(b.rausch(), b.band(950, 0.4));
      b.atem(b.raus(fern, 0.06, 0.45), 0.06, 0.035, 0.8);
    },

    /* ---- Fluss (über Wasser) ---- */
    fluss: function (b) {
      // breites Plätschern
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

      // Spritzer und Höhen
      var hoehen = b.kette(b.rausch(), b.hoch(4200, 0.7));
      b.atem(b.raus(hoehen, 0.07, 0.35), 0.07, 0.035, 1.2);

      // Gluckern zwischen den Steinen
      var gluck = b.knister(420, 5.0, 0.52, 640, 16);
      b.raus(gluck, 2.5, -0.3);

      // der Strom selbst, tief darunter
      var strom = b.kette(b.rausch(true), b.tief(300, 0.9));
      b.raus(strom, 0.2, 0);
    },

    /* ---- Fluss (unter Wasser) ---- */
    unterwasser: function (b) {
      var raum = b.hall(0.09, 0.55, 500);
      b.raus(raum.aus, 0.32, 0);

      // Druck: alles ist dumpf und tief
      var druck = b.kette(b.rausch(true), b.tief(130, 1.5));
      b.atem(b.raus(druck, 0.28, 0), 0.28, 0.06, 0.4);

      // Strömung am Ohr
      var stroem = b.kette(b.rausch(), b.tief(460, 2.4), b.hoch(80));
      var sg = b.raus(stroem, 0.17, -0.15);
      b.atem(sg, 0.17, 0.06, 0.6);
      stroem.connect(raum.ein);

      // Blasen: resonante Plopps mit wandernder Tonhöhe
      var bf = b.band(400, 22);
      bf.frequency.value = 0;
      b.mod(bf.frequency, b.steuer(360, 190, 2.8));
      var tor = b.v(0);
      b.rausch().connect(tor);
      b.funken(300, 5.0, 0.50).connect(tor.gain);
      var blasen = b.kette(tor, bf);
      b.raus(blasen, 5.0, 0.25);
      blasen.connect(raum.ein);

      // fernes Rumpeln des Flussbetts
      var rumpel = b.kette(b.rausch(true), b.tief(70, 1.1));
      b.atem(b.raus(rumpel, 0.17, 0), 0.17, 0.07, 0.25);

      // ganz leises Kieseln, stark gedämpft
      var kies = b.knister(560, 4.6, 0.56, 900, 10);
      var kg = b.kette(kies, b.tief(1200, 1.0));
      b.raus(kg, 1.2, -0.35);
    },

    /* ---- Wind ---- */
    wind: function (b) {
      // Hauptböe: Bandpass, dessen Mitte langsam wandert
      var f = b.band(430, 1.3);
      f.frequency.value = 0;
      b.mod(f.frequency, b.steuer(440, 280, 0.55));
      // Böen kommen alle paar Sekunden – deshalb hier ein flottes Tempo,
      // während die Klangfarbe oben langsam wandert.
      var boe = b.kette(b.rausch(), f);
      b.atem(b.raus(boe, 0.4, -0.2), 0.34, 0.30, 2.8);

      // tiefes Wehen
      var tief = b.kette(b.rausch(true), b.tief(190, 0.8));
      b.atem(b.raus(tief, 0.36, 0.15), 0.32, 0.22, 1.6);

      // Säuseln in Blättern und Ritzen
      var saeuseln = b.kette(b.rausch(), b.hoch(1900, 0.7), b.tief(7500));
      b.atem(b.raus(saeuseln, 0.13, 0.4), 0.12, 0.10, 3.4);

      // gelegentliches Pfeifen an einer Kante
      var pf = b.band(1200, 11);
      pf.frequency.value = 0;
      b.mod(pf.frequency, b.steuer(1150, 620, 1.15));
      var pfeif = b.kette(b.rausch(), pf);
      var pg = b.raus(pfeif, 0, -0.45);
      pg.gain.value = 0;
      b.mod(pg.gain, b.selten(2.0, 0.44, 2.0), 0.55);

      // ganz tiefes Grundwehen, damit es Fülle hat
      var basis = b.kette(b.rausch(true), b.tief(85, 1.0));
      b.raus(basis, 0.28, 0);
    },

    /* ---- Lagerfeuer ---- */
    feuer: function (b) {
      // Flammenrauschen
      var flamme = b.kette(b.rausch(true), b.tief(420, 0.9));
      b.atem(b.raus(flamme, 0.42, -0.1), 0.42, 0.13, 0.75);

      // Glut darunter
      var glut = b.kette(b.rausch(true), b.tief(95, 1.1));
      b.atem(b.raus(glut, 0.24, 0), 0.24, 0.08, 0.4);

      // das eigentliche Knistern – Dichte atmet, kommt also in Schüben
      var kf = b.band(2400, 5);
      kf.frequency.value = 0;
      b.mod(kf.frequency, b.steuer(2300, 850, 3.2));
      var tor = b.v(0);
      b.rausch().connect(tor);
      var dichte = b.v(0);
      b.funken(900, 5.0, 0.52).connect(dichte);
      b.atem(dichte, 0.85, 0.45, 2.2);
      dichte.connect(tor.gain);
      b.raus(b.kette(tor, kf), 0.8, 0.22);

      // seltene, tiefere Knacker – sparsames Tor, deshalb hoher Pegel
      var knack = b.knister(90, 5.8, 0.56, 680, 12);
      b.raus(knack, 4.0, -0.35);

      // leises Zischen feuchten Holzes
      var zisch = b.kette(b.rausch(), b.hoch(5200, 0.7));
      b.atem(b.raus(zisch, 0.05, 0.4), 0.05, 0.035, 1.4);
    },

    /* ---- Grillenzirpen ---- */
    grillen: function (b) {
      // Nachtluft als leiser Teppich
      var luft = b.kette(b.rausch(), b.hoch(1400, 0.6), b.tief(7000));
      b.atem(b.raus(luft, 0.05, 0), 0.05, 0.02, 0.5);

      // ganz tiefes Grundrauschen der Nacht
      var nacht = b.kette(b.rausch(true), b.tief(160, 0.8));
      b.raus(nacht, 0.09, 0);

      var weite = b.hall(0.14, 0.42, 5200);
      b.raus(weite.aus, 0.5, 0);

      // fünf Grillen in unterschiedlicher Entfernung
      for (var i = 0; i < 5; i++) {
        var f = 3500 + Math.random() * 1700;
        // schmalbandiges Rauschen klingt wie ein Zirpen – rauer als ein reiner Ton
        var stimme = b.kette(b.rausch(), b.band(f, 24), b.band(f, 16));

        // Zirp-Struktur: schnelle Amplitudenpulse
        var amTor = b.v(0);
        stimme.connect(amTor);
        b.kette(b.sinus(42 + Math.random() * 30), b.schwelle(0.0, 0.8)).connect(amTor.gain);

        // Phrasen: die Grille zirpt in unregelmäßigen Schüben
        var phTor = b.v(0);
        amTor.connect(phTor);
        b.mod(phTor.gain, b.selten(11 + Math.random() * 7, 0.06, 1.3), 1.0);

        // Die beiden schmalen Bandpässe lassen nur einen Bruchteil der
        // Rauschenergie durch – deshalb der auf den ersten Blick hohe Pegel.
        var pegel = 4.0 / (1 + i * 0.55);
        var g = b.raus(phTor, pegel, (Math.random() * 1.7 - 0.85));
        if (i > 1) phTor.connect(weite.ein);   // entferntere Grillen mit Raum
      }
    }
  };

  /* Pegelausgleich, damit alle Kulissen ähnlich laut wirken.
   * Die Werte sind gemessen (40 s im OfflineAudioContext, Ziel-RMS 0,09),
   * nicht geschätzt – nach jeder Klangänderung neu messen. */
  var AUSGLEICH = {
    regen: 0.82, gewitter: 0.96, strand: 1.25, fluss: 1.25,
    unterwasser: 0.90, wind: 1.20, feuer: 1.10, grillen: 2.30
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
    bauer: bauer      // für Messungen einzelner Schichten
  };
})();
