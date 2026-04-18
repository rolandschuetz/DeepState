Ja. Die richtige Lösung ist ein lokal-first Focus Coach: Screenpipe als Sensor- und Memory-Layer, eine eigene Mac-Menubar-App als dauerlaufende Decision Engine, und eine separate Lern-Datenbank für Regeln, Beispiele und Feedback. Screenpipe dokumentiert lokalen Screen-/Audio-Capture, lokale SQLite-Speicherung, eine REST-API auf localhost:3030 und scheduled “pipes”; Apple liefert mit SMAppService, MenuBarExtra und lokalen Notifications genau die Bausteine für einen ständig laufenden Mac-Coach.  ￼

Der entscheidende Architekturpunkt ist dieser: Du musst Relevanz und Priorität trennen.
“Gehört diese Aktivität zu irgendeinem Task?” ist eine andere Frage als “Ist das gerade der wichtigste Task für diesen Zeitblock?”. Ohne diese Trennung baust du keinen Fokus-Agenten, sondern nur einen Busy-ness-Detektor.

1. Die beste Software-Architektur

A. Screenpipe = Wahrnehmung, nicht Gehirn

Screenpipe ist stark als Wahrnehmungsschicht: event-getriebener Capture statt stumpfem FPS-Recording, Accessibility-Text, OCR-Fallback, Audio-Transkription, UI-Elemente, Input-Events, lokale Speicherung und abrufbare Daten über /search, /elements, /frames/{id}/context und notfalls /raw_sql. Das ist perfekt, um den Arbeitskontext zu lesen. Die eigentliche Coaching-Logik soll trotzdem außerhalb von Screenpipe leben.  ￼

Screenpipe-Pipes sind laut Doku scheduled AI agents als Markdown-Dateien, die regelmäßig laufen, die lokale API abfragen, Dateien schreiben, APIs aufrufen und Notifications auslösen. Das ist ideal für Morning Prompt, Midday Review, End-of-Day Summary und Prototyping. Für einen echten Fokus-Coach mit sub-minütiger Zustandslogik, Unsicherheitsdialogen und nativer Mac-Oberfläche ist ein Pipe allein die falsche Heimat.  ￼

B. Der Core Agent = eigene Menubar-App mit Background Helper

Für eine Mac-V1 baust du eine SwiftUI-Menubar-App mit AppKit-Erweiterungen für HUD/Panel und einem Background Helper, der beim Login startet. Apple beschreibt MenuBarExtra für häufig genutzte Funktionen auch dann, wenn die App nicht aktiv ist, und SMAppService für Login Items, LaunchAgents und Helper. Das ist der einfachste und sauberste Weg für eine immer verfügbare, native Mac-Erfahrung.  ￼

C. Ein Agent, kein Agent-Schwarm

Baue einen Coach-Core mit klarer State Machine. Kein Multi-Agent-Zirkus.
Der Core hat nur vier interne Module:
	1.	Planner
	•	Fragt morgens: Top-Priorität, 1–2 Nebenaufgaben, Definition of Done, Fokusblöcke, erlaubte Tools, verbotene Versuchungen.
	2.	Classifier
	•	Entscheidet laufend: on_task, supporting_task, off_task, uncertain, break, idle.
	3.	Reinforcement Engine
	•	Lobt, erinnert, fragt nach.
	4.	Learning Engine
	•	Lernt aus Bestätigungen und Korrekturen.

Das Verhalten definierst du nicht in einem einzigen Prompt, sondern in drei Schichten:
	•	Policy-Datei: Schwellenwerte, Cadence, Eskalation.
	•	Prompt-Templates: nur für Klassifikation in Grenzfällen und Message-Formulierung.
	•	State/Memory: alles User-spezifische in der DB.

2. Wie der Agent ständig arbeitet

Fast Loop

Empfehlung für V1:
	•	alle 10–15 Sekunden neue Screenpipe-Ereignisse holen
	•	zu 60–90 Sekunden Sliding Windows aggregieren
	•	dann klassifizieren

Das passt zur event-getriebenen Natur von Screenpipe und verhindert hektische Fehlreaktionen auf einzelne Fensterwechsel. Screenpipe selbst erfasst App-Switches, Window-Focus, Click/Scroll, Typing-Pausen, Clipboard und hat einen Idle-Fallback.  ￼

Decision Pipeline

Die Reihenfolge soll so aussehen:
	1.	Harte Regeln zuerst
	•	exakte App-, URL-, Fenster-, Dateipfad-, Repo-, Kalender- oder Person-Matches
	2.	Statistische Affinität
	•	“Chrome + docs.stripe.com + Fenster Checkout + heute schon 2x Task A bestätigt”
	3.	Semantische Klassifikation
	•	Taskbeschreibung vs. sichtbarer Text/URL/Fenstertitel
	4.	LLM nur bei Unsicherheit
	•	nicht auf jedem Tick
	5.	User-Frage nur dann
	•	wenn Unsicherheit über eine Dauer stabil bleibt

So baust du ein schnelles, billiges, stabiles System statt eines dauernd ratenden LLM-Spielzeugs.

Zustandslogik

Empfohlene Defaults:
	•	On-task praise: nach 25–30 Minuten stabiler, hochkonfidenter Arbeit am aktiven Fokus-Task
	•	Off-task reminder: nach 90–120 Sekunden stabiler Abweichung
	•	Uncertain ask: nach 30–45 Sekunden Ambiguität
	•	No interrupt zone: keine neue Meldung in den nächsten 10–15 Minuten, außer bei klaren Distraktoren

Das ist psychologisch richtig, weil häufige Unterbrechungen selbst Leistung zerstören. Forschung zu Attention Residue zeigt, dass Task-Wechsel Leistung drücken, weil Menschen gedanklich nicht sauber umschalten.  ￼

3. Wo die Lern- und Zuordnungsdaten hingehören

Nicht in die Screenpipe-Datenbank.
Lege eine eigene lokale DB an, etwa ~/Library/Application Support/FocusCoach/coach.sqlite. Screenpipe speichert bereits Frames, OCR, Accessibility-Text, Audio, Speaker, UI-Elemente und Input-Events lokal. Du brauchst deshalb nur Referenzen auf Screenpipe-Zeitfenster oder Frame-IDs, nicht Kopien der Rohdaten. Das hält dein System robust gegen Screenpipe-Updates und vermeidet doppelte Datensilos.  ￼

Speichere dort mindestens:
	•	tasks
	•	Name, Ziel, Wichtigkeit, Kategorie, Definition of Done
	•	daily_plans
	•	Datum, Rangfolge, Fokusblöcke, aktive Slots
	•	task_rules
	•	type=app|url|window|keyword|person|file|domain
	•	polarity=allow|deny
	•	weight
	•	observations
	•	Zeitfenster, Feature-Summary, Screenpipe-Refs
	•	classifications
	•	Task, Confidence, Methode, user-confirmed ja/nein
	•	reinforcement_events
	•	praise / redirect / clarify / ignored / accepted
	•	tool_affinities
	•	positive_count, negative_count, decay, last_seen
	•	labeled_examples
	•	sichtbarer Kontext + bestätigter Task

Wichtiger Punkt:
Speichere nicht “Tool X gehört zu Task Y” als flache Wahrheit. Das ist zu dumm.
Speichere Evidenz:
“Slack + Channel Launch + Person Max + Uhrzeit 09:00–11:00 + Keyword ‘pricing’ spricht mit 0.78 für Task Fundraising.”

So lernt das System wirklich.

4. Was visuell auf dem Mac am besten funktioniert

Die beste UI ist dreistufig:

1. Primär: Menubar-Status

Apple positioniert Menu Bar Extras für app-spezifische Funktionalität, die auch außerhalb der aktiven App schnell erreichbar sein soll. Genau dort gehört dein Fokus-Coach hin. Zeige dort nur:
	•	aktuellen Task
	•	Statusfarbe
	•	Timer im aktuellen Fokusblock
	•	Confidence
	•	Pause/Snooze/Break  ￼

Mein klares Urteil:
	•	grün = on task
	•	gelb = uncertain
	•	rot = off task
	•	grau = break / idle

Das ist die beste Default-Oberfläche, weil sie glanceable ist und nicht nervt.

2. Sekundär: lokale Notifications

Apple beschreibt Notifications als Mittel für timely, high-value information und betont, dass Nutzerzustimmung nötig ist. Genau so nutzt du sie: selten, präzise, kurz. Nicht für Dauergequassel.  ￼

Beste Notification-Typen:
	•	Praise: „30 Minuten klar auf Pricing Page. Genau das zählt heute.“
	•	Redirect: „Das gehört gerade nicht zum Fokusblock. Zurück zu Pricing Page?“
	•	Clarify: „Ordne das zu: Pricing / Outreach / Pause“

3. Tertiär: kleines HUD-Panel für Unsicherheit

Apple beschreibt HUD-style Panels als dunkle, transiente Panels für visuell fokussierte Kontexte. Nutze so ein Mini-Panel nur für echte Ambiguität mit 1-Klick-Entscheidungen.  ￼

Beispiel:
	•	[1] gehört zu Task A
	•	[2] gehört zu Task B
	•	[3] ist Pause
	•	[4] ist Ablenkung

Das Panel soll in unter 2 Sekunden wegklickbar sein. Kein Formular. Kein Dialogmonster.

Optional: Widget

Apple positioniert Widgets als zeitnahe, glanceable Oberfläche. Für dein Produkt ist ein Widget optional und nur als sekundäre Tagesübersicht sinnvoll: Priorität 1, Blocks done, Streak, nächste Review. Nicht als Haupt-Feedback-Kanal.  ￼

5. Die psychologischen Konzepte, die hier wirklich wirken

Jetzt zum Kern deiner eigentlichen Frage.

1. Self-Determination Theory: Autonomie schlägt Kontrolle

Menschen halten Verhalten stabiler durch, wenn Autonomie, Kompetenz und Verbundenheit unterstützt werden. Need-Satisfaction führt zu stärker autonomer Motivation und besserem Wohlbefinden. Für dein System heißt das:
Der Agent darf nie wie Überwachung wirken, sondern wie ein freiwillig trainierter Coach, der deine selbstgewählten Prioritäten schützt.  ￼

Produktübersetzung
	•	Du wählst morgens die Prioritäten selbst.
	•	Der Agent sagt nicht „Du bist schlecht“, sondern „Das liegt außerhalb deines Fokusblocks.“
	•	Pause, Snooze, Break und Override sind immer vorhanden.

2. Implementation Intentions: der stärkste Morgenhebel

Die Meta-Analyse von Gollwitzer/Sheeran fand über 94 Tests einen Effekt mittlerer bis großer Stärke (d = .65) auf Zielerreichung. Dein Morning Prompt soll deshalb nicht nur fragen „Was ist wichtig?“, sondern direkt Wenn-Dann-Regeln erzeugen.  ￼

Produktübersetzung
Morgens nicht nur:
	•	„Top Task: Landing Page“

sondern:
	•	„Wenn ich zwischen 09:00 und 11:00 Slack öffne, dann nur für #launch und max. 5 Minuten.“
	•	„Wenn ich von Cursor weg wechsle, dann kehre ich innerhalb von 60 Sekunden zurück oder label den Wechsel.“
	•	„Wenn ich Research mache, dann gehören nur diese Domains zum Task.“

Das ist massiv wirksamer als bloße Prioritätenlisten.

3. Proximal Goals: kleine, klare Blöcke statt vage Tagesziele

Bandura und Schunk zeigen, dass proximal subgoals Motivation, Selbstwirksamkeit und intrinsisches Interesse besser fördern als entfernte Ziele. Goal-Gradient-Forschung zeigt zusätzlich: je näher das Ziel, desto stärker das Verhalten.  ￼

Produktübersetzung
	•	Keine riesigen Tagesziele
	•	Fokusblöcke von 25–45 Minuten
	•	klare Micro-Completion:
	•	„Hero Section fertig“
	•	„3 Outreach-Mails raus“
	•	„Pricing-Variante entschieden“

4. Feedback wirkt – und backfired oft

Kluger & DeNisi zeigen: Feedback verbessert Leistung im Schnitt, aber über ein Drittel der Feedback-Interventionen verschlechtert Leistung. Der Unterschied liegt darin, worauf das Feedback die Aufmerksamkeit lenkt. Task-level gut. Ego-level schlecht.  ￼

Produktübersetzung
Gutes Lob:
	•	„28 Minuten stabil auf dem wichtigsten Hebel. Weiter.“
	•	„Du hast den Fokusblock ohne Task-Switch gehalten.“

Schlechtes Lob:
	•	„Du bist diszipliniert.“
	•	„Top Performer.“
	•	Punktesysteme, Rankings, moralische Wertung

Dein Agent soll Verhalten stabilisieren, nicht Identität aufblasen.

5. Positive Verstärkung über Selbstwirksamkeit

Experimentelle Forschung zeigt: positive Feedback-Manipulation erhöhte Selbstwirksamkeit; diese vermittelte positive Effekte auf Flow und Performance. Das heißt: Lob wirkt am besten, wenn es Kompetenz erlebbar macht.  ￼

Produktübersetzung
Das beste positive Reinforcement ist:
	•	unmittelbar
	•	konkret
	•	auf Fortschritt bezogen
	•	sparsam
	•	glaubwürdig

Nicht:
	•	inflationär
	•	random
	•	übertrieben
	•	infantil

6. Fortschritt richtig framen

Neuere Arbeit zu Progress Monitoring zeigt: nach positivem Feedback stärkt die Fokussierung auf akkumulierten Fortschritt die Persistenz stärker; bei negativem Feedback hilft stärker die Sicht auf den verbleibenden Weg.  ￼

Produktübersetzung
	•	Wenn du gut unterwegs bist:
„2 von 4 Fokusblöcken erledigt.“
	•	Wenn du driftest:
„Noch 18 Minuten bis Block-Ende. Zurück zu Hero Section.“

Das ist präziser als pauschales Cheerleading.

7. Hooked: Ja – aber gezähmt

Nir Eyal beschreibt Hooked als Trigger → Action → Variable Reward → Investment. Genau diese Schleife passt hier, aber nur in disziplinierter Form.  ￼

Die richtige Übersetzung für deinen Coach
	•	Trigger
Morgenstart, Fokusblock-Start, Drift, Ambiguität
	•	Action
Recommit, labeln, Task wählen, Pause markieren
	•	Reward
spezifisches Kompetenz-Feedback, sichtbarer Progress, Tagesabschluss
	•	Investment
Du bestätigst unklare Fälle, pflegst erlaubte Tools und trainierst damit den Agenten

Der kritische Punkt:
Das “variable reward”-Prinzip aus Hooked darf hier nicht in Slot-Machine-Form umgesetzt werden. Ein Fokus-Coach darf dich nicht auf den Coach selbst süchtig machen. Wegen Attention Residue und der negativen Nebenwirkungen elektronischer Überwachung sollen Variabilität und Überraschung in Text, Timing des Tagesabschlusses und Formulierung stecken — nicht in ständigen, unberechenbaren Unterbrechungen. Das ist meine klare Design-Entscheidung aus der Kombination der Hooked-Logik mit Interruptions- und Monitoring-Forschung.  ￼

8. Monitoring hat Nebenwirkungen – also opt-in, transparent, user-owned

Eine Meta-Analyse zu elektronischem Monitoring fand leichte Verschlechterung bei Jobzufriedenheit, leichten Stressanstieg, keinen Performance-Gewinn und sogar leicht mehr counterproductive work behavior. Noch schlimmer: Performance Targets und Feedback konnten diese negativen Effekte verstärken.  ￼

Produktübersetzung
	•	alles lokal-first
	•	Datenverwendung glasklar
	•	Pause/Snooze mit 1 Klick
	•	Break-Mode
	•	kein moralischer Ton
	•	kein “du warst 41% ineffizient”
	•	kein Leaderboard

Sonst zerstörst du Akzeptanz.

9. Habit-Bildung braucht stabile Kontexte

Habits entstehen durch Wiederholung gleicher Reaktionen in wiederkehrenden Kontexten. Für deinen Coach heißt das: gleiche Startfrage, gleiche Menübar-Farbe, gleiche Fokusrituale, gleiche Review-Zeiten.  ￼

Produktübersetzung
	•	jeden Morgen dieselbe Einstiegsroutine
	•	immer derselbe Fokus-Start-Shortcut
	•	immer dieselbe visuelle Sprache
	•	gleiche Nach-30-Minuten-Verstärkung

So wird aus externem Nudging ein internes Fokusmuster.

6. Die einfachste V1, die wirklich funktioniert

Baue zuerst diese Version:
	1.	SwiftUI MenuBarExtra App
	2.	Login helper mit SMAppService
	3.	Morning planning popover
	4.	Screenpipe polling alle 15s
	5.	Regelbasierte Klassifikation
	6.	1-Klick-Unsicherheitsfragen
	7.	Lokale Notifications
	8.	Eigene SQLite für Rules + Labels
	9.	End-of-day summary

Noch nicht bauen:
	•	Agent-Schwärme
	•	komplexe Gamification
	•	Punkte/Badges
	•	große Vector-Datenbank
	•	Cloud-Backend
	•	LLM auf jedem Tick

LLM kommt erst in V2 für Grenzfälle und bessere Nachrichtenformulierung. Das ist der einfachste Weg mit der höchsten Hebelwirkung.

7. Meine klare Produktempfehlung

Baue keinen “assistant that watches”. Baue einen “self-authored focus coach”.

Die Gewinnerformel ist:
	•	morgen freiwillige Priorisierung
	•	tagsüber konservative Klassifikation
	•	seltene, spezifische positive Verstärkung
	•	sanfte Rückführung bei Drift
	•	1-Klick-Lernen bei Unsicherheit
	•	abends Review und Modell-Update

Das trifft die beste Kombination aus Hooked, positiver Verstärkung, Selbstbestimmung, Fortschrittspsychologie und Unterbrechungskosten.  ￼

8. Die smarten Fragen, die dein Projekt jetzt scharfstellen

Antworte auf diese Fragen, dann steht deine V1-Spezifikation glasklar:
	1.	Schützt der Agent immer genau einen aktiven Fokus-Task oder verwaltet er parallel 1 Primär- und 2 Sekundär-Tasks?
	2.	Was ist für dich “gehört zu einem Task”: App, URL, Fenstername, Datei, Person, gesprochenes Thema, oder Outcome?
	3.	Wie soll der Agent Support-Arbeit behandeln, die indirekt nötig ist — E-Mail, Slack, Research, kurze Calls?
	4.	Welche Fehler schmerzen mehr: falscher Alarm oder verpasste Ablenkung?
	5.	Willst du Deep Work, Admin, Meetings und Regeneration als getrennte Modi?
	6.	Soll der Agent nur erinnern oder auch aktiv Friktion erhöhen, etwa durch Website-Blocker oder App-Limits?
	7.	Ist dein Ziel tägliche Ausführungstreue oder echte Outcome-Erreichung pro Woche?
	8.	Wie viele Unterbrechungen pro Stunde akzeptierst du maximal, bevor das System selbst zur Ablenkung wird?
	9.	Soll das System rein lokal bleiben oder später Team-/Accountability-Features bekommen?
	10.	Welchen Ton soll der Coach haben: nüchtern, hart, sportlich, freundlich, oder brutal ehrlich?

Antworte auf diese 10 Punkte. Dann lässt sich daraus direkt die konkrete Datenstruktur, State Machine und die erste Screenpipe-Integration ableiten.