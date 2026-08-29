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

**Die Ausnahme: strukturierte Einzelereignisse.** Tierstimmen, Donnerschläge, Feuerknacken,
Blasen, Tropfen und Atemzüge sind keine Rauschprozesse – synthetisch klingen sie unweigerlich
nach Pfeifton oder Motor. Das war der Befund aus der Praxis, nicht aus der Theorie: erst
klangen die Tierstimmen unecht (v1.1), dann Feuer, Blasen, Donner und Schnarchen. Dafür
liegen **freie Aufnahmen** bei (`audio/`, Nachweise in `audio/QUELLEN.md`).

**Die Faustregel (Stand 1.8):** Nur noch Regen, Strand, Unterwasser, Zug, Straße und die drei
Rauscharten sind synthetisch. Wind, Fluss und Baumwipfel sind dazugekommen, obwohl sie
rauschartig sind – synthetisch klangen sie **monoton**: echter Wind pfeift und kommt in Böen,
ein Fluss lässt einzelne Wirbel hören, Laub raschelt in Schüben. Gleichmäßiges Rauschen zu
erzeugen ist leicht; das feine Leben darin nicht.

**Fallstrick beim Umbau auf Aufnahmen:** Beim Ersetzen einer synthetischen Kulisse die alte
Baufunktion wirklich **löschen**. In `Klang.szenen` gewinnt bei doppeltem Schlüssel die
*letzte* Definition – so lief `vogelAfrika` zwei Versionen lang weiter synthetisch, obwohl
die Aufnahmen längst eingebaut waren, und fiel erst dem Nutzer auf.

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

24 Kulissen in sechs Kategorien (siehe `KATEGORIEN`/`KULISSEN` in app.js). Die Zuordnung
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

## Geschwindigkeitsstufen (seit v1.6)

Jede Kulisse hat drei Stufen: langsam (0,62) · normal (1) · schnell (1,55), gespeichert in
`st.tempo[id]`, umschaltbar über die Segmentleiste in der Kachel.

Der Faktor geht **an einer einzigen Stelle** in `sound.js` ein – als `T` im Bauer – und wirkt
von dort auf alles Zeitabhängige: `steuer` (Tempo der Steuerkurven), `takt` (Schlagfolge),
`funken`/`torLang` (Impulsdichte, mit mitlaufender Verstärkung, damit die Lautstärke nicht
springt) und die Pausen in `rufe`. **Jede neue zeitabhängige Funktion muss T ebenfalls
verrechnen.**

Sonderfall Schleifen: Dort verschiebt die Abspielrate auch die Tonhöhe. Wie stark das Tempo
mitgeht, entscheidet die Kulisse über `tempoAnteil` – Grillen 0,8 (zirpen bei Wärme wirklich
schneller und höher), Feuer 0,12 (sonst klingt es nach Zeitraffer).

Ein Stufenwechsel **baut die Kulisse neu auf**, weil der Faktor in den Aufbau eingeht
(`tempoUm` in app.js); der Übergang läuft über die übliche Blende.

`feuerstark` gibt es seit v1.6 nicht mehr – das ist jetzt das Lagerfeuer auf Stufe „schnell".
Alte Stände werden beim Laden umgeschrieben (inklusive Entfernen der Dublette im Pult).

## Favoriten (seit v2.1)

Bis zu **zehn benannte Mischungen** (`MAX_FAVORITEN`), im Blatt `#bl-fav` über den Chip
`#chip-fav`. Gespeichert wird, was die Mischung ausmacht: `pult`, `an`, `vol`, `tempo` –
alles in `st.favoriten`, also im selben `localStorage`-Eintrag wie der übrige Zustand.

- `favoritSpeichern(name)` verweigert eine leere Mischung (nichts läuft) und die elfte.
- `favoritLaden(i)` räumt erst alles Laufende ab, setzt dann Pult, Regler und Stufen und
  startet die gespeicherten Kulissen. Unbekannte Ids (aus einer alten Fassung) werden
  dabei **weggefiltert** – sonst läge eine Kachel im Pult, zu der es keine Kulisse gibt.
- Ab zehn Einträgen sperren sich Namensfeld und Sichern-Knopf.

## Fallstricke (dazugekommen in 2.1)

- **`kette()` gibt das LETZTE Glied zurück.** Wer eine Filterkette *vor* eine Schicht hängen
  will, braucht den Eingang separat – sonst hängt die Quelle am letzten Filter und alle
  davor sind wirkungslos. Genau das war beim Bauernhof passiert: der Tiefpass, der die
  schrillen Spitzen nehmen sollte, lag im Signalweg gar nicht drin.
- **Schichten mit sehr verschiedener Lautheit brauchen eine gemeinsame Bremse, nicht nur
  einen kleineren Ausgleich.** Der Bauernhof stand bei RMS 0,10 mit einer Spitze von 3,9
  (das Muhen gegen den Hof dahinter); der Ausgleich nach Formel hätte alles auf RMS 0,019
  gedrückt, also unhörbar. Mit `presser` vor dem Ausgang kommen 0,068 bei Spitze 0,71
  heraus. Dasselbe bei Fröschen (Quaken in Schüben) und Schnarchen (Grunzen).
- **Bei sporadischen Kulissen hängt das gemessene RMS am Fenster.** Glitzer maß über 40 s
  0,035 und über 32 s 0,147 – dort lieber vorsichtig ansetzen und die Spitze als Maß nehmen.

## Wassertropfen: zurück zur Synthese (2.1)

Aus Aufnahmen geschnitten blieben die Tropfen abgehackt und blechern, egal wie lang das
Segment war. Ein Tropfen ist genau das, was Beatboxer nachmachen: ein kurzer Ton, dessen
Tonhöhe beim Eintauchen steil nach oben schnellt. Als Klangnetz gebaut lässt er sich
gleichmäßig halten – drei feste Tropfraten (1,05 · 1,55 · 2,35 s über `takt`, also mit
Tempo) ergeben einen **stetigen Strom** statt einzelner Ereignisse. Gemessen: Streuung der
Halbsekunden-Pegel 0,30 statt vorher deutlich mehr.

Damit sind 34 Kulissen in sieben Kategorien im Spiel.

## Gleichbleibender Takt: `gleich` in `rufe` (seit v2.2)

Für die Kirchturmglocke gebaut. `rufe({..., gleich: true})` schaltet **jeden Zufall ab**:
immer Segment 0, `rate[0]` als feste Geschwindigkeit, Lautstärke 1, keine Stereostreuung –
und der Abstand wird **von Anschlag zu Anschlag** gemessen (`pause[0]`) statt vom Ende des
vorigen. Nur dadurch bleibt der Takt gleich, egal wie lang das Segment ist.

Gemessen: acht Anschläge in 40 s, Abstände exakt 5,20 s, Spitzenpegel alle exakt gleich.

Zwei Dinge, die dabei zusammengehören:
- Die Glocke braucht **genau ein Segment** in `PROBEN`. Vorher standen dort fünf Segmente
  à 5 s, die sich überlappten – jeder Schlag klang anders, weil ein anderer erwischt wurde.
  Gewählt ist der Anschlag bei 25,03 s: danach kommt bis 42,4 s nichts, der Nachklang
  bleibt also ungestört.
- **`weich` muss hier 0 sein.** Mit `weich: 0.06` wurde die Attacke über 0,28 s
  aufgezogen – die Anschlagserkennung fand daraufhin gar keinen Anschlag mehr, und eine
  Glocke ohne Anschlag ist keine Glocke. Ohne `weich` bleibt es bei 30 ms.

## Wann ein Filter nicht reicht

Ein einzelner Biquad fällt mit 12 dB je Oktave – bei der doppelten Grenzfrequenz sind das
erst -13 dB. Bei den Fröschen lagen 45 % der Energie bei 1,2–3 kHz gegen 31 % im
Durchlassbereich; nach einem Tiefpass bei 950 Hz standen immer noch 72 % über 1 kHz, das
hohe Quaken war also weiter da. **Zwei Tiefpässe in Reihe** machen 24 dB je Oktave daraus.

Beim Bauernhof reichte ein Filter, weil die Aufnahme von sich aus tief ist – deshalb
lohnt es, das Verhältnis vorher zu messen, statt einen Filterwert zu raten.

## Was sich nicht filtern lässt

Der Hahn im Bauernhof steckte in der Aufnahme, nicht im Klangweg: `huhn2` hatte im Band
1,2–3 kHz Spitzen von 0,07 bis 0,11 gegen einen Grundwert von 0,005. Ein Filter, der das
wegnimmt, nimmt das Gackern mit. **Die Lösung war eine andere Aufnahme** (`huhn3`, dort
ist das Band durchgehend flach). Genauso bei den Laubfröschen: 82 % ihrer Energie lagen
über 1,2 kHz, ihre Sekundenpegel sprangen um den Faktor 50 – die Datei ist raus, statt
sie zurechtzubiegen.

**Erst die Aufnahme prüfen, dann filtern.** Ein Bandprofil je Sekunde zeigt in Sekunden,
was stundenlanges Herumschrauben am Klangweg nicht löst.

## OM: die Ausnahme von der Ausnahme (v2.2)

Das OM war synthetisch messbar makellos – Streuung der Halbsekundenpegel 0,01 – und klang
trotzdem falsch, nämlich nach Orgel. Eine menschliche Stimme lebt von Formantbewegung,
Rauheit und Atem. Jetzt läuft eine gesungene Aufnahme (`om1`, nur der stehende Teil,
Sekunde 0,6 bis 11,6) als Schleife.

Die Kulisse heißt deshalb `om` und steht in **Menschenwelt**, nicht mehr in Synth.
Alte Stände werden über `umbenennen()` von `synthOm` auf `om` gezogen.
`tempoAnteil` ist mit 0,08 fast null: bei einer gesungenen Note verschiebt die
Abspielrate die Tonhöhe, und ein OM soll auf jeder Stufe ein OM bleiben.

## Beim Messen gefundene Altlasten (v2.2)

Zwei Fehler, die beim Durchmessen aller 34 Kulissen auffielen und nichts mit dem
Auftrag zu tun hatten:

- **Donner übersteuerte** (Spitze 1,01 bei Ausgleich 1,22 – alles über 1,0 verzerrt).
  Über drei Aufbauten gemessen lag die Spitze bei 0,46 / 0,55 / 0,80; der Ausgleich
  steht jetzt auf 0,78. Bei sporadischen Kulissen zählt der schlechteste Durchlauf,
  nicht der mittlere.
- **Grillen waren 13 dB zu leise** (RMS 0,019 gegen ein Ziel von 0,09) – genau der
  Fehler, der oben unter „Pegel" schon einmal dokumentiert ist. Jetzt 2,60.

**Deshalb nach jeder Runde alle Kulissen durchmessen, nicht nur die geänderten.**

## Vorsicht bei der Messmethode selbst

Bandenergie über einen Biquad-Bandpass zu messen, führt in die Irre: die Flanken
haben nur 12 dB je Oktave, und wenn die Energie stark unterhalb liegt, misst das
obere Band vor allem Leckage. Kontrolltest: weißes Rauschen durch zwei Tiefpässe bei
850 Hz zeigte im Band 1–2 kHz immer noch einen Anteil von 0,23.

Wo es genau sein muss, **Goertzel** nehmen (einzelne Frequenzen über Hann-gefensterte
4096er-Blöcke). Erst damit war zu sehen, dass die Filterkette bei den Fröschen die
3200-Hz-Komponente um 40 dB gegenüber dem Grundton absenkt – der Bandpass-Messung
zufolge hatte sich fast nichts getan.

Nebenbei zeigte dieselbe Messung, warum nicht weiter zu filtern ist: **die Froschstimme
selbst sitzt bei 1250 Hz.** Ein tieferer Tiefpass löscht den Frosch, nicht das Quaken.

## Migration: alle vier Felder eines Favoriten

`umbenennen()` lief in `laden()` nur über `pult`. Die Felder `an`, `vol` und `tempo`
eines Favoriten behielten den alten Schlüssel und fielen beim Laden durch die
`NACH_ID`-Prüfung – aus einem Favoriten mit OM wäre ein Favorit ohne OM geworden.
**Bei jeder künftigen Umbenennung alle vier Felder mitziehen** (`umKeys`).

## Was in v2.3 gelernt wurde

**Einen Filter setzt man nicht nach Gefühl, sondern nach dem Spektrum.**
Beim Bauernhof stand der Tiefpass bei 1100 Hz und die Spitze des Gackerns bei
850 Hz – der Filter ließ also genau das durch, was zu hoch klang. Erst die
Goertzel-Messung der Aufnahme (850 Hz auf 0 dB, 500 Hz -8, 600 Hz -12) zeigte,
wo die Grenze hin muss: 520 Hz, zweifach. **Vor jedem Filterwert das Spektrum
der Aufnahme messen.**

**Hall klingt bei perkussiven Kulissen wie zusätzliche Anschläge.**
`hall(zeit, fb, …)` sind drei rückgekoppelte Verzögerungen bei `zeit`,
`zeit*1.37` und `zeit*1.83`. Bei der Glocke waren das 0,34 / 0,47 / 0,62 s mit
55 % Rückkopplung – gehört wurden daraus mehrere Schläge statt einem. Bei
Flächen ist der Hall richtig, bei Einzelschlägen stört er. Die Glocke läuft
jetzt ganz ohne.

**Bei Schleifen muss das Segment kürzer sein als der Takt.** Sonst überlagern
sich zwei Anschläge. Glocke: Segment 2,85 s, Takt 3,0 s.

**Glitzern braucht `knister`, nicht Sinustöne mit Hüllkurve.** Vier langsam
an- und abschwellende Sinustöne sind ein Pad, kein Funkeln. `knister` tort
Rauschen durch einen sehr schmalen Bandpass (Q 30): der Filter klingt nach
jedem Impuls kurz nach, das ergibt ein Tönchen mit hartem Einsatz und
schnellem Abfall. Die Bandbreite des Tors bestimmt die Rate.

**Ein Pad mit vier Akkordtönen ist Musik, kein Hintergrund.** Wer stundenlang
zuhört, hört die Harmonie. `synthWarm` hat jetzt eine einzige Tonhöhe, in drei
minimal verstimmten Schichten – das gibt Wärme, ohne ein Intervall zu bilden.

**Die Wassertropfen sind entfernt.** Erst aus Aufnahmen (abgehackt und
blechern), dann synthetisch (der Ton stimmte nicht) – nach mehreren Anläufen
war die richtige Antwort, die Kulisse zu streichen statt weiter daran zu
schrauben. Ein synthetischer Tropfen bleibt eine offene Aufgabe, kein Fehler
im Code: es gibt nichts mehr zu reparieren.
