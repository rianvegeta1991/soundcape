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

**Es gibt keine Audiodateien.** Jede Kulisse wird live im Browser aus Rauschen, Filtern und
Steuerkurven erzeugt (Web Audio). Das ist kein Selbstzweck:

- **Keine Wiederholung.** Statt eines 60–90-s-Loops, dessen Naht man irgendwann hört, steuern
  Summen von Sinuskurven mit gegeneinander verstimmten Frequenzen den Klang. Ihre Perioden passen
  nicht zusammen, das Gesamtbild kehrt praktisch nie wieder.
- **Läuft im Schlaf weiter.** JS-Zeitgeber (`setTimeout`/`setInterval`) werden gedrosselt, sobald
  das Handy den Bildschirm sperrt – der Audiograph nicht. Deshalb steht in `sound.js` **kein
  einziger Zeitgeber**: alles, was sich über die Zeit ändert, ist als Signal im Graphen gebaut.
  **Diese Regel nicht aufweichen** – ein setTimeout im Klangpfad bringt genau das Stottern
  zurück, das die Bauart vermeidet.
- Winzig, offlinefähig, keine Urheberrechtsfrage.

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
- `funken(bw, verst, schw)` – tiefpassgefiltertes Rauschen über eine hohe Schwelle ergibt kurze
  Anregungsimpulse. Die Bandbreite bestimmt die Rate. Die Verstärkung ist **auf 48 kHz normiert**,
  sonst knisterte es auf einem 44,1-kHz-Gerät anders.
- `knister(...)` – Rauschen, von `funken` aufgetort, durch einen resonanten Bandpass: Knistern,
  Tropfen, Blasen, Kies.
- `atem(node, mitte, tiefe, tempo)` – Lautstärke, die langsam um einen Mittelwert schwankt.
- `raus(node, pegel, pan)` – Schicht an den Ausgang hängen.

Acht Kulissen: `regen`, `gewitter`, `strand`, `fluss`, `unterwasser`, `wind`, `feuer`, `grillen`.
Regen und Gewitter teilen sich `regenSchichten()`.

### Pegel

`Klang.ausgleich` gleicht die Kulissen auf ähnliche Lautheit an. Die Werte sind **gemessen**, nicht
geschätzt – nach jeder Klangänderung neu messen (siehe „Testen"). Zielgröße: RMS um 0,09 bei
Vollpegel, Spitzen unter 0,7.

Achtung bei schmalbandigen Schichten (Grillen): zwei Bandpässe mit hohem Q lassen nur einen
Bruchteil der Rauschenergie durch. Ein scheinbar hoher Pegel (1,3) ist dort richtig – das war
schon einmal ein Fehler, die Grillen waren dadurch fast unhörbar und praktisch mono.

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
