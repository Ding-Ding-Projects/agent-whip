import type { CrackResultViewModel, SessionViewModel } from '../shared/ipc-contracts.ts';

const root = document.getElementById('popover-root');
if (!root) throw new Error('popover-root missing');

let toastRegion: HTMLDivElement;

function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'm3-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  toastRegion.appendChild(toast);
  window.setTimeout(() => toast.remove(), 4000);
}

function unavailableLabel(reason: string | null): string {
  return reason ? `unavailable — ${reason}` : 'unavailable';
}

function renderSessions(sessions: SessionViewModel[], statusLine: HTMLDivElement): void {
  const list = document.createElement('ul');
  list.className = 'session-list';
  list.setAttribute('role', 'list');

  if (sessions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No registered sessions. Sessions appear here once an agent opts in.';
    list.replaceWith(empty);
    root!.replaceChildren(empty, toastRegion);
    return;
  }

  for (const session of sessions) {
    const li = document.createElement('li');
    li.className = 'session-row';

    const meta = document.createElement('div');
    meta.className = 'session-meta';
    const id = document.createElement('span');
    id.className = 'session-id';
    id.textContent = `${session.runtime} · ${session.id.slice(0, 8)}`;
    const cwd = document.createElement('span');
    cwd.className = 'session-cwd';
    cwd.title = session.cwd;
    cwd.textContent = session.cwd;
    meta.append(id, cwd);

    if (!session.resolvable) {
      const reason = document.createElement('span');
      reason.className = 'session-unavailable';
      reason.textContent = unavailableLabel(session.unavailableReason);
      meta.append(reason);
    }

    const crackButton = document.createElement('button');
    crackButton.type = 'button';
    crackButton.className = 'm3-button' + (session.resolvable ? '' : ' m3-button--tonal');
    crackButton.textContent = '🐎 crack';
    crackButton.disabled = !session.resolvable;
    crackButton.setAttribute(
      'aria-label',
      session.resolvable ? `Crack the whip at ${session.id}` : `Cannot crack ${session.id}: ${unavailableLabel(session.unavailableReason)}`,
    );
    crackButton.addEventListener('click', () => {
      void handleCrack(session.id, statusLine);
    });

    li.append(meta, crackButton);
    list.appendChild(li);
  }

  root!.replaceChildren(list, statusLine, toastRegion);
}

async function handleCrack(sessionId: string, statusLine: HTMLDivElement): Promise<void> {
  const result: CrackResultViewModel = await window.agentWhip.crack(sessionId);
  if (result.ok) {
    statusLine.textContent = `tier ${result.tier} fired · route ${result.route ?? 'unknown'}`;
    showToast(`Cracked (tier ${result.tier}) via ${result.route ?? 'unknown'} route.`);
  } else {
    statusLine.textContent = `tier ${result.tier} refused · ${result.reason ?? 'unknown reason'}`;
    showToast(`Not delivered: ${result.reason ?? 'unknown reason'}.`);
  }
  await refresh(statusLine);
}

async function refresh(statusLine: HTMLDivElement): Promise<void> {
  const sessions = await window.agentWhip.listSessions();
  renderSessions(sessions, statusLine);
}

function mount(): void {
  toastRegion = document.createElement('div');
  toastRegion.className = 'm3-toast-region';
  toastRegion.setAttribute('aria-live', 'polite');

  const statusLine = document.createElement('div');
  statusLine.className = 'status-line';
  statusLine.setAttribute('role', 'status');
  statusLine.textContent = 'Ready.';

  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.className = 'm3-button m3-button--tonal';
  settingsButton.textContent = 'Settings…';
  settingsButton.addEventListener('click', () => {
    void window.agentWhip.openSettingsWindow();
  });

  root!.replaceChildren(settingsButton, statusLine, toastRegion);
  void refresh(statusLine);
  window.agentWhip.onSessionsChanged(() => {
    void refresh(statusLine);
  });
}

mount();
