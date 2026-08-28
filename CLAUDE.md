# Soundcape

Browser-App (PWA): wählbare Geräuschkulissen als endlose Hintergrundbeschallung.
Gedacht als angenehmer Klangteppich, der störende Umgebungsgeräusche überdeckt – oft an einer
Bluetooth-Box. **Deutsch ist die Quellsprache** (Code, Kommentare, Oberfläche).

## Live

- **Gehört wird hier:** https://rianvegeta1991.github.io/soundcape/
- **Repo:** https://github.com/rianvegeta1991/soundcape
- Deploy = `git push origin main` → Workflow `.github/workflows/pages.yml`
  („Seite veroeffentlichen"), typisch in ~25 Sekunden. Von Hand: `gh workflow run pages.yml`.
- Pages läuft über **GitHub Actions** (`build_type=workflow`), nicht über „Deploy from a branch" –
  siehe Fallstricke im Schwesterprojekt `rule-detection`.
- **Auf dem Handy:** Seite im Browser öffnen → „Zum Startbildschirm hinzufügen". Danach eigenes
  Icon, Vollbild, offline. HTTPS ist dafür Pflicht – über `serve-lan.ps1` im WLAN funktioniert
  zwar der Ton, aber weder Service Worker noch Installation (kein sicherer Kontext).

## Der eine wichtige Grundsatz

**Alles außer den Tierstimmen wird live erzeugt** – aus Rauschen, Filtern und Steuerkurven
(Web Audio), ohne Audiodateien. Das ist kein Selbstzweck:

- **Keine Wiederholung.** Statt eines 60–90-s-Loops, dessen Naht man irgendwann hört, steuern
  Summen von Sinuskurven mit gegeneinander verstimmten Frequenzen den Klang. Ihre Perioden passen
  nicht zusammen, das Gesamtbild kehrt praktisch nie wieder.
- **Kulissen sind isoliert.** Hinter den Grillen liegt kein Rauschteppich, hinter dem Donner kein
  Regen. Nur wo das Rauschen selbst die Quelle ist (Regen, Brandung, Wind), gehört es dazu.
  Gemischt wird im Pult – deshalb darf keine Kulisse ihren eigenen Hintergrund mitbringen.
- **Läuft im Schlaf weiter.** JS-Zeitgeber (`setTimeout`/`setInterval`) werden gedrosselt, sobald
  das Handy den Bildschirm sperrt – der Audiograph nicht. Deshalb steht in `sound.js` **kein
  einziger Zeitgeber**: alles, was sich über die Zeit ändert, ist als Signal im Graphen gebaut.
  **Diese Regel nicht aufweichen** – ein setTimeout im Klangpfad bringt genau das Stottern
  zurück, das die Bauart vermeidet.
- Winzig, offlinefähig, keine Urheberrechtsfrage.

**Die Ausnahme: Tierstimmen.** Sie sind keine Rauschprozesse, sondern hochstrukturierte
Signale – synthetisch klingen sie unweigerlich nach Pfeifton. Das war der Befund aus der
Praxis, nicht aus der Theorie: Version 1.1 hatte alle sieben Tierkulissen synthetisch, und
sie klangen durchweg unecht. Seit 1.2 liegen dafür **gemeinfreie Aufnahmen** bei
(`audio/`, Public Domain und CC0, Nachweise in `audio/QUELLEN.md`).

Damit trotzdem keine Schleife hörbar wird, sind die Dateien **keine fertigen Loops**: Aus
jeder Aufnahme sind die brauchbaren Rufe als Zeitmarken vermessen (`PROBEN` in sound.js),
abgespielt werden einzelne Rufe in zufälliger Folge mit zufälliger Pause, Lautstärke,
Position und Tonhöhe. Die Dateien selbst bleiben unverändert – gelesen wird über
`start(zeit, offset, dauer)`.

## Dateien

| Datei | Rolle |
|---|---|
| `index.html` | Markup + CSS, keine Logik |
| `sound.js` | **Klangmaschine.** `Klang.bauen(id, ziel, opt)` hängt eine Kulisse an einen Knoten |
| `app.js` | Bedienung, Wiedergabe, Timer, Speicherung, PWA |
| `sw.js` | Service Worker (Netz zuerst, Cache als Rückfalllinie) |
| `manifest.webmanifest`, `icon*.png/svg` | PWA-Beiwerk |
| `serve.ps1` | lokaler Server (PowerShell-`HttpListener`, kein Node) |

Versionsnummer: `APP_VERSION` in `app.js`. Bei Dateiänderungen die `CACHE`-Version in `sw.js`
hochzählen (`soundcape-vN`).

## Aufbau der Klangmaschine (`sound.js`)

`bauer(ziel, opt)` ist die Werkzeugkiste, die jede Kulisse benutzt; sie merkt sich alle Knoten
für den sauberen Abbau (`abbau()`). Die tragenden Bausteine:

- `rausch(braun, rate)` – Schleife über einen 20-s-Rauschpuffer, mit zufälligem Einstiegspunkt und
  leicht verstimmter Abspielrate. Deshalb laufen mehrere Quellen nie synchron und der Puffer ist
  als Schleife nicht zu hören.
- `steuer(mitte, tiefe, tempo)` – langsam wanderndes Signal aus drei verstimmten Sinuskurven.
  **Das ist der Kern der Endlosigkeit.**
- `selten(tempo, schwelle, exp)` – dasselbe über einen Waveshaper geschwellt: unregelmäßige
  Ereignisbögen für Donner, Wellenkämme, Windpfeifen.
- `takt(hz, breite, exp)` – **gleichmäßiger** Puls, wo Regelmäßigkeit dazugehört:
  Schienenstöße, Schnurren (25 Hz), Schnarchen (38 Hz), Delfinklicks.
- `funken(bw, verst, schw)` – tiefpassgefiltertes Rauschen über eine hohe Schwelle ergibt kurze
  Anregungsimpulse. Die Bandbreite bestimmt die Rate. Die Verstärkung ist **auf 48 kHz normiert**,
  sonst knisterte es auf einem 44,1-kHz-Gerät anders.
- `torLang(bw, schw)` – dasselbe für **lange, seltene** Ereignisse (Tierrufe, Walgesang).
  Hier normiert die Funktion zusätzlich auf die Bandbreite. **Das ist der Grund für ihre Existenz:**
  `funken` ist auf Bandbreiten um 900 Hz kalibriert; bei den 0,5–40 Hz eines Rufs ist die
  Amplitude hinter dem Tiefpass so klein, dass die Schwelle nie erreicht wird – die Vogelstimmen
  waren damit zunächst vollständig stumm (gemessen: RMS 0).
- `knister(...)` – Rauschen, von `funken` aufgetort, durch einen resonanten Bandpass: Knistern,
  Tropfen, Blasen, Kies.
- `ruf({f, hub, tempo, laenge, dichte, phrase, rau, triller, pegel, pan, ziel})` – eine Tierstimme:
  Ton mit gleitender Tonhöhe, von `torLang` zu Rufen zerteilt und von `selten` zu Phrasen gruppiert.
  `rau` schaltet von reinem Ton auf schmalbandiges Rauschen um (Papagei statt Meise).
- `atem(node, mitte, tiefe, tempo)` – Lautstärke, die langsam um einen Mittelwert schwankt.
- `raus(node, pegel, pan)` – Schicht an den Ausgang hängen.

### Aufnahmen abspielen

- `rufe({probe, pegel, pause, rate, breite, ziel})` – einzelne Rufe in zufälliger Folge.
  Geplant wird **zwei Minuten im Voraus** über `start(zeitpunkt)`; nachgelegt alle 30 s.
  Der Zeitgeber ist hier unbedenklich, weil Web Audio die Zeitpunkte auch dann exakt
  einhält, wenn das Handy die JS-Timer längst eingefroren hat – anders als ein Zeitgeber
  *im* Klangpfad. **Diesen Vorlauf nicht verkleinern.**
- `schleife({probe, segment, rate, pegel, pan})` – für Dauergeräusche (Schnurren, Zirpen).
- `Klang.laden(ctx, id)` / `Klang.bereit(ctx, id)` – app.js holt die Aufnahmen, bevor eine
  Kulisse gebaut wird; solange trägt die Kachel die Klasse `laedt`.
- Der Puffercache ist **nach Abtastrate getrennt** (`name@48000`): `decodeAudioData` rechnet
  auf die Rate des Kontexts um, ein Puffer aus einem 48-kHz-Kontext liefe in einem
  44,1-kHz-Kontext zu schnell und zu hoch.
- Die MP3s stehen **nicht** in der `ASSETS`-Liste des Service Workers – 9 MB beim Installieren
  wären unhöflich. Der fetch-Handler legt sie beim ersten Abspielen in den Cache; offline
  verfügbar sind also die Kulissen, die schon einmal liefen.

23 Kulissen in sechs Kategorien (siehe `KATEGORIEN`/`KULISSEN` in app.js). Die Zuordnung
id → Baufunktion steht in `Klang.szenen`; **beide Listen müssen deckungsgleich bleiben.**

### Pegel

`Klang.ausgleich` gleicht die Kulissen auf ähnliche Lautheit an. Die Werte sind **gemessen**, nicht
geschätzt – nach jeder Klangänderung neu messen (siehe „Testen"). Die Regel lautet

```
ausgleich = min(0,09 / rms,  0,72 / peak)
```

also: auf RMS 0,09 zielen, aber nie so weit, dass die Spitzen 0,72 reißen. Der zweite Teil ist
nötig, weil die stark schwankenden Kulissen (Donner, Grillen, Tierrufe) bei reiner RMS-Normierung
übersteuern – sie sind die meiste Zeit still und dann sehr laut.

Achtung bei schmalbandigen Schichten (Grillen): zwei Bandpässe mit hohem Q lassen nur einen
Bruchteil der Rauschenergie durch. Ein scheinbar hoher Pegel (1,3) ist dort richtig – das war
schon einmal ein Fehler, die Grillen waren dadurch fast unhörbar und praktisch mono.

## Pult und Bibliothek (`app.js`)

Zwei Ebenen: `KULISSEN` ist die **Bibliothek** (alle 23, mit Kategorie, Farbe und Icon),
`st.pult` die **Auswahl auf dem Bildschirm**. Nur was im Pult liegt, kann klingen.

- `pultBauen()` zeichnet die Kacheln plus die gestrichelte „+"-Kachel, `bibliothekBauen()` die
  Liste im Blatt `#bl-bib`.
- `pultUm(id)` legt eine Kulisse aufs Pult oder nimmt sie herunter – läuft sie dabei noch,
  wird sie mit ausgeschaltet.
- `umschalten(id)` ist das An/Aus **innerhalb** des Pults.
- Gespeichert wird `pult` mit; alte Stände aus Version 1.0 (nur `an`) werden beim Laden
  übernommen, `gewitter` wird dabei zu `donner`.

## Wiedergabe im Hintergrund (`app.js`)

Der Ton geht **nicht** an `ctx.destination`, sondern über `createMediaStreamDestination()` in ein
`<audio>`-Element. Nur so behandelt das Betriebssystem ihn als Medienwiedergabe: Sperrbildschirm,
Bluetooth-Tasten, kein Abwürgen beim Bildschirm-Aus. Dazu `navigator.mediaSession` mit Metadaten
und Handlern für play/pause/stop.

Springt der Stream-Weg nicht an (kommt auf manchen Geräten vor), schaltet `aufDirektUmstellen()`
auf `ctx.destination` und hält im `<audio>`-Element eine **stille Schleife** als Anker für die
Medien-Session (als Blob erzeugt, keine externe Datei). Geprüft wird 900 ms nach dem Start über
`audioEl.currentTime > 0`.

Signalweg: Kulissen → je ein Gain → `bus` → `vol` (Regler, quadratisch) → `fade` (Timer) →
`DynamicsCompressor` (Bremse gegen Übersteuern beim Mischen) → Ausgabe.

## Timer

Dauer-Chips, freie Minutenzahl oder Enduhrzeit (liegt sie in der Vergangenheit, gilt sie für
morgen). Das Ausblenden wird als **AudioParam-Automation** geplant (`timerPlanen`), nicht per
Zeitgeber – so blendet es sekundengenau aus, auch wenn das Handy die JS-Zeitgeber einfriert.
Der zusätzliche `setTimeout` beendet nur noch den bereits stummen Ton; `visibilitychange` fängt
den Fall ab, dass er zu spät feuert.

## Testen

Screenshots der laufenden App können in einen Timeout laufen (Dauer-Animationen im Hintergrund).
Stattdessen per DOM auslesen (`javascript_tool`) – `window.__sc.zustand()` gibt Wiedergabezustand,
aktive Kulissen und Timer zurück.

**Klang prüft man nicht durch Hinhören, sondern durch Messen:** eine Kulisse in einen
`OfflineAudioContext` rendern und auswerten – RMS, Spitzenwert, Block-RMS (atmet die Kulisse?),
Stereobreite, und für Donner/Wellen/Böen die Ereignisrate in einem Frequenzband über 300 s.
So sind die Fehler „Grillen zu leise/mono" und „Unter Wasser doppelt so laut" gefunden worden.

Lokaler Server: `.claude/launch.json`, Eintrag `soundcape` auf **Port 8794**.

## Fallstricke

- **Pages muss im frischen Repo einmal aktiviert werden.** Der erste Deploy scheiterte an
  „Get Pages site failed", der zweite mit `enablement: true` an „Resource not accessible by
  integration": das GITHUB_TOKEN darf eine Pages-Site nicht *anlegen*, solange die
  Workflow-Rechte des Repos auf `read` stehen (`gh api repos/OWNER/REPO/actions/permissions/workflow`).
  Gelöst mit `gh api -X POST repos/OWNER/REPO/pages -f build_type=workflow`. Zum reinen
  *Deployen* reicht das Token danach.
- Screenshots der laufenden App laufen in einen Timeout (Dauer-Animationen) – per DOM auslesen.

## Was bewusst offen ist

- Nur Deutsch – die Zweisprachigkeit des Regel-Detektivs ist hier nicht nachgebaut.
- Kein APK. Eine TWA/Capacitor-Hülle wäre nur ein Browser-Wrapper um denselben Code und
  brächte fürs Hintergrund-Audio nichts; falls Android die Wiedergabe doch mal abwürgt, ließe
  sich über pwabuilder.com aus der Pages-URL eine installierbare APK erzeugen.
- Die Kulissen sind austauschbar gedacht: eine neue kommt als Eintrag in `Klang.szenen`
  plus Metadaten in `KULISSEN` (app.js) dazu.

## Lizenzen für Aufnahmen

Bastian hat **CC-BY und CC-BY-SA freigegeben** (seit v1.3), zusätzlich zu gemeinfrei und CC0.
NC-Lizenzen stellen sich nicht: Wikimedia Commons nimmt sie grundsätzlich nicht auf.

Daraus folgt eine **Pflicht**: Bei CC-BY(-SA) muss genannt werden. Das geschieht an zwei
Stellen – `audio/QUELLEN.md` (vollständig, mit Lizenz und Verweis) und im Info-Blatt der App
(Namensliste). **Beim Hinzufügen einer Aufnahme beide Stellen nachziehen.**

Was die Lockerung gebracht hat: bei Vögeln etwa zehnmal so viel Auswahl (Amsel 5 → 45 Treffer),
und afrikanische Vogelstimmen wurden überhaupt erst möglich (0 → 50). Die großen Vogelbestände
stammen von xeno-canto.org und stehen dort fast durchweg unter CC-BY-SA.
