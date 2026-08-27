/* Soundcape – Bedienung, Wiedergabe, Timer
 * Die Klangerzeugung selbst steht in sound.js.
 */
(function () {
  'use strict';

  var APP_VERSION = '1.0';
  var LS = 'soundcape-zustand';

  /* ==================================================================
   * Die Kulissen (Anzeige – die Klangbauteile stehen in sound.js)
   * ================================================================== */
  var KULISSEN = [
    {
      id: 'regen', name: 'Regen', unter: 'Gleichmäßiger Landregen', rgb: '110,168,255',
      ikon: '<path d="M12 20a6 6 0 0 1 1.4-11.8A7.5 7.5 0 0 1 27.6 11 5 5 0 0 1 27 20z"/>' +
            '<path d="M13 25l-1.6 5M20 25l-1.6 5M27 25l-1.6 5"/>'
    },
    {
      id: 'gewitter', name: 'Regen & Donner', unter: 'Mit fernem Grollen', rgb: '150,140,240',
      ikon: '<path d="M12 19a6 6 0 0 1 1.4-11.8A7.5 7.5 0 0 1 27.6 10 5 5 0 0 1 27 19z"/>' +
            '<path d="M12.5 24l-1.4 4.5M27.5 24l-1.4 4.5"/>' +
            '<path d="M21 22.5l-4.5 6h4l-2 5.5 6-7.5h-4z" stroke-linejoin="round"/>'
    },
    {
      id: 'strand', name: 'Strand', unter: 'Wellen und Brandung', rgb: '84,198,214',
      ikon: '<circle cx="27.5" cy="11" r="4"/>' +
            '<path d="M5 24c3.2 0 3.2-2.6 6.4-2.6S14.6 24 17.8 24s3.2-2.6 6.4-2.6S27.4 24 30.6 24 34 21.4 35 21.4"/>' +
            '<path d="M5 31c3.2 0 3.2-2.6 6.4-2.6S14.6 31 17.8 31s3.2-2.6 6.4-2.6S27.4 31 30.6 31 34 28.4 35 28.4"/>'
    },
    {
      id: 'fluss', name: 'Fluss', unter: 'Über Wasser', rgb: '92,204,152',
      ikon: '<path d="M9 5c0 8 6 10 6 16s-5 8-5 14M31 5c0 8-6 10-6 16s5 8 5 14"/>' +
            '<path d="M15.5 14c1.6 0 1.6 1.6 3.2 1.6s1.6-1.6 3.2-1.6M14 26c1.8 0 1.8 1.6 3.6 1.6S19.4 26 21.2 26"/>'
    },
    {
      id: 'unterwasser', name: 'Unter Wasser', unter: 'Dumpf, mit Blasen', rgb: '74,146,214',
      ikon: '<path d="M4 9c3.2 0 3.2-2.4 6.4-2.4S13.6 9 16.8 9s3.2-2.4 6.4-2.4S26.4 9 29.6 9 33 6.6 36 6.6"/>' +
            '<circle cx="13" cy="27" r="4.5"/><circle cx="24.5" cy="19.5" r="3"/><circle cx="27" cy="30" r="2"/>'
    },
    {
      id: 'wind', name: 'Wind', unter: 'Böen und Säuseln', rgb: '162,180,204',
      ikon: '<path d="M4 13h17a4.5 4.5 0 1 0-4.5-4.5"/>' +
            '<path d="M4 21h22a5 5 0 1 1-5 5"/>' +
            '<path d="M4 29h11.5a3.6 3.6 0 1 1-3.6 3.6"/>'
    },
    {
      id: 'feuer', name: 'Lagerfeuer', unter: 'Knistern und Glut', rgb: '245,150,78',
      ikon: '<path d="M20 4c1 6-5 7.5-5 13a5 5 0 0 0 10 0c0-2-1-3.2-1-3.2 3.5 2.2 6 5.6 6 9.7a10 10 0 1 1-20 0C10 15 20 13 20 4z" stroke-linejoin="round"/>'
    },
    {
      id: 'grillen', name: 'Grillen', unter: 'Sommernacht', rgb: '196,206,112',
      ikon: '<path d="M26 5a12 12 0 1 0 9.5 14.6A9.5 9.5 0 0 1 26 5z" stroke-linejoin="round"/>' +
            '<path d="M8 30c1.5-1.6 1.5-4.4 0-6M12.5 31.5c2.4-2.4 2.4-7.6 0-10"/>'
    }
  ];
  var NACH_ID = {};
  KULISSEN.forEach(function (k) { NACH_ID[k.id] = k; });

  /* ==================================================================
   * Zustand
   * ================================================================== */
  var st = {
    master: 70,
    vol: {},              // id -> 0..100
    an: {},               // id -> true
    fadeMin: 1,           // Ausblenden am Timer-Ende, in Minuten
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
      if (g.an) for (var id2 in g.an) if (NACH_ID[id2] && g.an[id2]) st.an[id2] = true;
      if (typeof g.fadeMin === 'number') st.fadeMin = g.fadeMin;
      if (typeof g.wach === 'boolean') st.wach = g.wach;
      if (typeof g.einblenden === 'boolean') st.einblenden = g.einblenden;
      if (typeof g.stereo === 'boolean') st.stereo = g.stereo;
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
  var szenen = {};          // id -> {b, g}
  var laeuft = false;
  var wl = null;            // Wake Lock

  function aktiveIds() {
    return KULISSEN.filter(function (k) { return st.an[k.id]; }).map(function (k) { return k.id; });
  }
  function pegel(id) {
    return (st.vol[id] / 100) * (Klang.ausgleich[id] || 1);
  }
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

    // Bremse gegen Übersteuern, wenn mehrere Kulissen zugleich laufen
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

  // Falls der Stream-Weg nicht anspringt (kommt auf manchen Geräten vor):
  // direkt ausgeben und das <audio>-Element mit einer stillen Schleife als
  // Anker für die Medien-Session behalten.
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
    for (var i = 0; i < n; i++) dv.setInt16(44 + i * 2, (i % 2) ? 1 : -1, true);  // knapp über null
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function rampe(param, ziel, sek) {
    var t = ctx.currentTime;
    var jetzt = param.value;
    try { param.cancelScheduledValues(t); } catch (e) { }
    param.setValueAtTime(jetzt, t);
    param.linearRampToValueAtTime(ziel, t + Math.max(0.02, sek));
  }

  function szeneAn(id) {
    if (szenen[id] || !ctx) return;
    var g = ctx.createGain();
    g.gain.value = 0;
    g.connect(bus);
    var b = Klang.bauen(id, g, { stereo: st.stereo });
    szenen[id] = { b: b, g: g };
    rampe(g.gain, pegel(id), st.einblenden ? 8 : 0.6);
  }

  function szeneAus(id) {
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
    if (!aktiveIds().length) { st.an['regen'] = true; kachelnAktualisieren(); speichern(); }

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

  function sessionSetzen() {
    if (!('mediaSession' in navigator)) return;
    try {
      var namen = aktiveIds().map(function (id) { return NACH_ID[id].name; });
      if (window.MediaMetadata) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: namen.length ? namen.join(' + ') : 'Soundcape',
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

  function kachelnBauen() {
    var raster = $('raster');
    raster.innerHTML = '';
    KULISSEN.forEach(function (k) {
      var el = document.createElement('div');
      el.className = 'kachel';
      el.dataset.id = k.id;
      el.style.setProperty('--k-rgb', k.rgb);
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', k.name + ' – ' + k.unter);
      el.innerHTML =
        '<div class="k-kopf">' +
          '<svg class="k-ikon" viewBox="0 0 40 40" fill="none" stroke="currentColor" ' +
          'stroke-width="2" stroke-linecap="round">' + k.ikon + '</svg>' +
          '<div><div class="k-name">' + k.name + '</div>' +
          '<div class="k-unter">' + k.unter + '</div></div>' +
        '</div>' +
        '<div class="k-regler">' +
          '<input type="range" min="0" max="100" value="' + st.vol[k.id] + '" ' +
          'aria-label="Lautstärke ' + k.name + '">' +
          '<span class="k-proz">' + st.vol[k.id] + '%</span>' +
        '</div>';

      var regler = el.querySelector('input');
      var proz = el.querySelector('.k-proz');

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
    kachelnAktualisieren();
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
    kachelnAktualisieren();
    speichern();
    ui();
    sessionSetzen();
  }

  function kachelnAktualisieren() {
    var kacheln = document.querySelectorAll('.kachel');
    for (var i = 0; i < kacheln.length; i++) {
      var el = kacheln[i];
      var an = !!st.an[el.dataset.id];
      el.classList.toggle('an', an);
      el.setAttribute('aria-pressed', an ? 'true' : 'false');
    }
    farbeSetzen();
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
    // Play-Knopf
    var btn = $('btn-play');
    btn.classList.toggle('laeuft', laeuft);
    btn.setAttribute('aria-label', laeuft ? 'Pause' : 'Abspielen');
    $('play-ikon').innerHTML = laeuft
      ? '<path d="M8 5h3.4v14H8zM12.6 5H16v14h-3.4z"/>'
      : '<path d="M8 5.5v13l11-6.5z"/>';

    // Status
    var namen = aktiveIds().map(function (id) { return NACH_ID[id].name; });
    if (!namen.length) setStatus('Wähle eine Kulisse.');
    else if (laeuft) setStatus('<b>' + namen.join(' + ') + '</b> läuft' +
      (timer.ziel ? ' · noch ' + restText() : ''));
    else setStatus('<b>' + namen.join(' + ') + '</b> · pausiert');

    // Timer-Chip
    $('chip-timer').classList.toggle('aktiv', !!timer.ziel);
    $('chip-timer-txt').textContent = timer.ziel ? restText() : 'Timer';

    // Master
    $('master').value = st.master;
    $('master-proz').textContent = st.master + ' %';

    // Timer-Blatt
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
    kachelnBauen();
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
      speichern();
    });

    $('chip-mix').addEventListener('click', function () {
      var welche = aktiveIds();
      if (welche.length) {
        welche.forEach(function (id) { delete st.an[id]; szeneAus(id); });
        if (laeuft) stoppen();
      }
      kachelnAktualisieren(); speichern(); ui();
    });

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

    if (st.wach) wachSetzen(true);

    /* ---- Sekundentakt für die Anzeige ---- */
    setInterval(function () {
      if (timer.ziel) {
        if (timer.ziel - Date.now() <= 0) timerEnde();
        else ui();
      }
    }, 1000);

    /* ---- Rückkehr aus dem Hintergrund ---- */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (st.wach && !wl) wachSetzen(true);
      if (laeuft && ctx && ctx.state === 'suspended') ctx.resume();
      if (timer.ziel && timer.ziel - Date.now() <= 0) timerEnde();
      ui();
    });

    /* ---- Hinweis, solange der Ton noch gesperrt ist ---- */
    var hinweis = $('tonhinweis');
    function tonPruefen() {
      var gesperrt = ctx && ctx.state === 'suspended' && laeuft;
      hinweis.style.display = gesperrt ? 'block' : 'none';
    }
    setInterval(tonPruefen, 1200);
    document.addEventListener('pointerdown', function () {
      if (ctx && ctx.state === 'suspended' && laeuft) {
        ctx.resume();
        if (audioEl) { var p = audioEl.play(); if (p && p['catch']) p['catch'](function () { }); }
      }
    });

    /* ---- Service Worker ---- */
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js')['catch'](function () { });
      });
    }

    // Für Messungen aus der Konsole (Pegelabgleich der Kulissen)
    window.__sc = {
      st: st, KULISSEN: KULISSEN,
      zustand: function () {
        return {
          laeuft: laeuft, ctx: ctx && ctx.state, direkt: direkt,
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
