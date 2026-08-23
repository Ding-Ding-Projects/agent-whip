// Pure, DOM-free logic pulled out of settings-main.ts specifically so the tab-strip keyboard
// navigation and the cross-tab search behaviour can be unit tested with plain node:test, with no
// Electron and no jsdom involved.

export interface SearchableRow {
  id: string;
  tabId: string;
  label: string;
  description: string;
}

export interface SearchOutcome {
  /** Row ids that should be visible on the currently active tab. */
  visibleOnActiveTab: Set<string>;
  /** Human labels of tabs (other than the active one) that contain at least one match. */
  otherTabsWithHits: string[];
}

/** Cyclic index step for arrow-key tab navigation: +1 for ArrowRight/Down, -1 for ArrowLeft/Up. */
export function stepTabIndex(current: number, length: number, delta: 1 | -1): number {
  return (current + delta + length) % length;
}

/**
 * Filters `rows` by `query` against label+description (case-insensitive substring match). An empty
 * query matches everything. `tabLabelOf` resolves a tabId to its human label for the cross-tab hint.
 */
export function computeSearchOutcome(
  rows: SearchableRow[],
  query: string,
  activeTabId: string,
  tabLabelOf: (tabId: string) => string,
): SearchOutcome {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) {
    return { visibleOnActiveTab: new Set(rows.map((r) => r.id)), otherTabsWithHits: [] };
  }
  const visibleOnActiveTab = new Set<string>();
  const otherLabels = new Set<string>();
  for (const row of rows) {
    const matches = row.label.toLowerCase().includes(trimmed) || row.description.toLowerCase().includes(trimmed);
    if (!matches) continue;
    if (row.tabId === activeTabId) {
      visibleOnActiveTab.add(row.id);
    } else {
      otherLabels.add(tabLabelOf(row.tabId));
    }
  }
  return { visibleOnActiveTab, otherTabsWithHits: Array.from(otherLabels) };
}
