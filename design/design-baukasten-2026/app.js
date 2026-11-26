(function () {
  'use strict';

  const STORAGE_KEY = 'novora_design_baukasten_v1';
  const D = window.NOVORA_STUDIO_DATA;
  const C = window.NOVORA_COMPONENTS;

  const DEFAULT_STATE = {
    mode: 'themes',
    activePart: 'nav',
    theme: 'hardware',
    picks: {
      nav: 'rail',
      pages: 'column',
      stage: 'frame',
      tileStyle: 'keycap',
      inspector: 'twotab',
      connect: 'dual',
      devices: 'cards',
      settings: 'bento'
    },
    mixTab: 'editor',
    navTab: 'editor',
    activePage: 'home',
    selectedTileIdx: 0,
    libTab: 'software',
    libSearch: '',
    inspSubTab: 'look',
    qrToggle: 'pair',
    wizardStep: 1,
    settingsSubTab: 'design',
    selectedDeviceId: 'a16',
    pinCode: '482915',
    pinSeconds: 114,
    fgCountdown: 0,
    pendingAccepted: false,
    radiusPx: 14,
    gridCols: 5,
    gridRows: 3
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefault();
      const parsed = JSON.parse(raw);
      return {
        ...cloneDefault(),
        ...parsed,
        picks: { ...DEFAULT_STATE.picks, ...(parsed.picks || {}) }
      };
    } catch (_) {
      return cloneDefault();
    }
  }

  function cloneDefault() {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  let state = loadState();
  let toastTimer = null;
  let fgTimer = null;

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode: state.mode,
        activePart: state.activePart,
        theme: state.theme,
        picks: state.picks,
        mixTab: state.mixTab,
        radiusPx: state.radiusPx,
        gridCols: state.gridCols,
        gridRows: state.gridRows
      }));
    } catch (_) {
      // Ignore file:// storage restrictions if disabled
    }
  }

  function notify(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
  }

  function buildContext() {
    const activePage = D.SAMPLE_PAGES.find((p) => p.id === state.activePage) || D.SAMPLE_PAGES[0];
    const tile = D.SAMPLE_TILES[state.selectedTileIdx] || D.SAMPLE_TILES[0];
    return {
      navTab: state.navTab,
      activePage: activePage.id,
      pageName: activePage.name,
      gridCols: state.gridCols,
      gridRows: state.gridRows,
      tileStyle: state.picks.tileStyle,
      selectedTileIdx: state.selectedTileIdx,
      libTab: state.libTab,
      libSearch: state.libSearch,
      inspSubTab: state.inspSubTab,
      fgCountdown: state.fgCountdown,
      tile,
      pinCode: state.pinCode,
      pinSeconds: state.pinSeconds,
      qrToggle: state.qrToggle,
      wizardStep: state.wizardStep,
      pendingAccepted: state.pendingAccepted,
      selectedDeviceId: state.selectedDeviceId,
      radiusPx: state.radiusPx,
      settingsSubTab: state.settingsSubTab
    };
  }

  function renderTopbar() {
    return `
      <header class="studio-bar">
        <div class="studio-brand">
          <span class="nmark">N</span>
          <span>Novora · Design-Baukasten</span>
        </div>
        <div class="seg" role="tablist">
          <button type="button" class="${state.mode === 'themes' ? 'on' : ''}" data-action="set-mode" data-mode="themes">1. Design-Ausführungen (6)</button>
          <button type="button" class="${state.mode === 'parts' ? 'on' : ''}" data-action="set-mode" data-mode="parts">2. Einzelteile &amp; Reiter (7)</button>
          <button type="button" class="${state.mode === 'mix' ? 'on' : ''}" data-action="set-mode" data-mode="mix">3. Dein Mix (Live)</button>
        </div>
        <div class="theme-pills">
          ${D.THEMES.map((t) => `
            <button type="button" class="theme-chip ${state.theme === t.id ? 'on' : ''}" data-action="set-theme" data-theme="${t.id}" title="${C.esc(t.name)}">
              <span class="swatch" style="background:${C.esc(t.palette[3])}"></span>
              <span>${C.esc(t.name.split(' ')[0])}</span>
            </button>`).join('')}
        </div>
        <button type="button" class="btn sm primary" data-action="open-export">Auswahl kopieren</button>
      </header>`;
  }

  function renderThemesMode() {
    return `
      <div class="scroll-view">
        <div class="view-head">
          <div>
            <h1>6 eigenständige Design-Ausführungen für Novora</h1>
            <p>Alle 6 Themen-Systeme werden direkt nebeneinander mit echtem Editor-Aufbau dargestellt. Klicke eine Ausführung an oder prüfe sie im Live-Mix.</p>
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn" data-action="set-mode" data-mode="parts">Einzelteile vergleichen →</button>
            <button type="button" class="btn primary" data-action="set-mode" data-mode="mix">Im Live-Mix öffnen</button>
          </div>
        </div>
        <div class="themes-grid">
          ${D.THEMES.map((t) => {
            const isActive = state.theme === t.id;
            return `
              <article class="theme-card ${isActive ? 'active' : ''}">
                <div class="theme-card-top">
                  <div>
                    <h2>${C.esc(t.name)} <span class="pill">${C.esc(t.badge)}</span></h2>
                    <div class="theme-sub">${C.esc(t.subtitle)}</div>
                  </div>
                  <div class="palette-row" title="Farbpalette">
                    ${t.palette.map((c) => `<span class="palette-dot" style="background:${C.esc(c)}"></span>`).join('')}
                  </div>
                </div>
                ${C.renderMiniEditorPreview(t.id)}
                <p style="font-size:12px;color:var(--text-2)">${C.esc(t.description)}</p>
                <div style="display:flex;gap:8px;margin-top:auto">
                  <button type="button" class="btn sm ${isActive ? 'ok' : 'primary'}" style="flex:1" data-action="set-theme" data-theme="${t.id}">
                    ${isActive ? '✓ Aktives Theme' : 'Als Haupt-Theme setzen'}
                  </button>
                  <button type="button" class="btn sm" data-action="preview-theme-mix" data-theme="${t.id}">Im Mix prüfen</button>
                </div>
              </article>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderPartsMode() {
    const part = D.PARTS.find((p) => p.id === state.activePart) || D.PARTS[0];
    const ctx = buildContext();
    const isWide = part.id === 'connect' || part.id === 'devices' || part.id === 'settings' || part.id === 'inspector';
    const pickedId = state.picks[part.id];

    return `
      <div class="parts-layout">
        <aside class="parts-sidebar">
          <div class="parts-cat-title">Editor-Einzelteile &amp; Reiter</div>
          ${D.PARTS.map((p) => {
            const curPick = p.variants.find((v) => v.id === state.picks[p.id]);
            return `
              <button type="button" class="part-btn ${p.id === part.id ? 'on' : ''}" data-action="set-part" data-part="${p.id}">
                <div class="part-btn-top">
                  <span>${C.esc(p.step)}. ${C.esc(p.short)}</span>
                  <span class="part-pick-tag">${C.esc(curPick ? curPick.title.split(' ')[0] : state.picks[p.id])}</span>
                </div>
                <span style="font-size:11px;color:var(--dim)">${p.variants.length} Varianten</span>
              </button>`;
          }).join('')}
          <div style="margin-top:auto;padding-top:10px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:6px">
            <button type="button" class="btn primary sm" data-action="set-mode" data-mode="mix">Gewählten Mix testen →</button>
            <button type="button" class="btn sm" data-action="reset-picks">Standard wiederherstellen</button>
          </div>
        </aside>

        <section class="parts-content">
          <div class="view-head" style="margin-bottom:2px">
            <div>
              <h1>${C.esc(part.step)}. ${C.esc(part.name)}</h1>
              <p>${C.esc(part.desc)}</p>
            </div>
            <span class="pill">Aktives Theme: ${C.esc(D.THEMES.find((x) => x.id === state.theme).name)}</span>
          </div>

          ${part.id === 'stage' ? C.renderTileStylesShowcase(state.picks.tileStyle) : ''}

          <div class="variants-grid ${isWide ? 'wide-stack' : ''}">
            ${part.variants.map((v, idx) => {
              const letter = String.fromCharCode(65 + idx);
              const isPicked = pickedId === v.id;
              return `
                <article class="variant-card ${isPicked ? 'picked' : ''}">
                  <div class="variant-head">
                    <div>
                      <h3>Variante ${letter}: ${C.esc(v.title)} <span class="pill">${C.esc(v.tag)}</span></h3>
                      <p class="variant-summary">${C.esc(v.summary)}</p>
                    </div>
                    <button type="button" class="btn sm ${isPicked ? 'ok' : 'primary'}" data-action="pick-variant" data-part="${part.id}" data-variant="${v.id}">
                      ${isPicked ? '✓ Ausgewählt' : 'Auswählen'}
                    </button>
                  </div>
                  <div class="mockup-frame">
                    ${C.renderPartVariant(part.id, v.id, ctx)}
                  </div>
                  <div class="pros-cons">
                    ${v.pros.map((pr) => `<span class="pc-chip pro"><b>+</b> ${C.esc(pr)}</span>`).join('')}
                    ${v.cons.map((cn) => `<span class="pc-chip con"><b>−</b> ${C.esc(cn)}</span>`).join('')}
                  </div>
                </article>`;
            }).join('')}
          </div>
        </section>
      </div>`;
  }

  function renderMixMode() {
    const selectControl = (partId, label, options, current) => `
      <label class="mix-pick">
        <span>${C.esc(label)}:</span>
        <select data-action="mix-select" data-part="${partId}">
          ${options.map((o) => `<option value="${C.esc(o.id)}"${o.id === current ? ' selected' : ''}>${C.esc(o.title || o.name)}</option>`).join('')}
        </select>
      </label>`;

    return `
      <div class="mix-shell">
        <div class="mix-quickbar">
          <b style="font-size:11.5px;white-space:nowrap">Live-Mix:</b>
          ${D.PARTS.map((p) => selectControl(p.id, p.short, p.variants, state.picks[p.id])).join('')}
          ${selectControl('tileStyle', 'Kacheln', D.TILE_STYLES, state.picks.tileStyle)}
        </div>
        ${C.renderMixShell(state)}
      </div>`;
  }

  function buildSummaryText() {
    const themeObj = D.THEMES.find((t) => t.id === state.theme) || D.THEMES[0];
    const tsObj = D.TILE_STYLES.find((t) => t.id === state.picks.tileStyle) || D.TILE_STYLES[0];
    const lines = [
      `# Novora Design-Auswahl`,
      `- **Theme**: ${themeObj.name} (\`${themeObj.id}\`)`,
      `- **Kachel-Stil**: ${tsObj.name} (\`${tsObj.id}\`, Radius ${state.radiusPx} px)`
    ];
    for (const p of D.PARTS) {
      const v = p.variants.find((x) => x.id === state.picks[p.id]);
      lines.push(`- **${p.name}**: ${v ? v.title : state.picks[p.id]} (\`${state.picks[p.id]}\`)`);
    }
    return lines.join('\n');
  }

  function renderApp() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const root = document.getElementById('studioRoot');
    if (!root) return;

    let body = '';
    if (state.mode === 'themes') body = renderThemesMode();
    else if (state.mode === 'parts') body = renderPartsMode();
    else body = renderMixMode();

    root.innerHTML = `${renderTopbar()}<main class="studio-main">${body}</main>`;

    const exportPre = document.getElementById('exportText');
    if (exportPre) exportPre.textContent = buildSummaryText();
  }

  function startForegroundCountdown() {
    clearInterval(fgTimer);
    state.fgCountdown = 3;
    renderApp();
    fgTimer = setInterval(() => {
      state.fgCountdown -= 1;
      if (state.fgCountdown <= 0) {
        clearInterval(fgTimer);
        state.fgCountdown = 0;
        notify('Aktives Fenster übernommen: OBS Studio (obs64.exe + Icon)');
      }
      renderApp();
    }, 1000);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const act = btn.getAttribute('data-action');

    switch (act) {
      case 'set-mode':
        state.mode = btn.getAttribute('data-mode') || 'themes';
        saveState();
        renderApp();
        break;
      case 'set-theme':
        state.theme = btn.getAttribute('data-theme') || 'hardware';
        saveState();
        renderApp();
        notify(`Theme aktiviert: ${D.THEMES.find((t) => t.id === state.theme).name}`);
        break;
      case 'preview-theme-mix':
        state.theme = btn.getAttribute('data-theme') || 'hardware';
        state.mode = 'mix';
        saveState();
        renderApp();
        break;
      case 'set-part':
        state.activePart = btn.getAttribute('data-part') || 'nav';
        saveState();
        renderApp();
        break;
      case 'pick-variant': {
        const partId = btn.getAttribute('data-part');
        const varId = btn.getAttribute('data-variant');
        if (partId && varId) {
          state.picks[partId] = varId;
          saveState();
          renderApp();
          notify(`Übernommen: ${varId}`);
        }
        break;
      }
      case 'pick-tilestyle':
        state.picks.tileStyle = btn.getAttribute('data-style') || 'keycap';
        saveState();
        renderApp();
        notify(`Kachel-Stil: ${state.picks.tileStyle}`);
        break;
      case 'set-demo-tab':
        state.navTab = btn.getAttribute('data-tab') || 'editor';
        renderApp();
        break;
      case 'set-mix-tab':
        state.mixTab = btn.getAttribute('data-tab') || 'editor';
        saveState();
        renderApp();
        break;
      case 'set-page':
        state.activePage = btn.getAttribute('data-page') || 'home';
        renderApp();
        break;
      case 'select-tile':
        state.selectedTileIdx = Number(btn.getAttribute('data-idx') || 0);
        renderApp();
        break;
      case 'step-grid': {
        const axis = btn.getAttribute('data-axis');
        const delta = Number(btn.getAttribute('data-delta') || 0);
        if (axis === 'cols') state.gridCols = Math.max(3, Math.min(6, state.gridCols + delta));
        if (axis === 'rows') state.gridRows = Math.max(2, Math.min(4, state.gridRows + delta));
        saveState();
        renderApp();
        break;
      }
      case 'set-libtab':
        state.libTab = btn.getAttribute('data-libtab') || 'software';
        renderApp();
        break;
      case 'set-insptab':
        state.inspSubTab = btn.getAttribute('data-insptab') || 'look';
        renderApp();
        break;
      case 'fg-capture':
        startForegroundCountdown();
        break;
      case 'set-qrtoggle':
        state.qrToggle = btn.getAttribute('data-qrtoggle') || 'pair';
        renderApp();
        break;
      case 'set-wiz':
        state.wizardStep = Number(btn.getAttribute('data-step') || 1);
        renderApp();
        break;
      case 'new-pin':
        state.pinCode = String(Math.floor(100000 + Math.random() * 900000));
        state.pinSeconds = 120;
        renderApp();
        notify(`Neuer Pairing-Code: ${state.pinCode}`);
        break;
      case 'accept-pending':
        state.pendingAccepted = true;
        renderApp();
        notify('Google Pixel 8 gekoppelt');
        break;
      case 'toggle-switch':
        btn.classList.toggle('on');
        break;
      case 'select-device':
        state.selectedDeviceId = btn.getAttribute('data-dev') || 'a16';
        renderApp();
        break;
      case 'set-settingstab':
        state.settingsSubTab = btn.getAttribute('data-stab') || 'design';
        renderApp();
        break;
      case 'reset-picks':
        state = cloneDefault();
        state.mode = 'parts';
        saveState();
        renderApp();
        notify('Standard-Baukasten wiederhergestellt');
        break;
      case 'open-export': {
        const modal = document.getElementById('exportModal');
        const pre = document.getElementById('exportText');
        if (pre) pre.textContent = buildSummaryText();
        if (modal) modal.classList.add('on');
        break;
      }
      case 'close-export': {
        const modal = document.getElementById('exportModal');
        if (modal) modal.classList.remove('on');
        break;
      }
      case 'copy-export': {
        const txt = buildSummaryText();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(
            () => notify('Design-Auswahl in Zwischenablage kopiert'),
            () => notify('Text zum Kopieren markiert')
          );
        } else {
          notify('Bitte Text im Fenster kopieren');
        }
        break;
      }
      case 'toast':
        notify(btn.getAttribute('data-msg') || 'OK');
        break;
      default:
        break;
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || !el.matches('[data-action="mix-select"]')) return;
    const partId = el.getAttribute('data-part');
    if (partId) {
      state.picks[partId] = el.value;
      saveState();
      renderApp();
      notify(`Mix aktualisiert: ${partId} → ${el.value}`);
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el) return;
    const act = el.getAttribute('data-action');
    if (act === 'lib-search') {
      state.libSearch = el.value;
      const caret = el.selectionStart;
      renderApp();
      const nextInput = document.querySelector('[data-action="lib-search"]');
      if (nextInput) {
        nextInput.focus();
        try { nextInput.setSelectionRange(caret, caret); } catch (_) {}
      }
    } else if (act === 'set-radius') {
      state.radiusPx = Number(el.value || 14);
      saveState();
      renderApp();
    }
  });

  setInterval(() => {
    if (state.pinSeconds > 1) {
      state.pinSeconds -= 1;
    } else {
      state.pinSeconds = 120;
      state.pinCode = String(Math.floor(100000 + Math.random() * 900000));
    }
    if (state.mode === 'mix' && state.mixTab === 'connect') {
      renderApp();
    } else if (state.mode === 'parts' && state.activePart === 'connect') {
      renderApp();
    }
  }, 1000);

  renderApp();
})();
