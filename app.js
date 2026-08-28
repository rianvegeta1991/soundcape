/* Soundcape – Bedienung, Wiedergabe, Timer
 * Die Klangerzeugung selbst steht in sound.js.
 *
 * Zwei Ebenen: die **Bibliothek** kennt alle Kulissen nach Kategorien,
 * das **Pult** ist die Auswahl, die auf dem Bildschirm liegt. Nur was im
 * Pult liegt, kann klingen – so bleibt die Ansicht übersichtlich, auch
 * wenn die Bibliothek weiter wächst.
 */
(function () {
  'use strict';

  var APP_VERSION = '1.6';
  var LS = 'soundcape-zustand';

  /* ==================================================================
   * Bibliothek
   * ================================================================== */
  var KATEGORIEN = [
    { id: 'wasser', name: 'Wasser' },
    { id: 'feuer', name: 'Feuer' },
    { id: 'luft', name: 'Wind & Wetter' },
    { id: 'tiere', name: 'Tiere' },
    { id: 'welt', name: 'Menschenwelt' },
    { id: 'rauschen', name: 'Rauschen' }
  ];

  var KULISSEN = [
    /* --- Wasser --- */
    { id: 'regen', kat: 'wasser', name: 'Regen', unter: 'Gleichmäßiger Landregen', rgb: '110,168,255',
      ikon: '<path d="M12 20a6 6 0 0 1 1.4-11.8A7.5 7.5 0 0 1 27.6 11 5 5 0 0 1 27 20z"/>' +
            '<path d="M13 25l-1.6 5M20 25l-1.6 5M27 25l-1.6 5"/>' },
    { id: 'strand', kat: 'wasser', name: 'Strand', unter: 'Wellen und Brandung', rgb: '84,198,214',
      ikon: '<circle cx="27.5" cy="11" r="4"/>' +
            '<path d="M5 24c3.2 0 3.2-2.6 6.4-2.6S14.6 24 17.8 24s3.2-2.6 6.4-2.6S27.4 24 30.6 24 34 21.4 35 21.4"/>' +
            '<path d="M5 31c3.2 0 3.2-2.6 6.4-2.6S14.6 31 17.8 31s3.2-2.6 6.4-2.6S27.4 31 30.6 31 34 28.4 35 28.4"/>' },
    { id: 'fluss', kat: 'wasser', name: 'Fluss', unter: 'Über Wasser', rgb: '92,204,152',
      ikon: '<path d="M9 5c0 8 6 10 6 16s-5 8-5 14M31 5c0 8-6 10-6 16s5 8 5 14"/>' +
            '<path d="M15.5 14c1.6 0 1.6 1.6 3.2 1.6s1.6-1.6 3.2-1.6M14 26c1.8 0 1.8 1.6 3.6 1.6S19.4 26 21.2 26"/>' },
    { id: 'unterwasser', kat: 'wasser', name: 'Unter Wasser', unter: 'Dumpf, mit Strömung', rgb: '74,146,214',
      ikon: '<path d="M4 9c3.2 0 3.2-2.4 6.4-2.4S13.6 9 16.8 9s3.2-2.4 6.4-2.4S26.4 9 29.6 9 33 6.6 36 6.6"/>' +
            '<circle cx="13" cy="27" r="4.5"/><circle cx="24.5" cy="19.5" r="3"/><circle cx="27" cy="30" r="2"/>' },
    { id: 'blasen', kat: 'wasser', name: 'Blubberblasen', unter: 'Aufsteigende Blasen', rgb: '96,186,230',
      ikon: '<circle cx="14" cy="28" r="6"/><circle cx="26" cy="17" r="4"/>' +
            '<circle cx="17" cy="9" r="2.6"/><circle cx="29" cy="30" r="2.2"/>' },

    /* --- Feuer --- */
    { id: 'feuer', kat: 'feuer', name: 'Lagerfeuer', unter: 'Knistern und Glut', rgb: '245,150,78',
      ikon: '<path d="M20 4c1 6-5 7.5-5 13a5 5 0 0 0 10 0c0-2-1-3.2-1-3.2 3.5 2.2 6 5.6 6 9.7a10 10 0 1 1-20 0C10 15 20 13 20 4z" stroke-linejoin="round"/>' },

    /* --- Wind & Wetter --- */
    { id: 'wind', kat: 'luft', name: 'Wind', unter: 'Böen und Säuseln', rgb: '162,180,204',
      ikon: '<path d="M4 13h17a4.5 4.5 0 1 0-4.5-4.5"/>' +
            '<path d="M4 21h22a5 5 0 1 1-5 5"/>' +
            '<path d="M4 29h11.5a3.6 3.6 0 1 1-3.6 3.6"/>' },
    { id: 'donner', kat: 'luft', name: 'Donnergrollen', unter: 'Fern, ohne Regen', rgb: '150,140,240',
      ikon: '<path d="M12 19a6 6 0 0 1 1.4-11.8A7.5 7.5 0 0 1 27.6 10 5 5 0 0 1 27 19z"/>' +
            '<path d="M21 21l-5 7h4.4l-2.2 6.5 7-8.5h-4.6z" stroke-linejoin="round"/>' },
    { id: 'wipfel', kat: 'luft', name: 'Baumwipfel', unter: 'Rascheln im Laub', rgb: '124,196,124',
      ikon: '<path d="M20 34V21"/>' +
            '<path d="M20 5c5.5 0 9 3.6 9 8 3 1 4.6 3.4 4.6 6 0 3.6-3 6-7 6H13.4c-4 0-7-2.4-7-6 0-2.6 1.6-5 4.6-6 0-4.4 3.5-8 9-8z" stroke-linejoin="round"/>' },

    /* --- Tiere --- */
    { id: 'grillen', kat: 'tiere', name: 'Grillen', unter: 'Sommernacht', rgb: '196,206,112',
      ikon: '<path d="M26 5a12 12 0 1 0 9.5 14.6A9.5 9.5 0 0 1 26 5z" stroke-linejoin="round"/>' +
            '<path d="M8 30c1.5-1.6 1.5-4.4 0-6M12.5 31.5c2.4-2.4 2.4-7.6 0-10"/>' },
    { id: 'vogelDe', kat: 'tiere', name: 'Vögel, heimisch', unter: 'Amsel, Meise, Fink', rgb: '146,196,150',
      ikon: '<path d="M13 12a4 4 0 1 1 8 0c0 5 5 5 8 9 2.6 3.4 1 10-6 10-6.5 0-11-4.6-11-11 0-3.4 1-5.6 1-8z" stroke-linejoin="round"/>' +
            '<path d="M15.5 11.2h.1M13 14l-6-2.4 5-1.6M4 34c5-1.4 9-4 11-8"/>' },
    { id: 'vogelTropen', kat: 'tiere', name: 'Vögel, Tropen', unter: 'Papageien im Regenwald', rgb: '86,206,178',
      ikon: '<path d="M15 13a4.2 4.2 0 1 1 8.4 0c0 4.6 4.6 5.4 6.6 9.6 1.8 3.8-.8 9.4-7 9.4-6 0-10.4-4.4-10.4-10.4 0-3.4 2.4-5 2.4-8.6z" stroke-linejoin="round"/>' +
            '<path d="M17.4 12.2h.1M15 15l-7-1.6 5.6-2.6M22 32c2.6 2 5 2.6 8 2.4"/>' },
    { id: 'vogelAfrika', kat: 'tiere', name: 'Vögel, Afrika', unter: 'Savanne am Morgen', rgb: '226,178,96',
      ikon: '<circle cx="29" cy="10" r="5"/>' +
            '<path d="M6 30h28M10 30c0-5 4-8 9-8s9 3 9 8"/>' +
            '<path d="M14 22l-3-4 5 .6"/>' },
    { id: 'wal', kat: 'tiere', name: 'Walgesang', unter: 'Tiefe, lange Rufe', rgb: '106,142,220',
      ikon: '<path d="M4 26c6 0 9-3 13-3s5 3 5 6" />' +
            '<path d="M22 29c4-1 8-4 10-9 1.4 4 3.4 6 4 10-4.6 1.6-9.6 1.4-14-1z" stroke-linejoin="round"/>' +
            '<path d="M8 14c1.6-3 4-4.6 7-4.6"/>' },
    { id: 'delfin', kat: 'tiere', name: 'Delfingesang', unter: 'Pfiffe und Klicks', rgb: '96,204,224',
      ikon: '<path d="M5 12c8-1 13 3 16 8 2-3 5-4 8-3.6-2 2-2.6 4.6-2 7 2.6.6 4.6 2.6 5 5-6 1.4-11-1-14-5-3.4 3.6-8 4.6-13 3 3.6-2 5-5 4-8-2-1.6-3.4-4-4-6.4z" stroke-linejoin="round"/>' },
    { id: 'katze', kat: 'tiere', name: 'Katzenschnurren', unter: 'Ruhiges Brummen', rgb: '212,160,196',
      ikon: '<path d="M10 16 8.6 6.6 15 11.4a13 13 0 0 1 10 0L31.4 6.6 30 16" stroke-linejoin="round"/>' +
            '<path d="M20 12c6.6 0 11 4.6 11 10.4S26.6 33 20 33 9 28.2 9 22.4 13.4 12 20 12z"/>' +
            '<path d="M16 21h.1M24 21h.1M20 25v1.6M20 26.6c-1.4 1.4-3.4 1.2-4.4-.4M20 26.6c1.4 1.4 3.4 1.2 4.4-.4"/>' },

    /* --- Menschenwelt --- */
    { id: 'schnarchen', kat: 'welt', name: 'Leises Schnarchen', unter: 'Ruhiger Atem', rgb: '176,168,214',
      ikon: '<path d="M4 28h12a6 6 0 0 0 6-6v-4a6 6 0 0 1 6-6h4"/>' +
            '<path d="M24 6h7l-7 7h7M28 18h5l-5 5h5"/>' },
    { id: 'zug', kat: 'welt', name: 'Zug in der Ferne', unter: 'Rollen und Stöße', rgb: '150,166,190',
      ikon: '<rect x="9" y="7" width="22" height="19" rx="4"/>' +
            '<path d="M13 13h14M12 33l3.5-5M28 33l-3.5-5"/>' +
            '<circle cx="15" cy="21" r="1.6" fill="currentColor" stroke="none"/>' +
            '<circle cx="25" cy="21" r="1.6" fill="currentColor" stroke="none"/>' },
    { id: 'strasse', kat: 'welt', name: 'Straßengeräusche', unter: 'Vorbeifahrende Autos', rgb: '168,172,180',
      ikon: '<path d="M6 34 15 6M34 34 25 6M20 9v4M20 17v4M20 25v4"/>' },

    /* --- Rauschen --- */
    { id: 'weiss', kat: 'rauschen', name: 'White Noise', unter: 'Volles Spektrum', rgb: '226,232,242',
      ikon: '<path d="M4 20h2l2-9 2.4 15 2.6-19 2.4 23 2.6-17 2.4 13 2.6-16 2.4 19 2.6-14 2.4 9 2.6-6H36"/>' },
    { id: 'rosa', kat: 'rauschen', name: 'Pink Noise', unter: 'Ausgewogen, sanfter', rgb: '240,168,196',
      ikon: '<path d="M4 20h3l3-7 3.5 12 3.5-16 3.5 18 3.5-11 3.5 8 3.5-6H36"/>' },
    { id: 'braun', kat: 'rauschen', name: 'Brown Noise', unter: 'Dunkel und tief', rgb: '206,164,124',
      ikon: '<path d="M4 20c4 0 4-8 8-8s4 16 8 16 4-14 8-14 4 6 8 6"/>' }
  ];

  var NACH_ID = {};
  KULISSEN.forEach(function (k) { NACH_ID[k.id] = k; });

  var PULT_STANDARD = ['regen', 'strand', 'feuer', 'grillen', 'wind', 'vogelDe'];

  /* ==================================================================
   * Zustand
   * ================================================================== */
  /* Geschwindigkeitsstufen. Der Faktor greift in sound.js auf alles, was ein
   * Tempo hat: Steuerkurven, Impulsdichte, Pausen zwischen Rufen. */
  var TEMPO = { '-1': 0.62, '0': 1, '1': 1.55 };
  var TEMPO_NAME = { '-1': 'langsam', '0': 'normal', '1': 'schnell' };

  var st = {
    master: 70,
    pult: PULT_STANDARD.slice(),
    vol: {},
    tempo: {},          // id -> -1 | 0 | 1
    an: {},
    fadeMin: 1,
    wach: false,
    einblenden: true,
    stereo: true
  };
  KULISSEN.forEach(function (k) { st.vol[k.id] = 65; });

  function laden() {
    try {
      var roh = localStorage.getItem(LS);
      if (!roh) return;
      var g = JSON.parse(roh);
      if (typeof g.master === 'number') st.master = g.master;
      if (g.vol) for (var id in g.vol) if (NACH_ID[id]) st.vol[id] = g.vol[id];
      if (typeof g.fadeMin === 'number') st.fadeMin = g.fadeMin;
      if (typeof g.wach === 'boolean') st.wach = g.wach;
      if (typeof g.einblenden === 'boolean') st.einblenden = g.einblenden;
      if (typeof g.stereo === 'boolean') st.stereo = g.stereo;

      // Alte Namen umbiegen: "gewitter" wurde zu "donner" (Regen getrennt),
      // "feuerstark" ist jetzt schlicht das Feuer auf Stufe "schnell".
      function umbenennen(x) {
        if (x === 'gewitter') return 'donner';
        if (x === 'feuerstark') return 'feuer';
        return x;
      }
      if (g.tempo) for (var id3 in g.tempo) {
        var z = umbenennen(id3);
        if (NACH_ID[z]) st.tempo[z] = g.tempo[id3];
      }
      if (g.pult && g.pult.indexOf('feuerstark') >= 0 && st.tempo['feuer'] === undefined) {
        st.tempo['feuer'] = 1;    // wer das starke Feuer gewählt hatte, bekommt "schnell"
      }

      function ohneDoppelte(liste) {
        var raus = [];
        liste.forEach(function (x) { if (raus.indexOf(x) < 0) raus.push(x); });
        return raus;
      }

      if (g.pult && g.pult.length) {
        // Doppelte entfernen: aus feuer + feuerstark wird sonst zweimal feuer
        st.pult = ohneDoppelte(g.pult.map(umbenennen).filter(function (x) { return !!NACH_ID[x]; }));
      } else if (g.an) {
        // Stand aus Version 1.0: was damals gewählt war, kommt ins Pult
        var alt = ohneDoppelte(Object.keys(g.an).map(umbenennen).filter(function (x) { return !!NACH_ID[x]; }));
        if (alt.length) st.pult = alt;
      }
      if (!st.pult.length) st.pult = PULT_STANDARD.slice();

      if (g.an) for (var id2 in g.an) {
        var neu = umbenennen(id2);
        if (g.an[id2] && NACH_ID[neu] && st.pult.indexOf(neu) >= 0) st.an[neu] = true;
      }
    } catch (e) { }
  }

  var speicherWartet = 0;
  function speichern() {
    clearTimeout(speicherWartet);
    speicherWartet = setTimeout(function () {
      try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) { }
    }, 300);
  }

  /* ==================================================================
   * Tonpfad
   * ================================================================== */
  var ctx = null, bus = null, vol = null, fade = null, limit = null;
  var streamZiel = null, audioEl = null, direkt = false;
  var szenen = {};
  var laedt = {};       // Kulissen, deren Aufnahmen gerade geholt werden
  var warStumm = false; // stand der Master beim letzten Reglerschritt auf null?
  var laeuft = false;
  var wl = null;

  function aktiveIds() {
    return st.pult.filter(function (id) { return st.an[id]; });
  }
  function pegel(id) {
    return (st.vol[id] / 100) * (Klang.ausgleich[id] || 1);
  }
  function stufe(id) { return st.tempo[id] || 0; }
  function tempoFaktor(id) { return TEMPO[String(stufe(id))] || 1; }
  function masterWert() {
    var x = st.master / 100;
    return x * x;   // quadratisch – entspricht eher dem Lautstärkeempfinden
  }

  function audioAufbau() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    bus = ctx.createGain(); bus.gain.value = 1;
    vol = ctx.createGain(); vol.gain.value = masterWert();
    fade = ctx.createGain(); fade.gain.value = 1;

    limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -5;
    limit.knee.value = 12;
    limit.ratio.value = 8;
    limit.attack.value = 0.006;
    limit.release.value = 0.3;

    bus.connect(vol); vol.connect(fade); fade.connect(limit);
    ausgabeVerbinden();
    return true;
  }

  /* Der Ton geht bewusst nicht direkt an ctx.destination, sondern über einen
   * MediaStream in ein <audio>-Element: nur so behandelt das Betriebssystem
   * ihn als Medienwiedergabe und lässt ihn bei gesperrtem Bildschirm laufen. */
  function ausgabeVerbinden() {
    try {
      streamZiel = ctx.createMediaStreamDestination();
      limit.connect(streamZiel);
      audioEl = document.createElement('audio');
      audioEl.setAttribute('playsinline', '');
      audioEl.preload = 'auto';
      audioEl.autoplay = true;
      audioEl.srcObject = streamZiel.stream;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
    } catch (e) {
      aufDirektUmstellen();
    }
  }

  function aufDirektUmstellen() {
    if (direkt) return;
    direkt = true;
    try { if (streamZiel) limit.disconnect(streamZiel); } catch (e) { }
    try { limit.connect(ctx.destination); } catch (e) { }
    try {
      if (audioEl) {
        audioEl.srcObject = null;
        audioEl.src = stilleSchleife();
        audioEl.loop = true;
        audioEl.play()['catch'](function () { });
      }
    } catch (e) { }
  }

  function stilleSchleife() {
    var sr = 8000, n = sr * 2;
    var buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    function txt(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    txt(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); txt(8, 'WAVEfmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    txt(36, 'data'); dv.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) dv.setInt16(44 + i * 2, (i % 2) ? 1 : -1, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function rampe(param, ziel, sek) {
    var t = ctx.currentTime;
    var jetzt = param.value;
    try { param.cancelScheduledValues(t); } catch (e) { }
    param.setValueAtTime(jetzt, t);
    param.linearRampToValueAtTime(ziel, t + Math.max(0.02, sek));
  }

  // Kulissen mit Tierstimmen brauchen ihre Aufnahmen, bevor sie gebaut werden
  // können. Beim ersten Mal wird geladen, danach liegen sie im Speicher.
  function szeneAn(id) {
    if (szenen[id] || laedt[id] || !ctx) return;

    if (!Klang.bereit(ctx, id)) {
      laedt[id] = true;
      pultAktualisieren();
      Klang.laden(ctx, id).then(function () {
        delete laedt[id];
        pultAktualisieren();
        if (st.an[id] && laeuft) szeneAn(id);
      })['catch'](function (e) {
        delete laedt[id];
        delete st.an[id];
        pultAktualisieren();
        setStatus('Aufnahme für <b>' + NACH_ID[id].name + '</b> lädt nicht – bist du offline?');
      });
      return;
    }

    var g = ctx.createGain();
    g.gain.value = 0;
    g.connect(bus);
    var b = Klang.bauen(id, g, { stereo: st.stereo, tempo: tempoFaktor(id) });
    szenen[id] = { b: b, g: g };
    rampe(g.gain, pegel(id), st.einblenden ? 8 : 0.6);
  }

  // Die Geschwindigkeit geht in den Aufbau ein, also wird die Kulisse
  // neu gebaut. Der kurze Übergang läuft über die übliche Blende.
  function tempoUm(id) {
    var neu = stufe(id) + 1;
    if (neu > 1) neu = -1;
    st.tempo[id] = neu;
    if (szenen[id]) {
      szeneAus(id);
      setTimeout(function () { if (st.an[id] && laeuft) szeneAn(id); }, 260);
    }
    pultAktualisieren();
    speichern();
  }

  function szeneAus(id) {
    delete laedt[id];
    var s = szenen[id];
    if (!s) return;
    delete szenen[id];
    rampe(s.g.gain, 0, 1.2);
    setTimeout(function () {
      s.b.abbau();
      try { s.g.disconnect(); } catch (e) { }
    }, 1500);
  }

  function starten() {
    if (!audioAufbau()) { setStatus('Dieser Browser beherrscht kein Web Audio.'); return; }
    if (!aktiveIds().length) {
      var erste = st.pult[0];
      if (!erste) { blattAuf('bl-bib'); return; }   // leeres Pult: Bibliothek zeigen
      st.an[erste] = true;
      pultAktualisieren(); speichern();
    }

    if (ctx.resume) ctx.resume();
    if (audioEl) { var p = audioEl.play(); if (p && p['catch']) p['catch'](function () { }); }

    aktiveIds().forEach(szeneAn);
    laeuft = true;
    rampe(vol.gain, masterWert(), 0.2);
    timerPlanen();
    setTimeout(ausgabePruefen, 900);
    ui();
    sessionSetzen();
  }

  function stoppen(sanft) {
    laeuft = false;
    Object.keys(szenen).forEach(szeneAus);
    clearTimeout(timer.tid);
    setTimeout(function () {
      if (!laeuft && ctx && ctx.suspend) ctx.suspend();
    }, sanft === false ? 200 : 1700);
    ui();
    sessionSetzen();
  }

  function ausgabePruefen() {
    if (direkt || !laeuft) return;
    var ok = audioEl && !audioEl.paused && audioEl.currentTime > 0;
    if (!ok) aufDirektUmstellen();
  }

  function namenKurz() {
    var namen = aktiveIds().map(function (id) { return NACH_ID[id].name; });
    if (!namen.length) return '';
    if (namen.length <= 2) return namen.join(' + ');
    return namen.length + ' Kulissen';
  }

  function sessionSetzen() {
    if (!('mediaSession' in navigator)) return;
    try {
      if (window.MediaMetadata) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: namenKurz() || 'Soundcape',
          artist: 'Soundcape',
          album: timer.ziel ? 'Timer bis ' + uhrzeit(timer.ziel) : 'Endlos',
          artwork: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
          ]
        });
      }
      navigator.mediaSession.playbackState = laeuft ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('play', function () { starten(); });
      navigator.mediaSession.setActionHandler('pause', function () { stoppen(); });
      navigator.mediaSession.setActionHandler('stop', function () { stoppen(); });
    } catch (e) { }
  }

  /* ==================================================================
   * Timer
   * ================================================================== */
  var timer = { ziel: 0, tid: 0 };

  function timerSetzen(zielMs) {
    timer.ziel = zielMs || 0;
    timerPlanen();
    ui();
    sessionSetzen();
  }

  /* Das Ausblenden wird fest in den Tonpfad geschrieben. Damit läuft es
   * sekundengenau weiter, auch wenn das Handy die JS-Zeitgeber einfriert. */
  function timerPlanen() {
    clearTimeout(timer.tid);
    if (!ctx) return;
    var t = ctx.currentTime;
    try { fade.gain.cancelScheduledValues(t); } catch (e) { }

    if (!timer.ziel) { fade.gain.setValueAtTime(1, t); return; }

    var rest = (timer.ziel - Date.now()) / 1000;
    if (rest <= 0) { timerEnde(); return; }

    var fd = Math.min(st.fadeMin * 60, Math.max(0, rest - 1));
    fade.gain.setValueAtTime(1, t);
    if (rest > fd) fade.gain.setValueAtTime(1, t + (rest - fd));
    if (fd > 0.5) fade.gain.linearRampToValueAtTime(0.0001, t + rest);
    else fade.gain.setValueAtTime(0.0001, t + rest);

    timer.tid = setTimeout(timerEnde, rest * 1000 + 400);
  }

  function timerEnde() {
    timer.ziel = 0;
    clearTimeout(timer.tid);
    stoppen(false);
    if (ctx) { try { fade.gain.cancelScheduledValues(ctx.currentTime); } catch (e) { } fade.gain.value = 1; }
    ui();
    setStatus('Timer abgelaufen – Ton beendet.');   // nach ui(), sonst überschreibt es die Meldung
  }

  function restText() {
    if (!timer.ziel) return '';
    var s = Math.max(0, Math.round((timer.ziel - Date.now()) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
    if (h) return h + ':' + zwei(m) + ':' + zwei(sek);
    return m + ':' + zwei(sek);
  }
  function zwei(n) { return (n < 10 ? '0' : '') + n; }
  function uhrzeit(ms) {
    var d = new Date(ms);
    return zwei(d.getHours()) + ':' + zwei(d.getMinutes());
  }

  /* ==================================================================
   * Oberfläche
   * ================================================================== */
  var $ = function (id) { return document.getElementById(id); };

  function ikonSvg(k, klasse) {
    return '<svg class="' + klasse + '" viewBox="0 0 40 40" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round">' + k.ikon + '</svg>';
  }

  /* ---- Das Pult: die Kacheln auf dem Bildschirm ---- */
  function pultBauen() {
    var raster = $('raster');
    raster.innerHTML = '';

    st.pult.forEach(function (id) {
      var k = NACH_ID[id];
      if (!k) return;
      var el = document.createElement('div');
      el.className = 'kachel';
      el.dataset.id = k.id;
      el.style.setProperty('--k-rgb', k.rgb);
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', k.name + ' – ' + k.unter);
      el.innerHTML =
        '<div class="k-kopf">' + ikonSvg(k, 'k-ikon') +
          '<div><div class="k-name">' + k.name + '</div>' +
          '<div class="k-unter">' + k.unter + '</div></div>' +
        '</div>' +
        '<div class="k-regler">' +
          '<input type="range" min="0" max="100" value="' + st.vol[k.id] + '" ' +
          'aria-label="Lautstärke ' + k.name + '">' +
          '<span class="k-proz">' + st.vol[k.id] + '%</span>' +
        '</div>' +
        '<button class="k-tempo" aria-label="Geschwindigkeit ' + k.name + '">' +
          '<span class="t-s" data-t="-1">›</span>' +
          '<span class="t-s" data-t="0">››</span>' +
          '<span class="t-s" data-t="1">›››</span>' +
        '</button>';

      var regler = el.querySelector('input');
      var proz = el.querySelector('.k-proz');
      var tempoKnopf = el.querySelector('.k-tempo');

      tempoKnopf.addEventListener('click', function (e) {
        e.stopPropagation();       // sonst schaltet die Kachel mit um
        tempoUm(k.id);
      });

      ['pointerdown', 'click', 'touchstart'].forEach(function (ev) {
        regler.addEventListener(ev, function (e) { e.stopPropagation(); },
          ev === 'touchstart' ? { passive: true } : false);
      });
      regler.addEventListener('input', function () {
        st.vol[k.id] = +regler.value;
        proz.textContent = regler.value + '%';
        if (szenen[k.id]) rampe(szenen[k.id].g.gain, pegel(k.id), 0.15);
        farbeSetzen();
        speichern();
      });

      el.addEventListener('click', function () { umschalten(k.id); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); umschalten(k.id); }
      });

      raster.appendChild(el);
    });

    // Kachel zum Öffnen der Bibliothek
    var plus = document.createElement('button');
    plus.className = 'kachel kachel-plus';
    plus.id = 'kachel-plus';
    plus.setAttribute('aria-label', 'Kulissen hinzufügen oder entfernen');
    plus.innerHTML =
      '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' +
      '<path d="M20 12v16M12 20h16"/></svg>' +
      '<span>Kulissen<br>hinzufügen</span>';
    plus.addEventListener('click', function () { blattAuf('bl-bib'); });
    raster.appendChild(plus);

    pultAktualisieren();
  }

  function pultAktualisieren() {
    var kacheln = document.querySelectorAll('.kachel[data-id]');
    for (var i = 0; i < kacheln.length; i++) {
      var el = kacheln[i];
      var id = el.dataset.id;
      var an = !!st.an[id];
      el.classList.toggle('an', an);
      el.classList.toggle('laedt', !!laedt[id]);
      el.setAttribute('aria-pressed', an ? 'true' : 'false');

      var s = stufe(id);
      var knopf = el.querySelector('.k-tempo');
      if (knopf) {
        knopf.title = 'Geschwindigkeit: ' + TEMPO_NAME[String(s)];
        var segmente = knopf.querySelectorAll('.t-s');
        for (var j = 0; j < segmente.length; j++) {
          segmente[j].classList.toggle('gewaehlt', +segmente[j].dataset.t === s);
        }
      }
    }
    farbeSetzen();
  }

  function umschalten(id) {
    if (st.an[id]) {
      delete st.an[id];
      szeneAus(id);
      if (!aktiveIds().length && laeuft) stoppen();
    } else {
      st.an[id] = true;
      if (!laeuft) starten();
      else szeneAn(id);
    }
    pultAktualisieren();
    speichern();
    ui();
    sessionSetzen();
  }

  /* ---- Die Bibliothek: alle Kulissen nach Kategorien ---- */
  function bibliothekBauen() {
    var box = $('bib-liste');
    box.innerHTML = '';

    KATEGORIEN.forEach(function (kat) {
      var drin = KULISSEN.filter(function (k) { return k.kat === kat.id; });
      if (!drin.length) return;

      var h = document.createElement('h3');
      h.textContent = kat.name;
      box.appendChild(h);

      drin.forEach(function (k) {
        var z = document.createElement('button');
        z.className = 'bib-zeile';
        z.dataset.id = k.id;
        z.style.setProperty('--k-rgb', k.rgb);
        z.innerHTML =
          ikonSvg(k, 'bib-ikon') +
          '<span class="bib-text"><span class="bib-name">' + k.name + '</span>' +
          '<span class="bib-unter">' + k.unter + '</span></span>' +
          '<span class="bib-schalter" aria-hidden="true"></span>';
        z.addEventListener('click', function () { pultUm(k.id); });
        box.appendChild(z);
      });
    });
    bibliothekAktualisieren();
  }

  function bibliothekAktualisieren() {
    var zeilen = document.querySelectorAll('.bib-zeile');
    for (var i = 0; i < zeilen.length; i++) {
      var z = zeilen[i];
      var drin = st.pult.indexOf(z.dataset.id) >= 0;
      z.classList.toggle('drin', drin);
      z.setAttribute('aria-pressed', drin ? 'true' : 'false');
    }
    $('bib-zahl').textContent = st.pult.length === 1
      ? '1 Kulisse im Pult'
      : st.pult.length + ' Kulissen im Pult';
  }

  // Kulisse ins Pult legen oder herausnehmen
  function pultUm(id) {
    var i = st.pult.indexOf(id);
    if (i >= 0) {
      st.pult.splice(i, 1);
      if (st.an[id]) {                    // lief sie noch, wird sie mit ausgeschaltet
        delete st.an[id];
        szeneAus(id);
        if (!aktiveIds().length && laeuft) stoppen();
      }
    } else {
      st.pult.push(id);
    }
    pultBauen();
    bibliothekAktualisieren();
    speichern();
    ui();
  }

  // Der Hintergrund nimmt die Farbe der lautesten aktiven Kulisse an.
  function farbeSetzen() {
    var beste = null, bester = -1;
    aktiveIds().forEach(function (id) {
      if (st.vol[id] > bester) { bester = st.vol[id]; beste = id; }
    });
    document.documentElement.style.setProperty(
      '--akzent-rgb', beste ? NACH_ID[beste].rgb : '110,168,255');
  }

  function setStatus(t) { $('status').innerHTML = t; }

  function ui() {
    var btn = $('btn-play');
    btn.classList.toggle('laeuft', laeuft);
    btn.setAttribute('aria-label', laeuft ? 'Pause' : 'Abspielen');
    $('play-ikon').innerHTML = laeuft
      ? '<path d="M8 5h3.4v14H8zM12.6 5H16v14h-3.4z"/>'
      : '<path d="M8 5.5v13l11-6.5z"/>';

    var kurz = namenKurz();
    if (!kurz) setStatus(st.pult.length ? 'Wähle eine Kulisse.' : 'Das Pult ist leer – füge Kulissen hinzu.');
    else if (laeuft && st.master === 0)
      // sonst steht hier "läuft", während nichts zu hören ist
      setStatus('<b>' + kurz + '</b> läuft · Gesamtlautstärke steht auf 0 %');
    else if (laeuft) setStatus('<b>' + kurz + '</b> läuft' + (timer.ziel ? ' · noch ' + restText() : ''));
    else setStatus('<b>' + kurz + '</b> · pausiert');

    $('chip-timer').classList.toggle('aktiv', !!timer.ziel);
    $('chip-timer-txt').textContent = timer.ziel ? restText() : 'Timer';

    $('master').value = st.master;
    $('master-proz').textContent = st.master + ' %';

    $('timer-lage').textContent = timer.ziel
      ? 'Der Ton endet um ' + uhrzeit(timer.ziel) + ' Uhr.'
      : 'Der Ton läuft, bis du ihn beendest.';
    $('timer-uhr').textContent = timer.ziel ? restText() : '–';
    $('timer-uhr-unter').textContent = timer.ziel
      ? (st.fadeMin > 0 ? 'letzte ' + st.fadeMin + ' Min. langsam leiser' : 'ohne Ausblenden')
      : 'kein Timer gesetzt';
  }

  /* ---- Blätter ---- */
  function blattAuf(id) { $(id).classList.add('offen'); }
  function blattZu(id) { $(id).classList.remove('offen'); }
  function blattVerdrahten(id) {
    $(id).addEventListener('click', function (e) { if (e.target === $(id)) blattZu(id); });
  }

  /* ---- Wake Lock ---- */
  function wachSetzen(an) {
    if (an && navigator.wakeLock) {
      navigator.wakeLock.request('screen').then(function (l) {
        wl = l;
        l.addEventListener('release', function () { wl = null; });
      })['catch'](function () { });
    } else if (!an && wl) {
      try { wl.release(); } catch (e) { }
      wl = null;
    }
  }

  /* ==================================================================
   * Start
   * ================================================================== */
  function init() {
    laden();
    pultBauen();
    bibliothekBauen();
    ui();

    $('version').textContent = 'Soundcape ' + APP_VERSION;
    $('version2').textContent = 'Soundcape ' + APP_VERSION;

    $('btn-play').addEventListener('click', function () {
      if (laeuft) stoppen(); else starten();
    });

    $('master').addEventListener('input', function () {
      st.master = +$('master').value;
      $('master-proz').textContent = st.master + ' %';
      if (ctx) rampe(vol.gain, masterWert(), 0.1);
      // Statuszeile auffrischen, wenn die Stummstellung beginnt *oder endet* –
      // sonst bliebe der Hinweis nach dem Wiederaufdrehen stehen.
      var stumm = (st.master === 0);
      if (laeuft && (stumm || warStumm)) ui();
      warStumm = stumm;
      speichern();
    });

    $('chip-mix').addEventListener('click', function () {
      var welche = aktiveIds();
      if (welche.length) {
        welche.forEach(function (id) { delete st.an[id]; szeneAus(id); });
        if (laeuft) stoppen();
      }
      pultAktualisieren(); speichern(); ui();
    });

    $('chip-bib').addEventListener('click', function () { blattAuf('bl-bib'); });

    /* ---- Bibliothek ---- */
    $('bib-fertig').addEventListener('click', function () { blattZu('bl-bib'); });
    blattVerdrahten('bl-bib');

    /* ---- Timer-Blatt ---- */
    $('chip-timer').addEventListener('click', function () { ui(); blattAuf('bl-timer'); });
    $('timer-fertig').addEventListener('click', function () { blattZu('bl-timer'); });
    $('timer-aus').addEventListener('click', function () { timerSetzen(0); });
    blattVerdrahten('bl-timer');

    var chips = $('timer-chips');
    [15, 30, 45, 60, 90, 120, 240].forEach(function (min) {
      var c = document.createElement('button');
      c.className = 'chip';
      c.textContent = min < 60 ? min + ' Min.' : (min / 60) + ' Std.';
      c.addEventListener('click', function () {
        timerSetzen(Date.now() + min * 60000);
        if (!laeuft) starten();
      });
      chips.appendChild(c);
    });

    $('timer-min-ok').addEventListener('click', function () {
      var m = parseInt($('timer-min').value, 10);
      if (m > 0) { timerSetzen(Date.now() + m * 60000); if (!laeuft) starten(); }
    });

    $('timer-zeit-ok').addEventListener('click', function () {
      var w = $('timer-zeit').value;
      if (!w) return;
      var teile = w.split(':');
      var d = new Date();
      d.setHours(+teile[0], +teile[1], 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);   // heute schon vorbei → morgen
      timerSetzen(d.getTime());
      if (!laeuft) starten();
    });

    /* ---- Einstellungen ---- */
    $('btn-einst').addEventListener('click', function () { blattAuf('bl-einst'); });
    $('einst-fertig').addEventListener('click', function () { blattZu('bl-einst'); });
    blattVerdrahten('bl-einst');

    $('btn-info').addEventListener('click', function () { blattAuf('bl-info'); });
    $('info-fertig').addEventListener('click', function () { blattZu('bl-info'); });
    blattVerdrahten('bl-info');

    function knebel(id, wert, beim) {
      var b = $(id);
      function zeigen() {
        b.classList.toggle('an', !!wert());
        b.setAttribute('aria-checked', wert() ? 'true' : 'false');
      }
      b.addEventListener('click', function () { beim(!wert()); zeigen(); speichern(); });
      zeigen();
    }
    knebel('sw-wach', function () { return st.wach; }, function (v) { st.wach = v; wachSetzen(v); });
    knebel('sw-einblenden', function () { return st.einblenden; }, function (v) { st.einblenden = v; });
    knebel('sw-stereo', function () { return st.stereo; }, function (v) { st.stereo = v; });

    $('fade-min').value = st.fadeMin;
    $('fade-min').addEventListener('input', function () {
      var v = parseInt($('fade-min').value, 10);
      st.fadeMin = isNaN(v) ? 0 : Math.max(0, Math.min(30, v));
      timerPlanen();
      speichern(); ui();
    });

    $('pult-zuruecksetzen').addEventListener('click', function () {
      st.pult = PULT_STANDARD.slice();
      Object.keys(st.an).forEach(function (id) {
        if (st.pult.indexOf(id) < 0) { delete st.an[id]; szeneAus(id); }
      });
      pultBauen(); bibliothekAktualisieren(); speichern(); ui();
    });

    if (st.wach) wachSetzen(true);

    setInterval(function () {
      if (timer.ziel) {
        if (timer.ziel - Date.now() <= 0) timerEnde();
        else ui();
      }
    }, 1000);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (st.wach && !wl) wachSetzen(true);
      if (laeuft && ctx && ctx.state === 'suspended') ctx.resume();
      if (timer.ziel && timer.ziel - Date.now() <= 0) timerEnde();
      ui();
    });

    var hinweis = $('tonhinweis');
    setInterval(function () {
      hinweis.style.display = (ctx && ctx.state === 'suspended' && laeuft) ? 'block' : 'none';
    }, 1200);
    document.addEventListener('pointerdown', function () {
      if (ctx && ctx.state === 'suspended' && laeuft) {
        ctx.resume();
        if (audioEl) { var p = audioEl.play(); if (p && p['catch']) p['catch'](function () { }); }
      }
    });

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js')['catch'](function () { });
      });
    }

    // Für Messungen aus der Konsole
    window.__sc = {
      st: st, KULISSEN: KULISSEN, KATEGORIEN: KATEGORIEN,
      zustand: function () {
        return {
          laeuft: laeuft, ctx: ctx && ctx.state, direkt: direkt,
          pult: st.pult.slice(),   // Kopie: sonst zeigen alte Messwerte den Endstand
          aktiv: aktiveIds(), szenen: Object.keys(szenen),
          timer: timer.ziel ? restText() : null,
          audioEl: audioEl ? { paused: audioEl.paused, t: audioEl.currentTime } : null
        };
      },
      // misst den tatsächlichen Pegel am Ausgang – belegt, dass Ton fließt
      pegelJetzt: function (ms) {
        return new Promise(function (fertig) {
          if (!ctx) return fertig(null);
          var an = ctx.createAnalyser();
          an.fftSize = 2048;
          limit.connect(an);
          var daten = new Float32Array(an.fftSize);
          var max = 0, summe = 0, n = 0;
          var takt = setInterval(function () {
            an.getFloatTimeDomainData(daten);
            var s = 0;
            for (var i = 0; i < daten.length; i++) {
              s += daten[i] * daten[i];
              if (Math.abs(daten[i]) > max) max = Math.abs(daten[i]);
            }
            summe += Math.sqrt(s / daten.length); n++;
          }, 50);
          setTimeout(function () {
            clearInterval(takt);
            try { limit.disconnect(an); } catch (e) { }
            fertig({ rms: +(summe / Math.max(1, n)).toFixed(4), peak: +max.toFixed(3), messungen: n });
          }, ms || 2000);
        });
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
