// Real OS process facts, isolated behind a small interface so the registry's decision logic can
// be tested against fabricated process trees instead of real, racy, platform-specific processes.
//
// Cross-platform "is this pid alive" is well-served by `process.kill(pid, 0)`, which sends no
// signal and only probes existence/permission on every platform Node supports, including Windows.
//
// Cross-platform "what is this pid's CURRENT parent pid" has no single portable Node API. This
// module shells out per-platform. A caller that cannot determine the current parent should get
// `null` back (unknown), never a guessed value — the registry treats "unknown" as "cannot prove a
// mismatch", which is the safe direction: we refuse to fire only on a POSITIVE mismatch, not on
// mere inability to check.
import { execFileSync } from 'node:child_process';

export interface ProcessFacts {
  isAlive(pid: number): boolean;
  getParentPid(pid: number): number | null;
}

function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // EPERM means the process exists but we lack permission to signal it -- it is still alive.
    return code === 'EPERM';
  }
}

function getParentPidPosix(pid: number): number | null {
  try {
    const out = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
    const parsed = Number.parseInt(out, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function getParentPidWin32(pid: number): number | null {
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").ParentProcessId`,
      ],
      { encoding: 'utf8', timeout: 4000 },
    ).trim();
    const parsed = Number.parseInt(out, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export const realProcessFacts: ProcessFacts = {
  isAlive,
  getParentPid: process.platform === 'win32' ? getParentPidWin32 : getParentPidPosix,
};
