(function (global) {
  'use strict';

  const THEMES = [
    {
      id: 'hardware',
      name: 'Studio Hardware',
      subtitle: 'Braun / Teenage Engineering / Elgato Pro',
      badge: 'Empfohlen',
      palette: ['#111214', '#181A1E', '#262A31', '#FF5A1F'],
      description: 'Mattes Eloxal-Schwarz, spürbare Keycaps mit 1px Oberlicht und sparsames Signal-Orange.'
    },
    {
      id: 'monolith',
      name: 'Monolith Pro',
      subtitle: 'Linear / Raycast / Minimal',
      badge: 'Ultraruhig',
      palette: ['#0A0B0D', '#121317', '#1E2028', '#FFFFFF'],
      description: 'Tiefschwarze Haarlinien, maximale Kontrastdisziplin und reinweißer Aktionsfokus.'
    },
    {
      id: 'daylight',
      name: 'Daylight Studio',
      subtitle: 'Ableton / Figma Light',
      badge: 'Hell',
      palette: ['#F3F3EF', '#FFFFFF', '#E2E2DC', '#2563EB'],
      description: 'Alabaster-Flächen für helle Arbeitsplätze, weiche Elevation und klares Kobalt-Blau.'
    },
    {
      id: 'amber',
      name: 'Carbon Amber',
      subtitle: 'Analoge Mischpult-Konsole',
      badge: 'Warm',
      palette: ['#141311', '#1C1B19', '#2C2A26', '#E5A93C'],
      description: 'Warmes Schiefer-Anthrazit mit gedämpftem Bernstein-Gold für lange Studio-Sessions.'
    },
    {
      id: 'slate',
      name: 'Nordic Slate',
      subtitle: 'Broadcast / Novora Evolution',
      badge: 'Präzise',
      palette: ['#0D1117', '#161B22', '#26303D', '#22D3EE'],
      description: 'Kühler Broadcast-Schiefer mit präzisem Eis-Cyan für klare Live-Statusringe.'
    },
    {
      id: 'glass',
      name: 'Tactile Frost',
      subtitle: 'Modern Acrylic / Desktop',
      badge: 'Weich',
      palette: ['#12141E', '#1B1F2E', '#2C334A', '#6366F1'],
      description: 'Rauchglas-Ebenen mit feinen Kantenreflexen, weichen Radien und ruhigem Indigo.'
    }
  ];

  const PARTS = [
    {
      id: 'nav',
      step: '1',
      name: 'Navigation & Shell',
      short: 'Navigation',
      desc: 'Wie die 4 Hauptreiter (Editor, Verbinden, Geräte, Einstellungen) im PC-Fenster liegen.',
      variants: [
        {
          id: 'rail',
          title: 'Icon-Rail links',
          tag: 'Kompakt · 68 px',
          summary: 'Schmale linke Symbolleiste mit Status-Badges. Lässt den Seiten- und Editor-Spalten volle Höhe.',
          pros: ['Klassischer Studio-Workflow', 'Live-Badges sofort sichtbar'],
          cons: ['Kostet 68 px horizontale Breite']
        },
        {
          id: 'toptabs',
          title: 'Topbar-Reiter',
          tag: 'Maximale Breite',
          summary: 'Alle 4 Reiter sitzen kompakt in der Fensterleiste oben. Das Raster gewinnt +68 px Breite.',
          pros: ['Maximale Fläche für 8×5-Raster', 'Sehr klare Hierarchie oben'],
          cons: ['Weniger Platz für Fenster-Metadaten']
        },
        {
          id: 'sidebar',
          title: 'Text-Sidebar',
          tag: 'Klassisch · 196 px',
          summary: 'Reiter als beschriftete Liste plus Seiten direkt darunter in einer durchgängigen linken Spalte.',
          pros: ['Sofort selbsterklärend', 'Seiten und Reiter in einem Blick'],
          cons: ['Weniger Platz bei schmalen Fenstern']
        },
        {
          id: 'dock',
          title: 'Schwebendes Dock',
          tag: 'Modern · Pill',
          summary: 'Schwebende Navigations-Pill am linken Rand mit akzentuiertem Fokus-Indikator.',
          pros: ['Leichtes, modernes Raumgefühl', 'Gute visuelle Trennung zur Bühne'],
          cons: ['Etwas verspielter als Rail']
        }
      ]
    },
    {
      id: 'pages',
      step: '2',
      name: 'Seiten-Verwaltung',
      short: 'Seiten',
      desc: 'Umschalten und Anlegen von Deck-Seiten (Home, Musik, Stream, Mixer) und Ordnern.',
      variants: [
        {
          id: 'column',
          title: 'Vertikale Seitenliste',
          tag: 'Bewährt · 190 px',
          summary: 'Ruhige Spalte links vom Raster mit Live-Punkt, Rastergröße (5×3) und + Neue Seite.',
          pros: ['Skaliert problemlos auf 10+ Seiten', 'Ordner-Tiefe gut darstellbar'],
          cons: ['Belegt eine feste Spalte']
        },
        {
          id: 'tabs',
          title: 'Horizontale Seiten-Tabs',
          tag: 'Ableton-Stil',
          summary: 'Seiten sitzen als aufgeräumte Tab-Leiste direkt über dem Raster — keine extra Spalte.',
          pros: ['Viel Platz für große Rastern', 'Schneller 1-Klick-Wechsel'],
          cons: ['Bei >7 Seiten scrollen nötig']
        },
        {
          id: 'minicards',
          title: 'Mini-Grid-Karten',
          tag: 'Visuell · 4×2',
          summary: 'Jede Seite zeigt eine echte Miniatur ihrer Tasten-Belegung statt nur Text.',
          pros: ['Seiten sofort optisch erkennbar', 'Ideal bei vielen ähnlichen Profilen'],
          cons: ['Braucht etwas mehr Höhe pro Eintrag']
        }
      ]
    },
    {
      id: 'stage',
      step: '3',
      name: 'Raster-Bühne & Kachel-Stil',
      short: 'Bühne & Tasten',
      desc: 'Präsentation des 1:1-Kachelrasters plus wählbarer physikalischer Stil für alle Tasten.',
      variants: [
        {
          id: 'frame',
          title: 'Hardware-Deck-Rahmen',
          tag: 'Fokussiert',
          summary: 'Das Raster liegt in einem matt eingefassten Pult-Gehäuse mit Breadcrumb und Steppern.',
          pros: ['Klare Bühne für Tasten', 'Fühlt sich wie echtes Gerät an'],
          cons: ['Etwas mehr Rahmen-Padding']
        },
        {
          id: 'canvas',
          title: 'Dot-Canvas + Schwebeleiste',
          tag: 'Offen · Präzise',
          summary: 'Feines Punktraster im Hintergrund, schwebende Stepper-Leiste für Spalten und Zeilen (3–8).',
          pros: ['Sehr luftig bei großen 8×5-Decks', 'Stepper direkt greifbar'],
          cons: ['Weniger Hardware-Rahmengefühl']
        },
        {
          id: 'bezel',
          title: 'Live-Geräterahmen',
          tag: '1:1 Zielgerät',
          summary: 'Zeigt die Tasten direkt im Querformat-Rahmen des gekoppelten Handys/Tablets inkl. Latenz-Chip.',
          pros: ['Exakte Vorschau wie am Gerät', 'Keine Überraschung bei Abständen'],
          cons: ['Bei 8×5 am Desktop kompakter']
        }
      ]
    },
    {
      id: 'inspector',
      step: '4',
      name: 'Inspektor & 3-Tab-Picker',
      short: 'Inspektor',
      desc: 'Bearbeitung der gewählten Taste mit exakt 3 Tabs: Software, Browser, Symbole + Aktives Fenster (3s).',
      variants: [
        {
          id: 'classic',
          title: 'Vertikale Inspektor-Spalte',
          tag: 'Alles sichtbar · 320 px',
          summary: 'Vorschau, 3-Tab-Bibliothek, Aktions-Dropdown, Zielpfad und Zustand übereinander.',
          pros: ['Alle Felder ohne Klick erreichbar', 'Kein Umschalten nötig'],
          cons: ['Spalte muss vertikal scrollen']
        },
        {
          id: 'twotab',
          title: '2-Tab-Inspektor',
          tag: 'Kein Scrollen',
          summary: 'Trennt sauber zwischen „Aussehen & App“ und „Aktion & Zustand“ in zwei kompakten Reitern.',
          pros: ['Kein Scrollen in der Seitenleiste', 'Ruhige, aufgeräumte Oberfläche'],
          cons: ['Ein extra Klick zwischen Optik & Aktion']
        },
        {
          id: 'popover',
          title: 'Schwebender Drawer',
          tag: '100 % Bühne',
          summary: 'Der Inspektor fährt nur bei Tasten-Auswahl als kompakter Drawer rechts über die Ecke.',
          pros: ['Volle Raster-Größe im Leerlauf', 'Ideal für kleine Laptops'],
          cons: ['Verdeckt rechte Randkacheln leicht']
        },
        {
          id: 'bottomtray',
          title: 'Breiter App-Tray unten',
          tag: 'Drag & Drop Fokus',
          summary: 'Breite App- und Symbol-Galerie unter dem Raster, schmaler Aktions-Inspektor rechts.',
          pros: ['Viele App-Icons gleichzeitig sichtbar', 'Schnelles Drag-&-Drop ins Raster'],
          cons: ['Reduziert Raster-Höhe etwas']
        }
      ]
    },
    {
      id: 'connect',
      step: '5',
      name: 'Reiter „Verbinden“',
      short: 'Verbinden',
      desc: 'Aufgeräumtes Onboarding ohne Fake-Graphen: Server-APK-QR, Sofort-Verbinden-QR, 6-stellige PIN & Anfragen.',
      variants: [
        {
          id: 'dual',
          title: 'Zwei QR nebeneinander',
          tag: 'Empfohlen · Klar',
          summary: 'Links „1. Handy-App installieren“ (APK-QR), rechts „2. Verbinden“ (Sofort-QR + 6-stellige PIN).',
          pros: ['Beide Schritte sofort parallel', 'Null Modus-Verwirrung'],
          cons: ['Braucht zwei Karten nebeneinander']
        },
        {
          id: 'single',
          title: 'Zentraler QR mit Toggle',
          tag: 'Fokussiert · Groß',
          summary: 'Ein großer, extrem gut scanbarer QR-Code in der Mitte mit Umschalter „Verbinden | App laden“.',
          pros: ['Größter QR für schwierige Kameras', 'Sehr ruhiges Layout'],
          cons: ['Zweiter QR erst nach Klick sichtbar']
        },
        {
          id: 'wizard',
          title: '3-Schritt-Onboarding',
          tag: 'Geführt',
          summary: 'Führt Schritt für Schritt durch App-Download, Scan/PIN-Kopplung und Live-Bestätigung.',
          pros: ['Perfekt für Ersteinrichtung', 'Klare Fortschritts-Logik'],
          cons: ['Ein Klick mehr für Profis']
        }
      ]
    },
    {
      id: 'devices',
      step: '6',
      name: 'Reiter „Geräte“',
      short: 'Geräte',
      desc: 'Verwaltung gekoppelter Smartphones & Tablets mit Status, IP, Latenz und Widerruf.',
      variants: [
        {
          id: 'list',
          title: 'Kompakte Status-Liste',
          tag: 'Dicht · Schnell',
          summary: 'Tabellarische Zeilen mit Online-LED, Gerätetyp, IP, Ping und direktem Widerrufen-Button.',
          pros: ['Sehr übersichtlich ab 4+ Geräten', 'Alle Kennzahlen in einer Zeile'],
          cons: ['Weniger visuelles Feedback']
        },
        {
          id: 'cards',
          title: 'Geräte-Karten mit Vorschau',
          tag: 'Visuell · 1:1',
          summary: 'Jedes Gerät als Hardware-Karte mit Ausrichtung (Quer/Frei), aktivem Profil, Ping-Test und Widerruf.',
          pros: ['Sofort erkennbar welches Gerät gemeint ist', 'Platz für Startseite & Schnelltest'],
          cons: ['Nimmt mehr Fläche ein']
        },
        {
          id: 'master',
          title: 'Master-Detail-Ansicht',
          tag: 'Profi · Tiefgang',
          summary: 'Links Geräteliste, rechts Detail-Inspektor für Startseite, Raster-Override und SHA-256-Token.',
          pros: ['Saubere Detail-Konfiguration pro Gerät', 'Übersichtlich bei Multi-Tablet-Setups'],
          cons: ['Für 1 einzelnes Handy etwas groß']
        }
      ]
    },
    {
      id: 'settings',
      step: '7',
      name: 'Reiter „Einstellungen“',
      short: 'Einstellungen',
      desc: 'Design-Steuerung (Theme, Akzent, Radius), Lizenzstatus (Standard/Pro/Team) und lokale Sicherheit.',
      variants: [
        {
          id: 'bento',
          title: 'Bento-Grid (3 Karten)',
          tag: 'Ausgewogen',
          summary: 'Design mit Live-4-Kachel-Vorschau links, Lizenz-Status und Sicherheit kompakt daneben.',
          pros: ['Alles Wichtige auf einem Bildschirm', 'Keine versteckten Untermenüs'],
          cons: ['Wenig Raum für erweiterte Optionen']
        },
        {
          id: 'subnav',
          title: 'Unter-Navigation links',
          tag: 'Skalierbar',
          summary: 'Klare Kategorien (Erscheinungsbild, Lizenz, Sicherheit, Updates) links, ruhige Detailfläche rechts.',
          pros: ['Wächst sauber mit weiteren Optionen', 'Sehr strukturierte Optik'],
          cons: ['Erfordert Klick zum Wechseln']
        },
        {
          id: 'split',
          title: 'Live-Design-Split',
          tag: 'Vorschau-Fokus',
          summary: 'Links kompakte Regler für Theme, Akzent, Radius & Tastenform; rechts große Echtzeit-Deck-Vorschau.',
          pros: ['Design-Wirkung sofort im Großformat', 'Lizenz-Leiste bleibt dezent oben'],
          cons: ['Fokus liegt klar auf Design']
        }
      ]
    }
  ];

  const TILE_STYLES = [
    {
      id: 'keycap',
      name: 'Tactile Keycap',
      desc: 'Mattes Gehäuse mit 1px Oberlicht und tiefem Druckgefühl.'
    },
    {
      id: 'flat',
      name: 'Flat Precision',
      desc: 'Plane 1px-Haarlinien ohne Schatten — maximal ruhig.'
    },
    {
      id: 'ceramic',
      name: 'Soft Ceramic',
      desc: 'Weiche Radien und sanfter innerer Flächenverlauf.'
    },
    {
      id: 'led',
      name: 'Broadcast LED',
      desc: 'Präzise Status-Lichtleiste an der Kachel-Unterkante.'
    }
  ];

  const ICONS = {
    editor: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M9.5 9.5v10.5"/>',
    connect: '<path d="M5 12.5a7 7 0 0 1 14 0"/><path d="M2 12.5a10 10 0 0 1 20 0"/><circle cx="12" cy="18" r="1.6"/>',
    devices: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8M5.2 5.2l2 2M16.8 16.8l2 2M18.8 5.2l-2 2M7.2 16.8l-2 2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
    micOff: '<line x1="3" y1="3" x2="21" y2="21"/><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.9-.8"/><path d="M5 11a7 7 0 0 0 11.4 5.4M12 18v3M8 21h8"/>',
    volume: '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.4 5.6a9 9 0 0 1 0 12.8"/>',
    play: '<polygon points="7,4 20,12 7,20"/>',
    next: '<polygon points="5,5 15,12 5,19"/><line x1="19" y1="5" x2="19" y2="19"/>',
    prev: '<polygon points="19,5 9,12 19,19"/><line x1="5" y1="5" x2="5" y2="19"/>',
    record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2" fill="#EF4444" stroke="none"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
    screen: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    mixer: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4"/>',
    power: '<path d="M12 3v9"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    camera: '<path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
  };

  const APPS = {
    software: [
      { id: 'discord', name: 'Discord', abbr: 'DC', color: '#5865F2', path: 'C:\\Users\\torbe\\AppData\\Local\\Discord\\Discord.exe' },
      { id: 'spotify', name: 'Spotify', abbr: 'SP', color: '#1DB954', path: 'shell:AppsFolder\\SpotifyAB.SpotifyMusic!Spotify' },
      { id: 'obs', name: 'OBS Studio', abbr: 'OBS', color: '#334155', path: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' },
      { id: 'steam', name: 'Steam', abbr: 'ST', color: '#1B2838', path: 'C:\\Program Files (x86)\\Steam\\steam.exe' },
      { id: 'vscode', name: 'VS Code', abbr: 'VS', color: '#007ACC', path: 'C:\\Users\\torbe\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe' },
      { id: 'blender', name: 'Blender 5.3', abbr: 'BL', color: '#EA7600', path: 'C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender-launcher.exe' },
      { id: 'epic', name: 'Epic Games', abbr: 'EG', color: '#2A2E35', path: 'C:\\Program Files\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe' },
      { id: 'teams', name: 'MS Teams', abbr: 'TM', color: '#4B53BC', path: 'shell:AppsFolder\\MSTeams_8wekyb3d8bbwe!MSTeams' },
      { id: 'terminal', name: 'Terminal', abbr: 'WT', color: '#27272A', path: 'shell:AppsFolder\\Microsoft.WindowsTerminal_8wekyb3d8bbwe!App' },
      { id: 'davinci', name: 'DaVinci', abbr: 'DR', color: '#0F766E', path: 'C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Resolve.exe' }
    ],
    browser: [
      { id: 'edge', name: 'Microsoft Edge', abbr: 'ED', color: '#0284C7', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
      { id: 'chrome', name: 'Google Chrome', abbr: 'CR', color: '#2563EB', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
      { id: 'firefox', name: 'Firefox', abbr: 'FF', color: '#EA580C', path: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe' },
      { id: 'brave', name: 'Brave', abbr: 'BR', color: '#DC2626', path: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe' },
      { id: 'opera', name: 'Opera GX', abbr: 'GX', color: '#E11D48', path: 'C:\\Users\\torbe\\AppData\\Local\\Programs\\Opera GX\\opera.exe' }
    ],
    symbols: [
      { id: 'mic', name: 'Mikrofon', icon: 'mic' },
      { id: 'volume', name: 'Lautstärke', icon: 'volume' },
      { id: 'play', name: 'Play / Pause', icon: 'play' },
      { id: 'next', name: 'Nächster Titel', icon: 'next' },
      { id: 'prev', name: 'Vorheriger Titel', icon: 'prev' },
      { id: 'record', name: 'Aufnahme', icon: 'record' },
      { id: 'folder', name: 'Ordner öffnen', icon: 'folder' },
      { id: 'lock', name: 'PC sperren', icon: 'lock' },
      { id: 'terminal', name: 'Konsole', icon: 'terminal' },
      { id: 'screen', name: 'Szene / Monitor', icon: 'screen' },
      { id: 'mixer', name: 'Audio-Mixer', icon: 'mixer' },
      { id: 'camera', name: 'Kamera', icon: 'camera' },
      { id: 'globe', name: 'Browser-Start', icon: 'globe' },
      { id: 'power', name: 'Energie', icon: 'power' }
    ]
  };

  const SAMPLE_PAGES = [
    { id: 'home', name: 'Home', grid: '5×3', active: true },
    { id: 'music', name: 'Musik', grid: '5×3', active: false },
    { id: 'stream', name: 'Stream', grid: '6×3', active: false },
    { id: 'mixer', name: 'Mixer', grid: '4×2', active: false }
  ];

  const SAMPLE_TILES = [
    { idx: 0, kind: 'app', appId: 'discord', label: 'Discord', abbr: 'DC', color: '#5865F2', actionType: 'app', target: 'C:\\Users\\torbe\\AppData\\Local\\Discord\\Discord.exe', stateSrc: '' },
    { idx: 1, kind: 'app', appId: 'spotify', label: 'Spotify', abbr: 'SP', color: '#1DB954', actionType: 'app', target: 'shell:AppsFolder\\SpotifyAB.SpotifyMusic!Spotify', stateSrc: '' },
    { idx: 2, kind: 'app', appId: 'obs', label: 'OBS Studio', abbr: 'OBS', color: '#334155', actionType: 'app', target: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe', stateSrc: '' },
    { idx: 3, kind: 'symbol', icon: 'micOff', label: 'Mikrofon stumm', color: '#EF4444', actionType: 'mic', target: 'Standardmikrofon', stateSrc: 'mic', state: 'muted' },
    { idx: 4, kind: 'symbol', icon: 'volume', label: 'Master-Lautstärke', color: '', actionType: 'volume', target: 'Master 68 %', stateSrc: 'volume', state: 'vol', value: 68 },
    { idx: 5, kind: 'symbol', icon: 'record', label: 'Aufnahme an/aus', color: '#EF4444', actionType: 'record', target: 'OBS Aufnahme', stateSrc: 'recording', state: 'rec' },
    { idx: 6, kind: 'app', appId: 'vscode', label: 'VS Code', abbr: 'VS', color: '#007ACC', actionType: 'app', target: 'C:\\Users\\torbe\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe', stateSrc: '' },
    { idx: 7, kind: 'app', appId: 'edge', label: 'Microsoft Edge', abbr: 'ED', color: '#0284C7', actionType: 'app', target: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', stateSrc: '' },
    { idx: 8, kind: 'symbol', icon: 'play', label: 'Medien Play/Pause', color: '', actionType: 'media', target: 'Play / Pause', stateSrc: '', state: 'active' },
    { idx: 9, kind: 'symbol', icon: 'next', label: 'Nächster Titel', color: '', actionType: 'media', target: 'Nächster Titel', stateSrc: '' },
    { idx: 10, kind: 'app', appId: 'steam', label: 'Steam', abbr: 'ST', color: '#1B2838', actionType: 'app', target: 'C:\\Program Files (x86)\\Steam\\steam.exe', stateSrc: '' },
    { idx: 11, kind: 'app', appId: 'blender', label: 'Blender 5.3', abbr: 'BL', color: '#EA7600', actionType: 'app', target: 'C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender-launcher.exe', stateSrc: '' },
    { idx: 12, kind: 'symbol', icon: 'folder', label: 'Projektordner', color: '#F59E0B', actionType: 'path', target: 'D:\\Projekte\\StreamDeck', stateSrc: '' },
    { idx: 13, kind: 'symbol', icon: 'lock', label: 'PC sperren', color: '', actionType: 'system', target: 'Windows sperren', stateSrc: '' },
    { idx: 14, kind: 'empty', label: 'Freie Taste', color: '', actionType: 'none', target: '', stateSrc: '' }
  ];

  const SAMPLE_DEVICES = [
    {
      id: 'a16',
      name: 'Samsung Galaxy A16',
      kind: 'Smartphone',
      orient: 'Querformat-Pflicht (8×3)',
      ip: '192.168.1.42',
      online: true,
      latency: '5.4 ms',
      lastSeen: 'jetzt live',
      page: 'Home',
      tokenHash: 'sha256:9f82a4…c14b'
    },
    {
      id: 'tabs9',
      name: 'Galaxy Tab S9',
      kind: 'Tablet',
      orient: 'Hoch & Quer frei (8×4)',
      ip: '192.168.1.67',
      online: true,
      latency: '6.8 ms',
      lastSeen: 'vor 12 s',
      page: 'Mixer',
      tokenHash: 'sha256:4b10e9…77d2'
    },
    {
      id: 'pixel7',
      name: 'Pixel 7 Backup',
      kind: 'Smartphone',
      orient: 'Querformat-Pflicht (6×3)',
      ip: '192.168.1.89',
      online: false,
      latency: '–',
      lastSeen: 'gestern, 21:14',
      page: 'Home',
      tokenHash: 'sha256:1d7c30…a90f'
    }
  ];

  const SAMPLE_PENDING = {
    id: 'req-pixel8',
    name: 'Google Pixel 8',
    ip: '192.168.1.104',
    kind: 'Smartphone · Android 15',
    time: 'gerade eben'
  };

  function makeQrSvg(seed, pxSize) {
    const n = 21;
    const size = pxSize || 148;
    let h = 2166136261;
    const str = String(seed || 'novora');
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const nextBit = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return (h >>> 0) & 1;
    };
    const isFinder = (r, c, fr, fc) => {
      const dr = r - fr;
      const dc = c - fc;
      if (dr < 0 || dc < 0 || dr > 6 || dc > 6) return false;
      if (dr === 0 || dr === 6 || dc === 0 || dc === 6) return true;
      return dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
    };
    const inQuietFinder = (r, c) =>
      (r <= 7 && c <= 7) || (r <= 7 && c >= n - 8) || (r >= n - 8 && c <= 7);

    let rects = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        let on = false;
        if (inQuietFinder(r, c)) {
          on = isFinder(r, c, 0, 0) || isFinder(r, c, 0, n - 7) || isFinder(r, c, n - 7, 0);
        } else if (r === 6 || c === 6) {
          on = (r + c) % 2 === 0;
        } else {
          on = nextBit() === 1;
        }
        if (on) {
          rects += `<rect x="${c + 1}" y="${r + 1}" width="1" height="1"/>`;
        }
      }
    }
    return `<svg viewBox="0 0 ${n + 2} ${n + 2}" width="${size}" height="${size}" class="qr-svg" shape-rendering="crispEdges" aria-hidden="true"><rect width="${n + 2}" height="${n + 2}" fill="#ffffff" rx="1.5"/><g fill="#111214">${rects}</g></svg>`;
  }

  global.NOVORA_STUDIO_DATA = {
    THEMES,
    PARTS,
    TILE_STYLES,
    ICONS,
    APPS,
    SAMPLE_PAGES,
    SAMPLE_TILES,
    SAMPLE_DEVICES,
    SAMPLE_PENDING,
    makeQrSvg
  };
})(typeof window !== 'undefined' ? window : globalThis);
