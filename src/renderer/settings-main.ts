import type { AppSettings, ProfileStatusViewModel, TierIdentityViewModel } from '../shared/ipc-contracts.ts';
import { computeSearchOutcome, stepTabIndex, type SearchableRow } from './settings-logic.ts';

const root = document.getElementById('settings-root');
if (!root) throw new Error('settings-root missing');

interface SettingRow {
  id: string;
  tabId: string;
  label: string;
  description: string;
  element: HTMLElement;
}

interface TabDef {
  id: string;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'general', label: 'General' },
  { id: 'profile', label: 'Profile' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'about', label: 'About' },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      break;
    case gn:
      h = ((bn - rn) / d + 2) * 60;
      break;
    default:
      h = ((rn - gn) / d + 4) * 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function buildRow(tabId: string, id: string, label: string, description: string, control: HTMLElement): SettingRow {
  const wrap = document.createElement('div');
  wrap.className = 'setting-row';
  wrap.dataset.hit = 'true';
  const labelEl = document.createElement('div');
  labelEl.className = 'setting-label';
  labelEl.textContent = label;
  const descEl = document.createElement('div');
  descEl.className = 'setting-description';
  descEl.textContent = description;
  wrap.append(labelEl, descEl, control);
  return { id, tabId, label, description, element: wrap };
}

async function main(): Promise<void> {
  const settings = await window.agentWhip.getSettings();

  const tabStrip = document.createElement('div');
  tabStrip.className = 'tab-strip';
  tabStrip.setAttribute('role', 'tablist');
  tabStrip.setAttribute('aria-orientation', 'horizontal');

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'tab-search';
  search.placeholder = "Search this tab's settings...";
  search.setAttribute('aria-label', 'Search settings on the current tab');

  const crossTabHint = document.createElement('div');
  crossTabHint.className = 'cross-tab-hint';
  crossTabHint.setAttribute('role', 'status');

  const panels = new Map<string, HTMLElement>();
  const rows: SettingRow[] = [];
  let activeTab = TABS[0].id;

  for (const tab of TABS) {
    const tabButton = document.createElement('button');
    tabButton.type = 'button';
    tabButton.id = `tab-${tab.id}`;
    tabButton.setAttribute('role', 'tab');
    tabButton.setAttribute('aria-controls', `panel-${tab.id}`);
    tabButton.setAttribute('aria-selected', tab.id === activeTab ? 'true' : 'false');
    tabButton.tabIndex = tab.id === activeTab ? 0 : -1;
    tabButton.textContent = tab.label;
    tabButton.addEventListener('click', () => selectTab(tab.id));
    tabStrip.appendChild(tabButton);

    const panel = document.createElement('div');
    panel.id = `panel-${tab.id}`;
    panel.className = 'tab-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${tab.id}`);
    panel.hidden = tab.id !== activeTab;
    panels.set(tab.id, panel);
  }

  // Keyboard arrow-key navigation matching the strip's horizontal axis, per the tabbed-navigation
  // contract (aria-orientation="horizontal" -> left/right, not up/down).
  tabStrip.addEventListener('keydown', (event) => {
    const idx = TABS.findIndex((t) => t.id === activeTab);
    if (event.key === 'ArrowRight') {
      selectTab(TABS[stepTabIndex(idx, TABS.length, 1)].id, true);
    } else if (event.key === 'ArrowLeft') {
      selectTab(TABS[stepTabIndex(idx, TABS.length, -1)].id, true);
    }
  });

  function selectTab(id: string, focus = false): void {
    activeTab = id;
    for (const tab of TABS) {
      const btn = document.getElementById(`tab-${tab.id}`) as HTMLButtonElement;
      const selected = tab.id === id;
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
      btn.tabIndex = selected ? 0 : -1;
      panels.get(tab.id)!.hidden = !selected;
      if (selected && focus) btn.focus();
    }
    applySearch();
  }

  function applySearch(): void {
    const searchable: SearchableRow[] = rows.map((r) => ({ id: r.id, tabId: r.tabId, label: r.label, description: r.description }));
    const outcome = computeSearchOutcome(searchable, search.value, activeTab, (tabId) => TABS.find((t) => t.id === tabId)?.label ?? tabId);
    for (const row of rows) {
      const isEmptyQuery = search.value.trim().length === 0;
      row.element.dataset.hit = isEmptyQuery || outcome.visibleOnActiveTab.has(row.id) ? 'true' : 'false';
    }
    crossTabHint.textContent =
      outcome.otherTabsWithHits.length > 0 ? `Also matches on: ${outcome.otherTabsWithHits.join(', ')}.` : '';
  }
  search.addEventListener('input', applySearch);

  // ---- General tab ------------------------------------------------------------------------
  const doubleCrackInput = document.createElement('input');
  doubleCrackInput.type = 'number';
  doubleCrackInput.min = '200';
  doubleCrackInput.step = '100';
  doubleCrackInput.value = String(settings.doubleCrackWindowMs);
  doubleCrackInput.setAttribute('aria-label', 'Double-crack window in milliseconds');
  doubleCrackInput.addEventListener('change', () => {
    void save({ doubleCrackWindowMs: Number(doubleCrackInput.value) || settings.doubleCrackWindowMs });
  });

  const cooldownInput = document.createElement('input');
  cooldownInput.type = 'number';
  cooldownInput.min = '0';
  cooldownInput.step = '100';
  cooldownInput.value = String(settings.perSessionCooldownMs);
  cooldownInput.setAttribute('aria-label', 'Per-session cooldown in milliseconds');
  cooldownInput.addEventListener('change', () => {
    void save({ perSessionCooldownMs: Number(cooldownInput.value) || settings.perSessionCooldownMs });
  });

  rows.push(
    buildRow(
      'general',
      'double-crack-window',
      'Double-crack window',
      'How long, in milliseconds, a second crack has to land after the first to count as tier 2.',
      doubleCrackInput,
    ),
    buildRow(
      'general',
      'per-session-cooldown',
      'Per-session cooldown',
      'Minimum time, in milliseconds, between accepted cracks aimed at the same session.',
      cooldownInput,
    ),
  );

  // ---- Profile tab --------------------------------------------------------------------------
  const statusLine = document.createElement('p');
  statusLine.className = 'setting-description';
  statusLine.setAttribute('role', 'status');

  const tierLines = document.createElement('div');
  tierLines.className = 'setting-description';

  async function refreshProfileStatus(): Promise<void> {
    const status: ProfileStatusViewModel = await window.agentWhip.getProfileStatus();
    statusLine.textContent = status.label;
    const tier1: TierIdentityViewModel = await window.agentWhip.getTierIdentity(1);
    const tier2: TierIdentityViewModel = await window.agentWhip.getTierIdentity(2);
    tierLines.replaceChildren();
    for (const t of [tier1, tier2]) {
      const line = document.createElement('div');
      line.textContent = t.label;
      tierLines.appendChild(line);
    }
  }

  const pickButton = document.createElement('button');
  pickButton.type = 'button';
  pickButton.className = 'm3-button';
  pickButton.textContent = 'Choose profile file...';
  pickButton.addEventListener('click', async () => {
    const result = await window.agentWhip.pickProfileFile();
    if (result.path) await refreshProfileStatus();
  });

  const reloadButton = document.createElement('button');
  reloadButton.type = 'button';
  reloadButton.className = 'm3-button m3-button--tonal';
  reloadButton.textContent = 'Reload';
  reloadButton.addEventListener('click', async () => {
    await window.agentWhip.reloadProfile();
    await refreshProfileStatus();
  });

  const pathNote = document.createElement('p');
  pathNote.className = 'setting-description';
  pathNote.textContent =
    "Your profile.json lives on your own machine and is never committed to any repository. There is no paste-text field here on purpose: pasting the phrase would put it on your clipboard and possibly into a screen capture.";

  const controlsWrap = document.createElement('div');
  controlsWrap.style.display = 'flex';
  controlsWrap.style.gap = '8px';
  controlsWrap.append(pickButton, reloadButton);

  const profileWrap = document.createElement('div');
  profileWrap.append(statusLine, tierLines, controlsWrap, pathNote);

  rows.push(
    buildRow(
      'profile',
      'profile-status',
      'Active profile',
      'Which trigger-phrase profile is loaded, and its per-tier identity. Never shows the phrase itself.',
      profileWrap,
    ),
  );
  void refreshProfileStatus();

  // ---- Appearance tab -----------------------------------------------------------------------
  const themeSelect = document.createElement('select');
  themeSelect.setAttribute('aria-label', 'Theme');
  for (const value of ['light', 'dark', 'system'] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    if (value === settings.theme) opt.selected = true;
    themeSelect.appendChild(opt);
  }
  themeSelect.addEventListener('change', () => {
    document.documentElement.dataset.theme = themeSelect.value === 'system' ? '' : themeSelect.value;
    void save({ theme: themeSelect.value as AppSettings['theme'] });
  });

  const densitySelect = document.createElement('select');
  densitySelect.setAttribute('aria-label', 'Density');
  for (const value of ['comfortable', 'compact'] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    if (value === settings.density) opt.selected = true;
    densitySelect.appendChild(opt);
  }
  densitySelect.addEventListener('change', () => {
    document.documentElement.dataset.density = densitySelect.value;
    void save({ density: densitySelect.value as AppSettings['density'] });
  });

  const colorField = document.createElement('div');
  colorField.className = 'color-field';
  const colorPicker = document.createElement('input');
  colorPicker.type = 'color';
  colorPicker.value = settings.accentColor;
  colorPicker.setAttribute('aria-label', 'Accent colour picker');
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.value = settings.accentColor;
  hexInput.setAttribute('aria-label', 'Accent colour hex value');
  const rgbLabel = document.createElement('span');
  rgbLabel.className = 'setting-description';
  const hslLabel = document.createElement('span');
  hslLabel.className = 'setting-description';

  function syncFromHex(hex: string): void {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    colorPicker.value = hex;
    hexInput.value = hex;
    rgbLabel.textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hslLabel.textContent = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    void save({ accentColor: hex });
  }
  colorPicker.addEventListener('input', () => syncFromHex(colorPicker.value));
  hexInput.addEventListener('change', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hexInput.value)) syncFromHex(hexInput.value);
    else hexInput.value = colorPicker.value;
  });
  colorField.append(colorPicker, hexInput, rgbLabel, hslLabel);
  syncFromHex(settings.accentColor);

  rows.push(
    buildRow('appearance', 'theme', 'Theme', 'Light, dark, or follow the system setting.', themeSelect),
    buildRow(
      'appearance',
      'density',
      'Density',
      'Comfortable or compact spacing throughout agent-whip.',
      densitySelect,
    ),
    buildRow(
      'appearance',
      'accent-color',
      'Accent colour',
      'Pick any colour on the wheel, or type a hex value directly; RGB and HSL are shown alongside.',
      colorField,
    ),
  );

  // ---- About tab ------------------------------------------------------------------------------
  const aboutText = document.createElement('div');
  aboutText.className = 'setting-description';
  const p1 = document.createElement('p');
  p1.textContent =
    "agent-whip does not interrupt a running agent session. It injects a short trigger phrase that the session itself reads on its own next turn, asking it to keep going at full speed (tier 1) or, on a deliberate double crack, to also clean up merged branches (tier 2). It never sends a keystroke that stops or redirects work already in flight.";
  const p2 = document.createElement('p');
  p2.textContent = 'Inspired by ';
  const link = document.createElement('a');
  link.href = 'https://github.com/GitFrog1111/OpenWhip';
  link.textContent = 'GitFrog1111/OpenWhip';
  link.target = '_blank';
  link.rel = 'noreferrer';
  p2.appendChild(link);
  p2.appendChild(document.createTextNode('.'));
  const version = document.createElement('p');
  version.textContent = 'agent-whip 0.1.0';
  aboutText.append(version, p1, p2);
  rows.push(
    buildRow('about', 'about-text', 'About agent-whip', 'What this app does and does not do.', aboutText),
  );

  async function save(patch: Partial<AppSettings>): Promise<void> {
    await window.agentWhip.setSettings(patch);
  }

  for (const row of rows) {
    panels.get(row.tabId)!.appendChild(row.element);
  }

  root!.replaceChildren(tabStrip, search, crossTabHint, ...Array.from(panels.values()));
  document.documentElement.dataset.theme = settings.theme === 'system' ? '' : settings.theme;
  document.documentElement.dataset.density = settings.density;
}

void main();
