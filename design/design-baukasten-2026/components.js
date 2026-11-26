(function (global) {
  'use strict';

  function esc(val) {
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function svgIcon(name, cls) {
    const D = global.NOVORA_STUDIO_DATA;
    const path = (D && D.ICONS && D.ICONS[name]) || D.ICONS.globe || '';
    const c = cls ? ` class="${cls}"` : '';
    return `<svg viewBox="0 0 24 24"${c} aria-hidden="true">${path}</svg>`;
  }

  function renderTile(tile, tileStyle, isSelected, attrs) {
    const t = tile || { kind: 'empty', label: 'Freie Taste' };
    const ts = tileStyle || 'keycap';
    const selCls = isSelected ? ' sel' : '';
    const stCls =
      t.state === 'muted'
        ? ' st-muted'
        : t.state === 'rec'
          ? ' st-rec'
          : t.state === 'active'
            ? ' st-active'
            : '';
    const kindCls = t.kind === 'app' ? ' kind-app' : t.kind === 'empty' ? ' kind-empty' : ' kind-sym';
    const bgStyle =
      t.kind === 'app' && t.color
        ? ` style="background:linear-gradient(155deg,${esc(t.color)} 0%,rgba(12,14,18,0.86) 125%);"`
        : t.color && t.kind === 'symbol' && t.state !== 'muted'
          ? ` style="border-color:${esc(t.color)};"`
          : '';
    const titleAttr = ` title="${esc(t.label || 'Freie Taste')}"`;
    const extraAttrs = attrs ? ` ${attrs}` : '';

    let inner = '';
    if (t.kind === 'app') {
      inner = `<div class="tile-app-mark">${esc(t.abbr || 'APP')}</div>`;
    } else if (t.kind === 'empty') {
      inner = svgIcon('plus', 'tile-sym');
    } else if (t.state === 'vol') {
      const pct = Math.max(0, Math.min(100, Number(t.value || 68)));
      const r = 17;
      const circ = 2 * Math.PI * r;
      const dash = ((pct / 100) * circ).toFixed(1);
      inner = `
        <div class="tile-vol-wrap">
          <svg class="tile-vol-ring" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="${r}" fill="none" stroke="rgba(128,128,128,0.28)" stroke-width="3.2"/>
            <circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--accent)" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="${dash} ${circ.toFixed(1)}"/>
          </svg>
          <span class="tile-vol-num">${pct}</span>
        </div>`;
    } else {
      inner = svgIcon(t.icon || 'play', 'tile-sym');
      if (t.state === 'rec') {
        inner += '<span class="tile-rec-dot" aria-hidden="true"></span>';
      }
    }

    return `<button type="button" class="tile ts-${esc(ts)}${kindCls}${stCls}${selCls}"${bgStyle}${titleAttr}${extraAttrs}>${inner}</button>`;
  }

  function renderMiniEditorPreview(themeId) {
    const D = global.NOVORA_STUDIO_DATA;
    const sample = D.SAMPLE_TILES.slice(0, 8);
    const tileStyle = themeId === 'monolith' ? 'flat' : themeId === 'glass' ? 'ceramic' : themeId === 'slate' ? 'led' : 'keycap';
    return `
      <div class="mini-shell" data-preview-theme="${esc(themeId)}">
        <div class="mini-topbar">
          <span class="nmark" style="width:16px;height:16px;font-size:9px;border-radius:4px">N</span>
          <span>Novora</span>
          <span style="color:var(--dim);font-weight:400">· PC-Editor</span>
          <span style="margin-left:auto" class="pill ok"><span class="status-dot"></span> 1 live</span>
        </div>
        <div class="mini-body">
          <div class="mini-rail">
            <span class="on">${svgIcon('editor')}</span>
            <span>${svgIcon('connect')}</span>
            <span>${svgIcon('devices')}</span>
            <span style="margin-top:auto">${svgIcon('settings')}</span>
          </div>
          <div class="mini-pages">
            <div class="mini-pg on"><span class="status-dot"></span>Home</div>
            <div class="mini-pg"><span class="status-dot off"></span>Musik</div>
            <div class="mini-pg"><span class="status-dot off"></span>Stream</div>
            <div class="mini-pg"><span class="status-dot off"></span>Mixer</div>
          </div>
          <div class="mini-stage">
            <div class="mini-grid">
              ${sample.map((t, i) => renderTile(t, tileStyle, i === 0, '')).join('')}
            </div>
          </div>
          <div class="mini-insp">
            <div style="font-size:9px;font-weight:700;color:var(--dim);letter-spacing:.08em">TASTE 1</div>
            <div class="mini-bar acc"></div>
            <div class="mini-bar"></div>
            <div class="mini-bar" style="width:80%"></div>
            <div style="margin-top:auto" class="mini-bar acc"></div>
          </div>
        </div>
      </div>`;
  }

  function navItemsList() {
    return [
      { id: 'editor', label: 'Editor', icon: 'editor', badge: '' },
      { id: 'connect', label: 'Verbinden', icon: 'connect', badge: '1' },
      { id: 'devices', label: 'Geräte', icon: 'devices', badge: '2' },
      { id: 'settings', label: 'Einstellungen', icon: 'settings', badge: '' }
    ];
  }

  function renderNavPart(variant, ctx) {
    const activeTab = (ctx && ctx.navTab) || 'editor';
    const items = navItemsList();
    const clickAttr = (id) => `data-action="set-demo-tab" data-tab="${id}"`;

    if (variant === 'toptabs') {
      return `
        <div class="demo-winbar">
          <span class="nmark" style="width:20px;height:20px;font-size:10.5px">N</span>
          <b style="font-size:12px">Novora</b>
          <div class="seg" style="margin-left:8px">
            ${items.map((it) => `<button type="button" class="${activeTab === it.id ? 'on' : ''}" ${clickAttr(it.id)}>${esc(it.label)}${it.badge ? ` (${it.badge})` : ''}</button>`).join('')}
          </div>
          <span style="margin-left:auto" class="pill ok"><span class="status-dot"></span> 6 ms</span>
        </div>
        <div class="demo-body" style="padding:12px;align-items:center;justify-content:center;color:var(--text-2);font-size:12px">
          Aktiver Reiter: <b style="color:var(--text);margin:0 5px">${esc(items.find((x) => x.id === activeTab).label)}</b> · +68 px extra Breite für das Kachel-Raster
        </div>`;
    }

    if (variant === 'sidebar') {
      return `
        <div class="demo-winbar">
          <span class="nmark" style="width:20px;height:20px;font-size:10.5px">N</span>
          <b style="font-size:12px">Novora · PC-Editor</b>
          <span style="margin-left:auto" class="pill ok"><span class="status-dot"></span> gespeichert</span>
        </div>
        <div class="demo-body">
          <div class="nav-sidebar">
            <div class="col-lbl">Bereiche</div>
            ${items.map((it) => `<button type="button" class="nav-side-btn ${activeTab === it.id ? 'on' : ''}" ${clickAttr(it.id)}>${svgIcon(it.icon)}<span>${esc(it.label)}</span>${it.badge ? `<span class="pg-meta">${it.badge}</span>` : ''}</button>`).join('')}
          </div>
          <div style="flex:1;display:grid;place-items:center;color:var(--text-2);font-size:12px;padding:12px">
            Reiter + Klartext-Navigation links
          </div>
        </div>`;
    }

    if (variant === 'dock') {
      return `
        <div class="demo-winbar">
          <span class="nmark" style="width:20px;height:20px;font-size:10.5px">N</span>
          <b style="font-size:12px">Novora Studio</b>
          <span style="margin-left:auto" class="pill">Lokal · 127.0.0.1</span>
        </div>
        <div class="demo-body">
          <div class="nav-dock-wrap">
            <div class="nav-dock">
              ${items.map((it) => `<button type="button" class="nav-rail-btn ${activeTab === it.id ? 'on' : ''}" ${clickAttr(it.id)}>${svgIcon(it.icon)}<span>${esc(it.id === 'settings' ? 'Setup' : it.label)}</span>${it.badge ? `<i class="nav-badge">${it.badge}</i>` : ''}</button>`).join('')}
            </div>
          </div>
          <div style="flex:1;display:grid;place-items:center;color:var(--text-2);font-size:12px;padding:12px">
            Schwebendes Studio-Dock für „${esc(items.find((x) => x.id === activeTab).label)}“
          </div>
        </div>`;
    }

    return `
      <div class="demo-winbar">
        <span class="nmark" style="width:20px;height:20px;font-size:10.5px">N</span>
        <b style="font-size:12px">Novora · PC-Editor</b>
        <span style="margin-left:auto" class="pill ok"><span class="status-dot"></span> 1 live</span>
      </div>
      <div class="demo-body">
        <div class="nav-rail">
          ${items.map((it) => `<button type="button" class="nav-rail-btn ${activeTab === it.id ? 'on' : ''}" ${clickAttr(it.id)}>${svgIcon(it.icon)}<span>${esc(it.id === 'settings' ? 'Setup' : it.label)}</span>${it.badge ? `<i class="nav-badge">${it.badge}</i>` : ''}</button>`).join('')}
        </div>
        <div style="flex:1;display:grid;place-items:center;color:var(--text-2);font-size:12px;padding:12px">
          Kompakte 64 px Rail · Fokus auf „${esc(items.find((x) => x.id === activeTab).label)}“
        </div>
      </div>`;
  }

  function renderPagesPart(variant, ctx) {
    const D = global.NOVORA_STUDIO_DATA;
    const activePage = (ctx && ctx.activePage) || 'home';
    const pages = D.SAMPLE_PAGES;
    const previewTiles = D.SAMPLE_TILES.slice(0, 4);

    if (variant === 'tabs') {
      return `
        <div class="pages-tabs-bar">
          ${pages.map((p) => `<button type="button" class="pg-tab ${activePage === p.id ? 'on' : ''}" data-action="set-page" data-page="${p.id}"><span class="status-dot ${activePage === p.id ? '' : 'off'}"></span><span>${esc(p.name)}</span><span class="pg-meta">${esc(p.grid)}</span></button>`).join('')}
          <button type="button" class="btn sm" data-action="toast" data-msg="Neue Seite anlegen">+ Seite</button>
        </div>
        <div style="flex:1;padding:14px;display:flex;align-items:center;justify-content:center">
          <div class="deck-grid" style="grid-template-columns:repeat(4,54px)">
            ${previewTiles.map((t, i) => renderTile(t, (ctx && ctx.tileStyle) || 'keycap', i === 0, '')).join('')}
          </div>
        </div>`;
    }

    if (variant === 'minicards') {
      return `
        <div class="demo-body">
          <div class="pages-minicards">
            <div class="col-lbl">Seiten</div>
            ${pages.map((p, idx) => `
              <button type="button" class="mini-pg-card ${activePage === p.id ? 'on' : ''}" data-action="set-page" data-page="${p.id}">
                <div style="display:flex;align-items:center;justify-content:space-between;font-size:11.5px;font-weight:600">
                  <span>${esc(p.name)}</span><span class="pg-meta">${esc(p.grid)}</span>
                </div>
                <div class="mini-pg-dots">
                  ${[0, 1, 2, 3, 4, 5, 6, 7].map((d) => `<i class="${(d + idx) % 3 !== 2 ? 'fill' : ''}"></i>`).join('')}
                </div>
              </button>`).join('')}
          </div>
          <div style="flex:1;padding:14px;display:grid;place-items:center;color:var(--text-2);font-size:12px">
            Aktive Seite: <b style="color:var(--text)">${esc(pages.find((x) => x.id === activePage).name)}</b>
          </div>
        </div>`;
    }

    return `
      <div class="demo-body">
        <div class="pages-col">
          <div class="col-lbl">Seiten</div>
          ${pages.map((p) => `<button type="button" class="pg-row ${activePage === p.id ? 'on' : ''}" data-action="set-page" data-page="${p.id}"><span class="status-dot ${activePage === p.id ? '' : 'off'}"></span><span>${esc(p.name)}</span><span class="pg-meta">${esc(p.grid)}</span></button>`).join('')}
          <button type="button" class="btn sm" style="margin-top:auto" data-action="toast" data-msg="Neue Seite angelegt">+ Neue Seite</button>
        </div>
        <div style="flex:1;padding:14px;display:flex;align-items:center;justify-content:center">
          <div class="deck-grid" style="grid-template-columns:repeat(4,54px)">
            ${previewTiles.map((t, i) => renderTile(t, (ctx && ctx.tileStyle) || 'keycap', i === 0, '')).join('')}
          </div>
        </div>
      </div>`;
  }

  function renderStagePart(variant, ctx) {
    const D = global.NOVORA_STUDIO_DATA;
    const cols = Math.max(3, Math.min(6, (ctx && ctx.gridCols) || 5));
    const rows = Math.max(2, Math.min(4, (ctx && ctx.gridRows) || 3));
    const tileStyle = (ctx && ctx.tileStyle) || 'keycap';
    const selIdx = (ctx && typeof ctx.selectedTileIdx === 'number') ? ctx.selectedTileIdx : 0;
    const tiles = D.SAMPLE_TILES.slice(0, cols * rows);
    while (tiles.length < cols * rows) {
      tiles.push({ idx: tiles.length, kind: 'empty', label: 'Freie Taste' });
    }
    const tilePx = cols >= 6 ? 50 : 58;
    const gridHtml = `
      <div class="deck-grid" style="grid-template-columns:repeat(${cols},${tilePx}px)">
        ${tiles.map((t, i) => renderTile(t, tileStyle, i === selIdx, `data-action="select-tile" data-idx="${i}"`)).join('')}
      </div>`;

    const headerBar = `
      <div class="stage-bar">
        <b style="font-size:13px">${esc((ctx && ctx.pageName) || 'Home')}</b>
        <span class="pill">${cols}×${rows} · 1:1</span>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <div class="stepper">
            <button type="button" data-action="step-grid" data-axis="cols" data-delta="-1">−</button>
            <span>${cols}</span>
            <button type="button" data-action="step-grid" data-axis="cols" data-delta="1">+</button>
          </div>
          <span style="color:var(--dim)">×</span>
          <div class="stepper">
            <button type="button" data-action="step-grid" data-axis="rows" data-delta="-1">−</button>
            <span>${rows}</span>
            <button type="button" data-action="step-grid" data-axis="rows" data-delta="1">+</button>
          </div>
        </div>
      </div>`;

    if (variant === 'canvas') {
      return `
        <div class="stage-area canvas-bg">
          ${headerBar}
          <div class="deck-center">${gridHtml}</div>
        </div>`;
    }
    if (variant === 'bezel') {
      return `
        <div class="stage-area">
          ${headerBar}
          <div class="deck-center">
            <div class="device-bezel">
              <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#9CA3AF">
                <span>Samsung A16 · Querformat</span>
                <span style="color:#22C55E">● 5.4 ms</span>
              </div>
              ${gridHtml}
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="stage-area">
        ${headerBar}
        <div class="deck-center">
          <div class="hardware-frame">${gridHtml}</div>
        </div>
      </div>`;
  }

  function renderTileStylesShowcase(selectedStyle) {
    const D = global.NOVORA_STUDIO_DATA;
    const states = [
      D.SAMPLE_TILES[0],
      D.SAMPLE_TILES[3],
      D.SAMPLE_TILES[4],
      D.SAMPLE_TILES[5]
    ];
    return `
      <div class="tilestyle-strip">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div>
            <h3 style="font-size:14.5px;font-weight:650">Kachel-Ausführungen (immer 1:1 quadratisch, ohne Schrift auf Tasten)</h3>
            <p class="variant-summary">Vergleich anhand derselben 4 Zustände: App-Fläche, Mikro stumm (roter Puls), Lautstärke-Ring (68) und Aufnahme (roter Punkt).</p>
          </div>
        </div>
        <div class="tilestyle-cards">
          ${D.TILE_STYLES.map((ts) => `
            <div class="ts-card ${selectedStyle === ts.id ? 'on' : ''}" data-action="pick-tilestyle" data-style="${ts.id}" role="button" tabindex="0">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                <b style="font-size:12.5px">${esc(ts.name)}</b>
                <span class="part-pick-tag">${selectedStyle === ts.id ? 'Aktiv' : 'Wählen'}</span>
              </div>
              <div class="ts-mini-row">
                ${states.map((st, idx) => renderTile(st, ts.id, idx === 0 && selectedStyle === ts.id, '')).join('')}
              </div>
              <span style="font-size:11px;color:var(--text-2)">${esc(ts.desc)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function renderInspectorPart(variant, ctx) {
    const D = global.NOVORA_STUDIO_DATA;
    const libTab = (ctx && ctx.libTab) || 'software';
    const query = ((ctx && ctx.libSearch) || '').trim().toLowerCase();
    const inspSubTab = (ctx && ctx.inspSubTab) || 'look';
    const fgCd = (ctx && ctx.fgCountdown) || 0;
    const tile = (ctx && ctx.tile) || D.SAMPLE_TILES[0];

    const list = (D.APPS[libTab] || D.APPS.software).filter((item) =>
      !query || item.name.toLowerCase().includes(query)
    );

    const pickerHtml = `
      <div style="display:flex;flex-direction:column;gap:7px">
        <div class="seg" style="width:100%">
          <button type="button" style="flex:1" class="${libTab === 'software' ? 'on' : ''}" data-action="set-libtab" data-libtab="software">Software</button>
          <button type="button" style="flex:1" class="${libTab === 'browser' ? 'on' : ''}" data-action="set-libtab" data-libtab="browser">Browser</button>
          <button type="button" style="flex:1" class="${libTab === 'symbols' ? 'on' : ''}" data-action="set-libtab" data-libtab="symbols">Symbole</button>
        </div>
        <div style="display:flex;gap:6px">
          <input class="inp" value="${esc((ctx && ctx.libSearch) || '')}" placeholder="Apps durchsuchen …" data-action="lib-search">
          <button type="button" class="btn sm" data-action="toast" data-msg="25 installierte PC-Apps gescannt">Scan</button>
        </div>
        <div class="lib-grid">
          ${list.slice(0, 10).map((it) => `
            <button type="button" class="lib-cell" title="${esc(it.name)}" data-action="toast" data-msg="Ausgewählt: ${esc(it.name)}">
              ${it.icon ? svgIcon(it.icon, 'tile-sym') : `<span class="lib-badge" style="background:${esc(it.color)}">${esc(it.abbr)}</span>`}
            </button>`).join('')}
        </div>
        <button type="button" class="btn sm" data-action="fg-capture">
          ${fgCd > 0 ? `Fenster erfassen in ${fgCd} s …` : 'Aktives Fenster übernehmen (3s)'}
        </button>
      </div>`;

    const actionFormHtml = `
      <div style="display:flex;flex-direction:column;gap:7px">
        <div>
          <div style="font-size:11px;color:var(--text-2);margin-bottom:3px">Aktion</div>
          <select class="inp">
            <option value="app"${tile.actionType === 'app' ? ' selected' : ''}>Installierte App öffnen</option>
            <option value="hotkey">Tastenkombination</option>
            <option value="media"${tile.actionType === 'media' ? ' selected' : ''}>Mediensteuerung</option>
            <option value="volume"${tile.actionType === 'volume' ? ' selected' : ''}>Lautstärke</option>
            <option value="mic"${tile.actionType === 'mic' ? ' selected' : ''}>Mikrofon stumm</option>
            <option value="record"${tile.actionType === 'record' ? ' selected' : ''}>Aufnahme an/aus</option>
            <option value="path"${tile.actionType === 'path' ? ' selected' : ''}>Ordner / Datei öffnen</option>
            <option value="system"${tile.actionType === 'system' ? ' selected' : ''}>System / Energie</option>
          </select>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-2);margin-bottom:3px">Ziel / Parameter</div>
          <input class="inp" style="font-family:var(--mono);font-size:11px" value="${esc(tile.target || 'C:\\Users\\torbe\\AppData\\Local\\Discord\\Discord.exe')}" readonly>
        </div>
        <div class="swatches">
          ${['#5865F2', '#1DB954', '#FF5A1F', '#22D3EE', '#E5A93C', '#EF4444'].map((c) => `<button type="button" class="sw ${tile.color === c ? 'on' : ''}" style="background:${c}" data-action="toast" data-msg="Tastenfarbe ${c}"></button>`).join('')}
        </div>
      </div>`;

    const previewHead = `
      <div class="insp-prev">
        ${renderTile(tile, (ctx && ctx.tileStyle) || 'keycap', false, '')}
        <div style="min-width:0">
          <b style="font-size:13px;display:block">${esc(tile.label || 'Taste')}</b>
          <span style="font-size:11px;color:var(--text-2)">${esc(tile.actionType === 'app' ? 'Installierte App' : 'System-Aktion')}</span>
        </div>
      </div>`;

    if (variant === 'twotab') {
      return `
        <div class="insp-col">
          ${previewHead}
          <div class="seg" style="width:100%">
            <button type="button" style="flex:1" class="${inspSubTab === 'look' ? 'on' : ''}" data-action="set-insptab" data-insptab="look">Aussehen &amp; App</button>
            <button type="button" style="flex:1" class="${inspSubTab === 'action' ? 'on' : ''}" data-action="set-insptab" data-insptab="action">Aktion &amp; Zustand</button>
          </div>
          ${inspSubTab === 'look' ? pickerHtml : actionFormHtml}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:auto">
            <button type="button" class="btn sm" data-action="toast" data-msg="Aktion am PC getestet">▶ Testen</button>
            <button type="button" class="btn sm danger" data-action="toast" data-msg="Taste geleert">Entfernen</button>
          </div>
        </div>`;
    }

    if (variant === 'popover') {
      return `
        <div class="demo-body" style="position:relative;background:var(--bg)">
          <div style="flex:1;display:grid;place-items:center;padding:12px">
            <div class="deck-grid" style="grid-template-columns:repeat(3,54px)">
              ${D.SAMPLE_TILES.slice(0, 6).map((t, i) => renderTile(t, (ctx && ctx.tileStyle) || 'keycap', i === 0, '')).join('')}
            </div>
          </div>
          <div class="popover-drawer">
            ${previewHead}
            ${pickerHtml}
          </div>
        </div>`;
    }

    if (variant === 'bottomtray') {
      return `
        <div style="display:flex;flex-direction:column;flex:1;min-height:0">
          <div class="demo-body">
            <div style="flex:1;display:grid;place-items:center;padding:10px">
              <div class="deck-grid" style="grid-template-columns:repeat(4,48px)">
                ${D.SAMPLE_TILES.slice(0, 4).map((t, i) => renderTile(t, (ctx && ctx.tileStyle) || 'keycap', i === 0, '')).join('')}
              </div>
            </div>
            <div class="insp-col" style="width:270px">${actionFormHtml}</div>
          </div>
          <div class="bottom-tray">
            <div style="display:flex;align-items:center;gap:8px">
              <div class="seg">
                <button type="button" class="${libTab === 'software' ? 'on' : ''}" data-action="set-libtab" data-libtab="software">Software</button>
                <button type="button" class="${libTab === 'browser' ? 'on' : ''}" data-action="set-libtab" data-libtab="browser">Browser</button>
                <button type="button" class="${libTab === 'symbols' ? 'on' : ''}" data-action="set-libtab" data-libtab="symbols">Symbole</button>
              </div>
              <button type="button" class="btn sm" style="margin-left:auto" data-action="fg-capture">
                ${fgCd > 0 ? `Erfassen (${fgCd} s)` : 'Aktives Fenster (3s)'}
              </button>
            </div>
            <div class="tray-row">
              ${list.map((it) => `<button type="button" class="lib-cell" title="${esc(it.name)}" data-action="toast" data-msg="${esc(it.name)}">${it.icon ? svgIcon(it.icon, 'tile-sym') : `<span class="lib-badge" style="background:${esc(it.color)}">${esc(it.abbr)}</span>`}</button>`).join('')}
            </div>
          </div>
        </div>`;
    }

    return `
      <div class="insp-col">
        ${previewHead}
        ${pickerHtml}
        ${actionFormHtml}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button type="button" class="btn sm" data-action="toast" data-msg="Taste getestet">▶ Testen</button>
          <button type="button" class="btn sm danger" data-action="toast" data-msg="Taste geleert">Entfernen</button>
        </div>
      </div>`;
  }

  function renderConnectPart(variant, ctx) {
    const D = global.NOVORA_STUDIO_DATA;
    const pin = (ctx && ctx.pinCode) || '482915';
    const secs = (ctx && typeof ctx.pinSeconds === 'number') ? ctx.pinSeconds : 114;
    const qrTab = (ctx && ctx.qrToggle) || 'pair';
    const wiz = (ctx && ctx.wizardStep) || 1;
    const accepted = !!(ctx && ctx.pendingAccepted);

    const pinHtml = `<div class="pin-strip">${pin.split('').map((d) => `<span class="pin-digit">${esc(d)}</span>`).join('')}</div>`;
    const pairQr = D.makeQrSvg(`novora://pair?ip=192.168.1.10&code=${pin}`, 132);
    const apkQr = D.makeQrSvg('https://test.diviesx.de/downloads/novora.apk', 132);

    const bottomCards = `
      <div class="grid-2">
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <b style="font-size:13px">Kopplung &amp; offene Anfragen</b>
            <span class="pill">${accepted ? '0 offen' : '1 offen'}</span>
          </div>
          <div class="row-line">
            <span>Automatisch im WLAN koppeln</span>
            <button type="button" class="switch on" data-action="toggle-switch"></button>
          </div>
          <div class="row-line">
            <span>${accepted ? 'Google Pixel 8 gekoppelt' : 'Google Pixel 8 (192.168.1.104)'}</span>
            ${accepted
              ? '<span class="pill ok">Verbunden</span>'
              : '<div style="display:flex;gap:6px"><button type="button" class="btn sm ok" data-action="accept-pending">Annehmen</button><button type="button" class="btn sm danger" data-action="toast" data-msg="Anfrage abgelehnt">Ablehnen</button></div>'}
          </div>
        </div>
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <b style="font-size:13px">Netzwerk &amp; Latenz</b>
            <button type="button" class="btn sm" data-action="toast" data-msg="Rundlauf-Latenz: 5.8 ms">Latenz messen</button>
          </div>
          <div class="row-line"><span>PC-Adresse</span><span style="font-family:var(--mono)">192.168.1.10:47830</span></div>
          <div class="row-line"><span>UDP Discovery</span><span>Port 47831 · aktiv</span></div>
        </div>
      </div>`;

    if (variant === 'single') {
      return `
        <div class="conn-wrap">
          <div class="card" style="display:grid;grid-template-columns:220px 1fr;gap:16px;align-items:center">
            <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
              <div class="seg" style="width:100%">
                <button type="button" style="flex:1" class="${qrTab === 'pair' ? 'on' : ''}" data-action="set-qrtoggle" data-qrtoggle="pair">Verbinden</button>
                <button type="button" style="flex:1" class="${qrTab === 'apk' ? 'on' : ''}" data-action="set-qrtoggle" data-qrtoggle="apk">App laden</button>
              </div>
              <div class="qr-box">${qrTab === 'pair' ? pairQr : apkQr}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px">
              <b style="font-size:15px">${qrTab === 'pair' ? 'Sofort per QR oder PIN koppeln' : 'Android-App vom Server laden'}</b>
              <p style="font-size:12px;color:var(--text-2)">${qrTab === 'pair' ? 'Scanne den QR-Code in der Novora-App oder gib den 6-stelligen Code ein.' : 'Direkt-Download ohne App Store. Danach einfach zurück auf „Verbinden“ schalten.'}</p>
              ${qrTab === 'pair' ? `${pinHtml}<div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:11.5px;color:var(--dim)">Gültig noch ${secs} s</span><button type="button" class="btn sm" data-action="new-pin">Neuer Code</button></div>` : '<div class="pill" style="font-family:var(--mono)">https://test.diviesx.de/downloads/novora.apk</div>'}
            </div>
          </div>
          ${bottomCards}
        </div>`;
    }

    if (variant === 'wizard') {
      return `
        <div class="conn-wrap">
          <div class="wizard-steps">
            <button type="button" class="wizard-step ${wiz === 1 ? 'on' : ''}" data-action="set-wiz" data-step="1"><span>1. App laden</span></button>
            <button type="button" class="wizard-step ${wiz === 2 ? 'on' : ''}" data-action="set-wiz" data-step="2"><span>2. QR / PIN koppeln</span></button>
            <button type="button" class="wizard-step ${wiz === 3 ? 'on' : ''}" data-action="set-wiz" data-step="3"><span>3. Live im WLAN</span></button>
          </div>
          <div class="card" style="align-items:center;text-align:center">
            ${wiz === 1 ? `<div class="qr-box">${apkQr}</div><b>APK direkt installieren</b><span style="font-family:var(--mono);font-size:11px;color:var(--text-2)">https://test.diviesx.de/downloads/novora.apk</span>` : ''}
            ${wiz === 2 ? `<div class="qr-box">${pairQr}</div>${pinHtml}<button type="button" class="btn sm" data-action="new-pin">Neuer Code (${secs} s)</button>` : ''}
            ${wiz === 3 ? `<span class="pill ok"><span class="status-dot"></span> Samsung Galaxy A16 verbunden (5.4 ms)</span><p style="font-size:12px;color:var(--text-2)">Smartphone startet automatisch im Querformat.</p>` : ''}
          </div>
          ${bottomCards}
        </div>`;
    }

    return `
      <div class="conn-wrap">
        <div class="grid-2">
          <div class="card">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <b style="font-size:13.5px">1. Handy-App installieren</b>
              <span class="pill">Android APK</span>
            </div>
            <div class="qr-box">${apkQr}</div>
            <span style="font-size:11px;font-family:var(--mono);color:var(--text-2);text-align:center">https://test.diviesx.de/downloads/novora.apk</span>
          </div>
          <div class="card">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <b style="font-size:13.5px">2. Verbinden &amp; einloggen</b>
              <span class="pill ok">${secs} s</span>
            </div>
            <div class="qr-box">${pairQr}</div>
            ${pinHtml}
            <button type="button" class="btn sm" data-action="new-pin">Neuen Code erzeugen</button>
          </div>
        </div>
        ${bottomCards}
      </div>`;
  }

  function renderDevicesPart(variant, ctx) {
    const D = global.NOVORA_STUDIO_DATA;
    const devs = D.SAMPLE_DEVICES;
    const selId = (ctx && ctx.selectedDeviceId) || devs[0].id;
    const activeDev = devs.find((d) => d.id === selId) || devs[0];

    if (variant === 'list') {
      return `
        <div class="conn-wrap">
          <div class="card" style="padding:0;overflow:hidden">
            <table class="tbl">
              <thead><tr><th>Gerät</th><th>Modus</th><th>IP-Adresse</th><th>Latenz</th><th>Status</th><th>Aktion</th></tr></thead>
              <tbody>
                ${devs.map((d) => `
                  <tr>
                    <td><b>${esc(d.name)}</b></td>
                    <td style="color:var(--text-2)">${esc(d.orient)}</td>
                    <td style="font-family:var(--mono)">${esc(d.ip)}</td>
                    <td style="font-family:var(--mono)">${esc(d.latency)}</td>
                    <td><span class="pill ${d.online ? 'ok' : ''}"><span class="status-dot ${d.online ? '' : 'off'}"></span> ${d.online ? 'online' : 'offline'}</span></td>
                    <td><button type="button" class="btn sm danger" data-action="toast" data-msg="${esc(d.name)} widerrufen">Widerrufen</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    if (variant === 'master') {
      return `
        <div class="demo-body">
          <div class="pages-col" style="width:210px">
            <div class="col-lbl">Gekoppelte Geräte</div>
            ${devs.map((d) => `
              <button type="button" class="pg-row ${d.id === activeDev.id ? 'on' : ''}" data-action="select-device" data-dev="${d.id}">
                <span class="status-dot ${d.online ? '' : 'off'}"></span>
                <span>${esc(d.name)}</span>
              </button>`).join('')}
          </div>
          <div style="flex:1;padding:14px">
            <div class="card">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div><b style="font-size:15px">${esc(activeDev.name)}</b><div style="font-size:11.5px;color:var(--text-2)">${esc(activeDev.kind)} · ${esc(activeDev.orient)}</div></div>
                <span class="pill ${activeDev.online ? 'ok' : ''}">${activeDev.online ? 'Live' : 'Offline'}</span>
              </div>
              <div class="row-line"><span>IP-Adresse</span><span style="font-family:var(--mono)">${esc(activeDev.ip)}</span></div>
              <div class="row-line"><span>Aktive Seite</span><span>${esc(activeDev.page)}</span></div>
              <div class="row-line"><span>Geräte-Token</span><span style="font-family:var(--mono)">${esc(activeDev.tokenHash)}</span></div>
              <div style="display:flex;gap:8px;justify-content:flex-end">
                <button type="button" class="btn sm" data-action="toast" data-msg="Ping an ${esc(activeDev.name)}: ${esc(activeDev.latency)}">Ping testen</button>
                <button type="button" class="btn sm danger" data-action="toast" data-msg="Gerät widerrufen">Zugriff widerrufen</button>
              </div>
            </div>
          </div>
        </div>`;
    }

    return `
      <div class="conn-wrap">
        <div class="grid-3">
          ${devs.map((d) => `
            <div class="card">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <b style="font-size:13.5px">${esc(d.name)}</b>
                <span class="pill ${d.online ? 'ok' : ''}"><span class="status-dot ${d.online ? '' : 'off'}"></span> ${d.online ? d.latency : 'offline'}</span>
              </div>
              <span style="font-size:11.5px;color:var(--text-2)">${esc(d.orient)}</span>
              <div class="row-line"><span>IP</span><span style="font-family:var(--mono)">${esc(d.ip)}</span></div>
              <div class="row-line"><span>Seite</span><span>${esc(d.page)}</span></div>
              <div style="display:flex;gap:6px;margin-top:auto">
                <button type="button" class="btn sm" style="flex:1" data-action="toast" data-msg="Ping ${esc(d.name)}: ${esc(d.latency)}">Test</button>
                <button type="button" class="btn sm danger" data-action="toast" data-msg="${esc(d.name)} entfernt">Widerrufen</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function renderSettingsPart(variant, ctx) {
    const D = global.NOVORA_STUDIO_DATA;
    const radius = (ctx && ctx.radiusPx) || 14;
    const subTab = (ctx && ctx.settingsSubTab) || 'design';
    const tileStyle = (ctx && ctx.tileStyle) || 'keycap';
    const preview4 = D.SAMPLE_TILES.slice(0, 4);

    const designCard = `
      <div class="card">
        <b style="font-size:13.5px">Design &amp; Kachelform</b>
        <div class="row-line">
          <span>Eckenradius</span>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="range" min="4" max="22" value="${radius}" data-action="set-radius">
            <span style="font-family:var(--mono);font-size:11px">${radius} px</span>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,52px);gap:8px;--r-tile:${radius}px">
          ${preview4.map((t, i) => renderTile(t, tileStyle, i === 0, '')).join('')}
        </div>
      </div>`;

    const licenseCard = `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <b style="font-size:13.5px">Lizenzstatus</b>
          <span class="pill ok">Aktiv · Pro</span>
        </div>
        <div class="row-line"><span>Pläne</span><span>Standard · <b>Pro</b> · Team</span></div>
        <div class="row-line"><span>Schlüssel</span><span style="font-family:var(--mono)">NVR-PRO-••••-8F2A</span></div>
        <div class="row-line"><span>Offline-Token</span><span>7 Tage (Ed25519 · 6h Sync)</span></div>
      </div>`;

    const safetyCard = `
      <div class="card">
        <b style="font-size:13.5px">Sicherheit &amp; Netz</b>
        <div class="row-line"><span>Editor-Bindung</span><span>Nur 127.0.0.1</span></div>
        <div class="row-line"><span>Geräte-Auth</span><span>SHA-256 Token · widerrufbar</span></div>
      </div>`;

    if (variant === 'subnav') {
      return `
        <div class="demo-body">
          <div class="pages-col" style="width:175px">
            <div class="col-lbl">Einstellungen</div>
            <button type="button" class="pg-row ${subTab === 'design' ? 'on' : ''}" data-action="set-settingstab" data-stab="design">Erscheinungsbild</button>
            <button type="button" class="pg-row ${subTab === 'license' ? 'on' : ''}" data-action="set-settingstab" data-stab="license">Lizenz (Pro)</button>
            <button type="button" class="pg-row ${subTab === 'safety' ? 'on' : ''}" data-action="set-settingstab" data-stab="safety">Sicherheit</button>
          </div>
          <div style="flex:1;padding:14px">
            ${subTab === 'design' ? designCard : subTab === 'license' ? licenseCard : safetyCard}
          </div>
        </div>`;
    }

    if (variant === 'split') {
      return `
        <div class="conn-wrap">
          <div class="card" style="flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap">
            <span><b>Lizenz:</b> Pro (2/3 Plätze) · NVR-PRO-••••-8F2A · Ed25519 7d</span>
            <span class="pill ok">Gültig</span>
          </div>
          <div class="grid-2">${designCard}${safetyCard}</div>
        </div>`;
    }

    return `<div class="conn-wrap"><div class="grid-2">${designCard}${licenseCard}</div>${safetyCard}</div>`;
  }

  function renderPartVariant(partId, variantId, ctx) {
    switch (partId) {
      case 'nav': return renderNavPart(variantId, ctx);
      case 'pages': return renderPagesPart(variantId, ctx);
      case 'stage': return renderStagePart(variantId, ctx);
      case 'inspector': return renderInspectorPart(variantId, ctx);
      case 'connect': return renderConnectPart(variantId, ctx);
      case 'devices': return renderDevicesPart(variantId, ctx);
      case 'settings': return renderSettingsPart(variantId, ctx);
      default: return '';
    }
  }

  function renderMixShell(state) {
    const D = global.NOVORA_STUDIO_DATA;
    const picks = state.picks;
    const tab = state.mixTab || 'editor';
    const activePage = D.SAMPLE_PAGES.find((p) => p.id === state.activePage) || D.SAMPLE_PAGES[0];
    const selectedTile = D.SAMPLE_TILES[state.selectedTileIdx] || D.SAMPLE_TILES[0];
    const ctx = {
      navTab: tab,
      activePage: activePage.id,
      pageName: activePage.name,
      gridCols: state.gridCols,
      gridRows: state.gridRows,
      tileStyle: picks.tileStyle,
      selectedTileIdx: state.selectedTileIdx,
      libTab: state.libTab,
      libSearch: state.libSearch,
      inspSubTab: state.inspSubTab,
      fgCountdown: state.fgCountdown,
      tile: selectedTile,
      pinCode: state.pinCode,
      pinSeconds: state.pinSeconds,
      qrToggle: state.qrToggle,
      wizardStep: state.wizardStep,
      pendingAccepted: state.pendingAccepted,
      selectedDeviceId: state.selectedDeviceId,
      radiusPx: state.radiusPx,
      settingsSubTab: state.settingsSubTab
    };

    const items = navItemsList();
    const setTabAttr = (id) => `data-action="set-mix-tab" data-tab="${id}"`;

    let topbar = `
      <div class="demo-winbar">
        <span class="nmark" style="width:20px;height:20px;font-size:10.5px">N</span>
        <b style="font-size:12.5px">Novora</b>
        <span style="color:var(--dim);font-size:11.5px">· PC-Editor</span>
        ${picks.nav === 'toptabs' ? `
          <div class="seg" style="margin-left:10px">
            ${items.map((it) => `<button type="button" class="${tab === it.id ? 'on' : ''}" ${setTabAttr(it.id)}>${esc(it.label)}${it.badge ? ` (${it.badge})` : ''}</button>`).join('')}
          </div>` : ''}
        <span style="margin-left:auto" class="pill ok"><span class="status-dot"></span> 1 live · 5.4 ms</span>
        <button type="button" class="btn sm primary" data-action="toast" data-msg="Layout gespeichert">Speichern</button>
      </div>`;

    let leftNav = '';
    if (picks.nav === 'rail') {
      leftNav = `<div class="nav-rail">${items.map((it) => `<button type="button" class="nav-rail-btn ${tab === it.id ? 'on' : ''}" ${setTabAttr(it.id)}>${svgIcon(it.icon)}<span>${esc(it.id === 'settings' ? 'Setup' : it.label)}</span>${it.badge ? `<i class="nav-badge">${it.badge}</i>` : ''}</button>`).join('')}</div>`;
    } else if (picks.nav === 'dock') {
      leftNav = `<div class="nav-dock-wrap"><div class="nav-dock">${items.map((it) => `<button type="button" class="nav-rail-btn ${tab === it.id ? 'on' : ''}" ${setTabAttr(it.id)}>${svgIcon(it.icon)}<span>${esc(it.id === 'settings' ? 'Setup' : it.label)}</span>${it.badge ? `<i class="nav-badge">${it.badge}</i>` : ''}</button>`).join('')}</div></div>`;
    } else if (picks.nav === 'sidebar') {
      leftNav = `<div class="nav-sidebar"><div class="col-lbl">Bereiche</div>${items.map((it) => `<button type="button" class="nav-side-btn ${tab === it.id ? 'on' : ''}" ${setTabAttr(it.id)}>${svgIcon(it.icon)}<span>${esc(it.label)}</span>${it.badge ? `<span class="pg-meta">${it.badge}</span>` : ''}</button>`).join('')}</div>`;
    }

    let mainPane = '';
    if (tab === 'editor') {
      const pagesSidebar =
        picks.pages === 'tabs'
          ? ''
          : picks.pages === 'minicards'
            ? `<div class="pages-minicards"><div class="col-lbl">Seiten</div>${D.SAMPLE_PAGES.map((p, idx) => `<button type="button" class="mini-pg-card ${activePage.id === p.id ? 'on' : ''}" data-action="set-page" data-page="${p.id}"><div style="display:flex;justify-content:space-between;font-size:11.5px;font-weight:600"><span>${esc(p.name)}</span><span class="pg-meta">${esc(p.grid)}</span></div><div class="mini-pg-dots">${[0,1,2,3,4,5,6,7].map((d) => `<i class="${(d + idx) % 3 !== 2 ? 'fill' : ''}"></i>`).join('')}</div></button>`).join('')}</div>`
            : `<div class="pages-col"><div class="col-lbl">Seiten</div>${D.SAMPLE_PAGES.map((p) => `<button type="button" class="pg-row ${activePage.id === p.id ? 'on' : ''}" data-action="set-page" data-page="${p.id}"><span class="status-dot ${activePage.id === p.id ? '' : 'off'}"></span><span>${esc(p.name)}</span><span class="pg-meta">${esc(p.grid)}</span></button>`).join('')}<button type="button" class="btn sm" style="margin-top:auto" data-action="toast" data-msg="Neue Seite anlegen">+ Neue Seite</button></div>`;

      const topPageTabs =
        picks.pages === 'tabs'
          ? `<div class="pages-tabs-bar">${D.SAMPLE_PAGES.map((p) => `<button type="button" class="pg-tab ${activePage.id === p.id ? 'on' : ''}" data-action="set-page" data-page="${p.id}"><span class="status-dot ${activePage.id === p.id ? '' : 'off'}"></span><span>${esc(p.name)}</span><span class="pg-meta">${esc(p.grid)}</span></button>`).join('')}</div>`
          : '';

      const stageHtml = renderStagePart(picks.stage, ctx);
      const inspHtml =
        picks.inspector === 'popover'
          ? `<div class="popover-drawer">${renderInspectorPart('twotab', ctx).replace('<div class="insp-col">', '').replace(/<\/div>$/, '')}</div>`
          : picks.inspector === 'bottomtray'
            ? ''
            : renderInspectorPart(picks.inspector, ctx);

      const bottomTray =
        picks.inspector === 'bottomtray'
          ? `<div class="bottom-tray"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:11.5px">App- &amp; Symbol-Tray (3 Tabs)</b><span class="pill">Software · Browser · Symbole</span><button type="button" class="btn sm" style="margin-left:auto" data-action="fg-capture">${state.fgCountdown > 0 ? `Erfassen (${state.fgCountdown} s)` : 'Aktives Fenster (3s)'}</button></div><div class="tray-row">${D.APPS[state.libTab].map((it) => `<button type="button" class="lib-cell" title="${esc(it.name)}" data-action="toast" data-msg="${esc(it.name)}">${it.icon ? svgIcon(it.icon, 'tile-sym') : `<span class="lib-badge" style="background:${esc(it.color)}">${esc(it.abbr)}</span>`}</button>`).join('')}</div></div>`
          : '';

      mainPane = `
        ${pagesSidebar}
        <div style="flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;--r-tile:${state.radiusPx}px">
          ${topPageTabs}
          <div style="flex:1;min-height:0;display:flex">
            ${stageHtml}
            ${picks.inspector === 'bottomtray' ? renderInspectorPart('twotab', ctx) : inspHtml}
          </div>
          ${bottomTray}
        </div>`;
    } else if (tab === 'connect') {
      mainPane = `<div class="mix-scroll-pane">${renderConnectPart(picks.connect, ctx)}</div>`;
    } else if (tab === 'devices') {
      mainPane = `<div class="mix-scroll-pane">${renderDevicesPart(picks.devices, ctx)}</div>`;
    } else {
      mainPane = `<div class="mix-scroll-pane" style="--r-tile:${state.radiusPx}px">${renderSettingsPart(picks.settings, ctx)}</div>`;
    }

    return `
      <div class="mix-editor">
        ${topbar}
        <div class="mix-body">
          ${leftNav}
          ${mainPane}
        </div>
      </div>`;
  }

  global.NOVORA_COMPONENTS = {
    esc,
    svgIcon,
    renderTile,
    renderMiniEditorPreview,
    renderPartVariant,
    renderTileStylesShowcase,
    renderMixShell
  };
})(typeof window !== 'undefined' ? window : globalThis);
