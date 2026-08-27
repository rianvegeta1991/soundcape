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

  /* ------------------------------------------------------------------
   * Bauer: die Werkzeugkiste, die jede Kulisse benutzt.
   * Merkt sich alle erzeugten Knoten, damit sie sauber abgebaut werden.
   * ------------------------------------------------------------------ */
  function bauer(ziel, opt) {
    opt = opt || {};
    var ctx = ziel.context;
    var teile = [];
    var stereo = opt.stereo !== false && !!ctx.createStereoPanner;

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

      // Regelmäßiger Takt (Schienenstöße, Schnurren, Atemzüge). Anders als
      // "selten" bewusst gleichmäßig – hz ist die Schlagfolge je Sekunde.
      takt: function (hz, breite, exp) {
        return api.kette(api.sinus(hz), api.schwelle(1 - (breite === undefined ? 0.4 : breite),
          exp === undefined ? 1.4 : exp));
      },

      // Anregungsimpulse: tiefpassgefiltertes Rauschen über eine hohe Schwelle.
      // Ergibt kurze, unregelmäßige Böen – die Bandbreite bestimmt die Rate,
      // ihr Kehrwert ungefähr die Dauer einer Öffnung.
      // Die Amplitude hinter dem Tiefpass hängt von der Abtastrate ab – ohne
      // den Ausgleich knisterte es auf 44,1 kHz anders als auf 48 kHz.
      funken: function (bw, verst, schw) {
        var norm = Math.sqrt(ctx.sampleRate / 48000);
        return api.kette(api.rausch(), api.tief(bw, 0.7), api.v(verst * norm), api.schwelle(schw, 1));
      },

      // Tor für lange, seltene Ereignisse (Tierrufe, Walgesang, Klickfolgen).
      // Hier sind die Bandbreiten winzig (0,5–40 Hz statt einiger hundert), und
      // je schmaler das Band, desto kleiner die Amplitude dahinter. Ohne die
      // Normierung erreichte das Signal die Schwelle nie und das Tor bliebe
      // für immer zu – genau daran waren die Vogelstimmen zuerst stumm.
      // 0,35 setzt die Streuung so, dass Spitzen etwa 1 erreichen: eine
      // Schwelle von 0,7 heißt also "gut zwei Standardabweichungen".
      torLang: function (bw, schw, exp) {
        var amp = Math.sqrt(bw / (ctx.sampleRate / 2));
        return api.kette(api.rausch(), api.tief(bw, 0.7), api.v(0.35 / amp),
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

    /* ---- Blubberblasen (isoliert, ohne Wasserteppich) ---- */
    blasen: function (b) {
      var raum = b.hall(0.07, 0.5, 900);
      b.raus(raum.aus, 0.5, 0);

      // drei Blasenquellen in verschiedenen Tonlagen und Tempi
      var lagen = [
        { f: 260, hub: 150, tempo: 2.2, bw: 220, schw: 0.54, q: 24, pegel: 5.0, pan: -0.3 },
        { f: 520, hub: 280, tempo: 3.4, bw: 380, schw: 0.50, q: 20, pegel: 4.0, pan: 0.28 },
        { f: 900, hub: 420, tempo: 4.6, bw: 520, schw: 0.52, q: 16, pegel: 2.6, pan: 0.05 }
      ];
      for (var i = 0; i < lagen.length; i++) {
        var l = lagen[i];
        var bf = b.band(l.f, l.q);
        bf.frequency.value = 0;
        b.mod(bf.frequency, b.steuer(l.f, l.hub, l.tempo));
        var tor = b.v(0);
        b.rausch().connect(tor);
        b.funken(l.bw, 5.0, l.schw).connect(tor.gain);
        var kette = b.kette(tor, bf);
        b.raus(kette, l.pegel, l.pan);
        kette.connect(raum.ein);
      }

      // gelegentlich ein großer, tiefer Blubber
      var gf = b.band(150, 18);
      gf.frequency.value = 0;
      b.mod(gf.frequency, b.steuer(150, 90, 1.4));
      var gtor = b.v(0);
      b.rausch().connect(gtor);
      b.funken(45, 5.6, 0.60).connect(gtor.gain);
      b.raus(b.kette(gtor, gf), 6.0, 0);
    },

    /* ================= Feuer ================= */

    /* ---- Lagerfeuer ---- */
    feuer: function (b) {
      // Flammenrauschen bewusst knapp gehalten: das Knistern soll die Kulisse
      // tragen, nicht ein Rauschteppich dahinter.
      var flamme = b.kette(b.rausch(true), b.tief(340, 0.9));
      b.atem(b.raus(flamme, 0.18, -0.1), 0.18, 0.07, 0.75);

      var glut = b.kette(b.rausch(true), b.tief(95, 1.1));
      b.atem(b.raus(glut, 0.10, 0), 0.10, 0.04, 0.4);

      var kf = b.band(2400, 5);
      kf.frequency.value = 0;
      b.mod(kf.frequency, b.steuer(2300, 850, 3.2));
      var tor = b.v(0);
      b.rausch().connect(tor);
      var dichte = b.v(0);
      b.funken(900, 5.0, 0.52).connect(dichte);
      b.atem(dichte, 0.85, 0.45, 2.2);
      dichte.connect(tor.gain);
      b.raus(b.kette(tor, kf), 0.9, 0.22);

      var knack = b.knister(90, 5.8, 0.56, 680, 12);
      b.raus(knack, 4.4, -0.35);
    },

    /* ---- Feuer, stark knisternd ---- */
    feuerstark: function (b) {
      // fast nur Knistern: dichteres Tor, mehr Knacker, kaum Grundrauschen
      var flamme = b.kette(b.rausch(true), b.tief(300, 0.9));
      b.atem(b.raus(flamme, 0.08, -0.1), 0.08, 0.04, 0.8);

      var kf = b.band(2600, 4.5);
      kf.frequency.value = 0;
      b.mod(kf.frequency, b.steuer(2500, 1100, 3.6));
      var tor = b.v(0);
      b.rausch().connect(tor);
      var dichte = b.v(0);
      b.funken(1600, 5.0, 0.44).connect(dichte);
      b.atem(dichte, 0.95, 0.4, 2.6);
      dichte.connect(tor.gain);
      b.raus(b.kette(tor, kf), 1.0, 0.2);

      // zweite Knisterlage, tiefer und trockener
      var kf2 = b.band(1200, 6);
      var tor2 = b.v(0);
      b.rausch().connect(tor2);
      b.funken(700, 5.0, 0.46).connect(tor2.gain);
      b.raus(b.kette(tor2, kf2), 1.1, -0.25);

      // kräftige Knacker, häufiger als beim ruhigen Feuer
      b.raus(b.knister(160, 5.6, 0.50, 620, 11), 4.0, -0.4);
      b.raus(b.knister(60, 6.0, 0.52, 340, 9), 5.0, 0.35);
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

    /* ---- Fernes Donnergrollen (isoliert, ohne Regen) ---- */
    donner: function (b) {
      var weite = b.hall(0.23, 0.66, 620);
      b.raus(weite.aus, 0.9, 0);

      // Die Steuerkurve muss vergleichsweise flott laufen: sie wird hoch
      // geschwellt, damit nur die Spitzen durchkommen. Zu langsam gewählt
      // wird daraus ein minutenlanges Anschwellen statt eines Grollens.
      var rumpeln = b.kette(b.rausch(true), b.tief(140, 1.2));
      var tor = b.v(0);
      rumpeln.connect(tor);
      b.mod(tor.gain, b.selten(1.5, 0.52, 2.6), 1.5);
      tor.connect(weite.ein);
      b.raus(tor, 0.8, 0);

      // zweite Lage mit etwas mehr Kante – das Krachen weit weg
      var kante = b.kette(b.rausch(true), b.band(310, 0.9));
      var tor2 = b.v(0);
      kante.connect(tor2);
      b.mod(tor2.gain, b.selten(1.1, 0.66, 3.2), 1.4);
      tor2.connect(weite.ein);
      b.raus(tor2, 0.45, 0.15);

      // ganz tiefes Nachrollen
      var sub = b.kette(b.rausch(true), b.tief(55, 1.4));
      var tor3 = b.v(0);
      sub.connect(tor3);
      b.mod(tor3.gain, b.selten(0.9, 0.58, 3.0), 1.6);
      b.raus(tor3, 0.8, 0);
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

    /* ---- Grillenzirpen (isoliert, ohne Nachtluft) ---- */
    grillen: function (b) {
      var weite = b.hall(0.14, 0.42, 5200);
      b.raus(weite.aus, 0.5, 0);

      for (var i = 0; i < 5; i++) {
        var f = 3500 + Math.random() * 1700;
        // schmalbandiges Rauschen klingt wie ein Zirpen – rauer als ein reiner Ton
        var stimme = b.kette(b.rausch(), b.band(f, 24), b.band(f, 16));

        var amTor = b.v(0);
        stimme.connect(amTor);
        b.kette(b.sinus(42 + Math.random() * 30), b.schwelle(0.0, 0.8)).connect(amTor.gain);

        var phTor = b.v(0);
        amTor.connect(phTor);
        b.mod(phTor.gain, b.selten(11 + Math.random() * 7, 0.06, 1.3), 1.0);

        // Die beiden schmalen Bandpässe lassen nur einen Bruchteil der
        // Rauschenergie durch – deshalb der auf den ersten Blick hohe Pegel.
        var pegel = 4.0 / (1 + i * 0.55);
        b.raus(phTor, pegel, (Math.random() * 1.7 - 0.85));
        if (i > 1) phTor.connect(weite.ein);
      }
    },

    /* ---- Vogelstimmen: Deutschland ---- */
    vogelDe: function (b) {
      var weite = b.hall(0.13, 0.4, 4200);
      b.raus(weite.aus, 0.45, 0);

      // Amsel: melodische, absteigende Pfiffe
      b.ruf({ f: 2400, hub: 900, tempo: 26, laenge: 7, dichte: 0.50, phrase: 6,
              pegel: 0.30, pan: -0.5, ziel: weite.ein });
      // Meise: hohe, kurze Doppelrufe mit Triller
      b.ruf({ f: 4200, hub: 700, tempo: 55, laenge: 22, dichte: 0.52, triller: 17,
              phrase: 9, pegel: 0.26, pan: 0.45, ziel: weite.ein });
      // Rotkehlchen: feines, schnelles Perlen
      b.ruf({ f: 5200, hub: 1400, tempo: 80, laenge: 30, dichte: 0.54, phrase: 13,
              pegel: 0.16, pan: 0.15, ziel: weite.ein });
      // Buchfink: kräftiger, mittlerer Ruf
      b.ruf({ f: 3100, hub: 1100, tempo: 40, laenge: 14, dichte: 0.53, triller: 26,
              phrase: 7, pegel: 0.20, pan: -0.25, ziel: weite.ein });
      // Ringeltaube: tiefes, weiches Gurren weit hinten
      b.ruf({ f: 480, hub: 90, tempo: 9, laenge: 3.5, dichte: 0.54, form: 'triangle',
              phrase: 2.2, pegel: 0.22, pan: 0.6, ziel: weite.ein });
    },

    /* ---- Vogelstimmen: Tropen ---- */
    vogelTropen: function (b) {
      var weite = b.hall(0.19, 0.5, 3200);
      b.raus(weite.aus, 0.6, 0);

      // Papageien: rau und krächzend
      b.ruf({ f: 1400, hub: 700, tempo: 22, laenge: 6, dichte: 0.52, rau: 9,
              phrase: 4, pegel: 1.9, pan: -0.45, ziel: weite.ein });
      b.ruf({ f: 900, hub: 450, tempo: 16, laenge: 4.5, dichte: 0.54, rau: 7,
              phrase: 3, pegel: 2.1, pan: 0.5, ziel: weite.ein });
      // schrille Pfiffe mit weiten Sprüngen
      b.ruf({ f: 3400, hub: 2200, tempo: 34, laenge: 9, dichte: 0.53,
              phrase: 5, pegel: 0.24, pan: 0.2, ziel: weite.ein });
      // schnelles, metallisches Ticken (Tukan-artig)
      b.ruf({ f: 2000, hub: 300, tempo: 60, laenge: 40, dichte: 0.50, rau: 14,
              triller: 11, phrase: 3.5, pegel: 2.4, pan: -0.2, ziel: weite.ein });
      // tiefes Rufen aus der Ferne
      b.ruf({ f: 620, hub: 260, tempo: 7, laenge: 2.6, dichte: 0.56, form: 'triangle',
              phrase: 1.8, pegel: 0.26, pan: 0.65, ziel: weite.ein });
      // Zikaden-Grundton des Regenwalds, schmalbandig statt Rauschteppich.
      // Zwei leicht verschiedene Stimmen links und rechts – als einzelne
      // Mittenstimme zog sie die ganze Kulisse nach Mono.
      [[5200, 58, -0.55], [4700, 63, 0.5]].forEach(function (z) {
        var zik = b.kette(b.rausch(), b.band(z[0], 14), b.band(z[0], 10));
        var zTor = b.v(0);
        zik.connect(zTor);
        b.kette(b.sinus(z[1]), b.schwelle(0.1, 0.9)).connect(zTor.gain);
        // leiser als die Rufe: die Zikaden sind Kulisse, nicht Hauptstimme
        b.atem(b.raus(zTor, 0.6, z[2]), 0.6, 0.28, 1.2);
      });
    },

    /* ---- Vogelstimmen: Afrika ---- */
    vogelAfrika: function (b) {
      var weite = b.hall(0.22, 0.52, 2600);
      b.raus(weite.aus, 0.65, 0);

      // Turteltaube: gleichmäßiges, tiefes Gurren
      b.ruf({ f: 420, hub: 70, tempo: 6, laenge: 2.8, dichte: 0.52, form: 'triangle',
              phrase: 1.6, pegel: 0.30, pan: -0.4, ziel: weite.ein });
      // Hornvogel: rauer, hohler Ruf in Serien
      b.ruf({ f: 780, hub: 220, tempo: 14, laenge: 5, dichte: 0.50, rau: 6,
              phrase: 2.6, pegel: 2.3, pan: 0.4, ziel: weite.ein });
      // Webervögel: geschwätziges, schnelles Zwitschern
      b.ruf({ f: 3600, hub: 1500, tempo: 70, laenge: 34, dichte: 0.50, triller: 21,
              phrase: 8, pegel: 0.20, pan: 0.15, ziel: weite.ein });
      // heller Pfiff mit steilem Abfall
      b.ruf({ f: 2600, hub: 1700, tempo: 30, laenge: 10, dichte: 0.54,
              phrase: 4.5, pegel: 0.22, pan: -0.15, ziel: weite.ein });
      // Perlhuhn-artiges Rattern, ganz hinten
      b.ruf({ f: 1100, hub: 180, tempo: 45, laenge: 26, dichte: 0.52, rau: 11,
              triller: 13, phrase: 2.2, pegel: 1.7, pan: 0.6, ziel: weite.ein });
    },

    /* ---- Walgesang ---- */
    wal: function (b) {
      // Rückkopplung bewusst zurückhaltend: mit 0,72 schaukelten sich die drei
      // Verzögerungen auf und die Kulisse übersteuerte (gemessen: Spitze 1,48).
      var tiefe = b.hall(0.42, 0.52, 700);
      b.raus(tiefe.aus, 0.7, 0);

      // Lange, gleitende Rufe: der Ton wandert über Sekunden durch die Tonlage.
      var stimmen = [
        { f: 190, hub: 130, tempo: 3.0, laenge: 0.9, dichte: 0.42, pegel: 0.17, pan: -0.25 },
        { f: 95, hub: 55, tempo: 2.0, laenge: 0.6, dichte: 0.46, pegel: 0.20, pan: 0.2 },
        { f: 330, hub: 220, tempo: 4.5, laenge: 1.3, dichte: 0.50, pegel: 0.11, pan: 0.05 }
      ];
      for (var i = 0; i < stimmen.length; i++) {
        var s = stimmen[i];
        var osc = b.sinus(0, 'sine');
        osc.frequency.value = 0;
        b.mod(osc.frequency, b.steuer(s.f, s.hub, s.tempo));
        // etwas Obertongehalt, damit der Ton nicht nach Prüfgerät klingt
        var farbe = b.kette(osc, b.flt('peaking', s.f * 2, 1));
        var tor = b.v(0);
        farbe.connect(tor);
        b.mod(tor.gain, b.torLang(s.laenge, s.dichte), 1.2);
        b.raus(tor, s.pegel, s.pan);
        tor.connect(tiefe.ein);
      }

      // fernes Stöhnen ganz unten
      var sub = b.sinus(0, 'sine');
      sub.frequency.value = 0;
      b.mod(sub.frequency, b.steuer(48, 22, 1.2));
      var subTor = b.v(0);
      sub.connect(subTor);
      b.mod(subTor.gain, b.torLang(0.5, 0.50), 1.0);
      b.raus(subTor, 0.26, 0);
      subTor.connect(tiefe.ein);
    },

    /* ---- Delfingesang ---- */
    delfin: function (b) {
      var raum = b.hall(0.11, 0.55, 6000);
      b.raus(raum.aus, 0.55, 0);

      // Pfiffe: schnelle, weite Sprünge in hoher Lage
      var pfiffe = [
        { f: 5200, hub: 3400, tempo: 90, laenge: 16, dichte: 0.64, pegel: 0.20, pan: -0.3 },
        { f: 8000, hub: 4200, tempo: 130, laenge: 24, dichte: 0.68, pegel: 0.14, pan: 0.35 },
        { f: 3400, hub: 2200, tempo: 60, laenge: 10, dichte: 0.66, pegel: 0.22, pan: 0.1 }
      ];
      for (var i = 0; i < pfiffe.length; i++) {
        var p = pfiffe[i];
        var osc = b.sinus(0, 'sine');
        osc.frequency.value = 0;
        b.mod(osc.frequency, b.steuer(p.f, p.hub, p.tempo));
        var tor = b.v(0);
        osc.connect(tor);
        b.mod(tor.gain, b.torLang(p.laenge, p.dichte), 1.3);
        b.raus(tor, p.pegel, p.pan);
        tor.connect(raum.ein);
      }

      // Klickfolgen (Echoortung): schneller, regelmäßiger Takt in Serien
      var klick = b.v(0);
      b.rausch().connect(klick);
      var klickTakt = b.v(0);
      b.takt(38, 0.08, 0.6).connect(klickTakt);
      b.mod(klickTakt.gain, b.selten(6, 0.30, 1.4), 1.0);   // nur schubweise
      klickTakt.connect(klick.gain);
      var kk = b.kette(klick, b.hoch(4000), b.band(7000, 2.5));
      b.raus(kk, 1.4, -0.15);
      kk.connect(raum.ein);

      // zweite, langsamere Klickfolge
      var klick2 = b.v(0);
      b.rausch().connect(klick2);
      var takt2 = b.v(0);
      b.takt(13, 0.06, 0.6).connect(takt2);
      b.mod(takt2.gain, b.selten(4, 0.40, 1.4), 1.0);
      takt2.connect(klick2.gain);
      b.raus(b.kette(klick2, b.hoch(3000), b.band(5200, 2)), 1.2, 0.25);
    },

    /* ---- Katzenschnurren ---- */
    katze: function (b) {
      // Schnurren ist tiefes, rauhes Brummen mit etwa 25 Schlägen je Sekunde,
      // moduliert vom Atemzyklus (ein- und ausatmen dauern zusammen ~3 s).
      var atem = b.kette(b.sinus(0.34), b.schwelle(-0.75, 1.1));
      var atemAus = b.verz(1.5);            // Ausatmen: derselbe Zyklus, halbe Periode später
      atem.connect(atemAus);

      function lage(f, q, taktHz, pegel, pan, quelleAtem) {
        var grund = b.kette(b.rausch(true), b.tief(f, q));
        var tor = b.v(0);
        grund.connect(tor);
        var schlag = b.v(0);
        b.takt(taktHz, 0.5, 1.0).connect(schlag);
        b.mod(schlag.gain, quelleAtem, 1.0);
        schlag.connect(tor.gain);
        b.raus(tor, pegel, pan);
        return tor;
      }

      lage(170, 1.2, 25, 1.5, -0.12, atem);        // Einatmen: dichter, tiefer
      lage(260, 1.0, 23.5, 0.9, 0.15, atemAus);    // Ausatmen: etwas heller, leiser

      // der raue Anteil obendrauf, damit es nicht nach Motor klingt
      var rau = b.kette(b.rausch(), b.band(620, 3.5));
      var rTor = b.v(0);
      rau.connect(rTor);
      var rSchlag = b.v(0);
      b.takt(25, 0.45, 1.2).connect(rSchlag);
      b.mod(rSchlag.gain, atem, 1.0);
      rSchlag.connect(rTor.gain);
      b.raus(rTor, 0.5, 0);
    },

    /* ---- Leises Schnarchen ---- */
    schnarchen: function (b) {
      // Ein Atemzug dauert gut vier Sekunden: Einatmen rasselnd, Ausatmen weich.
      var zyklus = b.sinus(0.23);
      var ein = b.kette(zyklus, b.schwelle(0.15, 1.6));
      var spaet = b.verz(2.2);
      zyklus.connect(spaet);
      var aus = b.kette(spaet, b.schwelle(0.3, 1.8));

      // Einatmen: tiefes Rasseln (Gaumensegel flattert mit ~38 Hz)
      var rassel = b.kette(b.rausch(true), b.tief(340, 1.4));
      var rTor = b.v(0);
      rassel.connect(rTor);
      var flattern = b.v(0);
      b.takt(38, 0.55, 1.0).connect(flattern);
      b.mod(flattern.gain, ein, 1.0);
      flattern.connect(rTor.gain);
      b.raus(rTor, 1.6, -0.1);

      // etwas Luftgeräusch dazu, nur während des Einatmens
      var luft = b.kette(b.rausch(), b.band(700, 1.1));
      var lTor = b.v(0);
      luft.connect(lTor);
      b.mod(lTor.gain, ein, 0.5);
      b.raus(lTor, 0.5, 0.1);

      // Ausatmen: weiches Hauchen ohne Rasseln
      var hauch = b.kette(b.rausch(), b.tief(520, 0.8), b.hoch(120));
      var hTor = b.v(0);
      hauch.connect(hTor);
      b.mod(hTor.gain, aus, 0.30);
      b.raus(hTor, 0.6, 0.15);
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
    regen: 0.82, strand: 1.22, fluss: 1.27, unterwasser: 1.10, blasen: 3.23,
    feuer: 2.30, feuerstark: 1.77,
    wind: 1.23, donner: 1.64, wipfel: 1.25,
    grillen: 1.83, vogelDe: 4.68, vogelTropen: 1.87, vogelAfrika: 3.13,
    wal: 2.33, delfin: 1.36, katze: 1.18,
    schnarchen: 1.02, zug: 0.77, strasse: 1.75,
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
    bauer: bauer      // für Messungen einzelner Schichten
  };
})();
