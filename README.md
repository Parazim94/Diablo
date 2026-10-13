# ⚔️ ABGRUND

**Steige hinab. Erschlage alles. Nimm die Beute.**

Ein Dungeon-Crawler im Stil klassischer Action-RPGs, der direkt im Browser läuft. Kein Download, keine Anmeldung, einfach klicken und kämpfen.

### 👉 [Jetzt spielen: abgrund-bay.vercel.app](https://abgrund-bay.vercel.app)

---

## Das Spiel

Fünf Ebenen voller Untoter, Dämonen und Bogenschützen liegen zwischen dir und dem **Fürsten der Tiefe**. Jede Ebene wird bei jedem Besuch neu gewürfelt, kein Durchgang gleicht dem anderen. Wer den Fürsten besiegt, darf es noch einmal versuchen, mit seinem Charakter, aber gegen deutlich härtere Gegner.

### Was dich erwartet

- **Zufällige Dungeons:** Räume und Gänge werden bei jedem Spiel neu erzeugt, mit eigener Farbwelt pro Ebene.
- **Klick-und-Kampf:** Linksklick zum Laufen, Linksklick auf einen Gegner zum Angreifen. Wegfindung um Wände übernimmt das Spiel.
- **Vier Gegnertypen:** Oger, Geister, Fledermäuse und Bogenschützen, die dich aus der Distanz beschießen und ausweichen.
- **Elite-Gegner:** Goldene Brocken mit mehr Leben, mehr Schaden und garantierter Beute.
- **Bosskampf:** Der Fürst der Tiefe feuert Projektilringe und erfordert Bewegung statt Dauerklicken.
- **Tränke:** Gegner lassen Lebens- und Manatränke fallen, du startest mit zwei Lebens- und einem Manatrank.
- **Drei Fähigkeiten:** Wuchtschlag, Wirbelwind und Schlachtruf.
- **Beute-Jagd:** Vier Seltenheitsstufen von grau über blau und gelb bis **legendär**, mit Zufallswerten auf Schaden, Rüstung, Leben und kritischen Treffern.
- **Charakterentwicklung:** Stufenaufstiege, Attributspunkte für Stärke und Vitalität, fünf Ausrüstungsplätze.
- **Minimap:** Erkundetes Gebiet, Gegner und Treppe auf einen Blick.
- **Automatisches Speichern:** Dein Fortschritt bleibt im Browser erhalten.
- **Eigener Sound:** Alle Effekte und die dunkle Hintergrundmusik werden im Code erzeugt, ganz ohne Audiodateien.

---

## Steuerung

| Eingabe | Aktion |
|---|---|
| **Linksklick** auf den Boden | Laufen |
| **Linksklick** auf einen Gegner | Hinlaufen und angreifen |
| **Linksklick** auf Beute | Aufheben |
| **Linksklick** auf die Treppe | Nächste Ebene |
| **1** | Wuchtschlag: schwerer Treffer auf ein Ziel (8 Mana) |
| **2** | Wirbelwind: trifft alle Gegner im Umkreis (20 Mana) |
| **3** | Schlachtruf: 6 Sekunden lang +40 % Schaden (15 Mana) |
| **Q** / **E** | Lebenstrank (heilt 40 %) / Manatrank (füllt 50 % auf) |
| **I** oder **C** | Charakter und Inventar |
| **ESC** oder **P** | Pause (dort beendet **Q** zum Hauptmenü) |
| **M** | Ton an/aus |

Im Inventar legst du Gegenstände per Linksklick an oder ab, ein Rechtsklick wirft sie weg. Fahre mit der Maus über einen Gegenstand, um seine Werte zu sehen.

Auf Touch-Geräten funktionieren Tippen, die Fähigkeitsfelder und die Schaltflächen oben links. Getestet habe ich das bisher nur am Desktop.

---

## Selbst starten

Voraussetzung ist [Node.js](https://nodejs.org) (getestet mit Version 26).

```bash
git clone <dein-repo>
cd Diablo
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
```

Weitere Befehle:

```bash
npm run build      # Typprüfung und Produktions-Build nach dist/
npm run preview    # den Build lokal ausprobieren
```

### Auf Vercel veröffentlichen

```bash
npx vercel deploy --prod --yes
```

---

## Technik

| Bereich | Wahl |
|---|---|
| Spiel-Engine | [Phaser 4](https://phaser.io) |
| Sprache | TypeScript |
| Build | Vite |
| Sound | Web Audio API (komplett synthetisiert) |
| Speicherstand | `localStorage` |
| Hosting | Vercel (statisch) |

### Projektstruktur

```
src/
├── main.ts              Spielstart und Szenen
├── dungeon.ts           Dungeon-Generator und Wegfindung
├── enemies.ts           Gegnertypen und Werte
├── items.ts             Beute-Generator, Seltenheiten und Namen
├── state.ts             Spielerwerte, Inventar und Ausrüstung
├── save.ts              Speichern und Laden
├── audio.ts             Soundeffekte und Musik
├── scenes/
│   ├── BootScene.ts     Lädt die Grafiken
│   ├── MenuScene.ts     Hauptmenü
│   └── GameScene.ts     Das eigentliche Spiel
└── ui/
    └── InventoryPanel.ts
public/assets/           Grafiken und Lizenz
```

---

## Mitbauen

Gegner anpassen, Beute verändern oder neue Fähigkeiten einbauen: Die meisten Werte stehen übersichtlich oben in `enemies.ts`, `items.ts` und `GameScene.ts`. Pull Requests und Ideen sind willkommen.

### Mögliche nächste Schritte

- Weitere Fähigkeiten
- Weitere Klassen neben dem Krieger
- Richtige Sprite-Animationen (bisher nur Wackeln beim Laufen)
- Mehr Gegnertypen und Spezialangriffe pro Ebene
- Online-Bestenliste

---

## Danksagung

Die Grafiken stammen aus dem Paket **[Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon)** von [Kenney](https://kenney.nl) und stehen unter der Lizenz **CC0 1.0** (frei nutzbar, auch kommerziell). Die Lizenzdatei liegt in `public/assets/`.

Inspiriert von den großen Dungeon-Crawlern, aber ein eigenständiges Fan-Projekt ohne Bezug zu deren Herstellern.
