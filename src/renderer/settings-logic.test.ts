import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSearchOutcome, stepTabIndex, type SearchableRow } from './settings-logic.js';

test('stepTabIndex wraps forward and backward cyclically', () => {
  assert.equal(stepTabIndex(0, 4, 1), 1);
  assert.equal(stepTabIndex(3, 4, 1), 0);
  assert.equal(stepTabIndex(0, 4, -1), 3);
  assert.equal(stepTabIndex(2, 4, -1), 1);
});

const ROWS: SearchableRow[] = [
  { id: 'a', tabId: 'general', label: 'Double-crack window', description: 'window timing' },
  { id: 'b', tabId: 'profile', label: 'Active profile', description: 'profile status' },
  { id: 'c', tabId: 'about', label: 'About agent-whip', description: 'what this app does' },
];
const tabLabelOf = (id: string) => ({ general: 'General', profile: 'Profile', about: 'About' })[id] ?? id;

test('computeSearchOutcome: empty query matches everything, no cross-tab hint', () => {
  const outcome = computeSearchOutcome(ROWS, '', 'general', tabLabelOf);
  assert.deepEqual([...outcome.visibleOnActiveTab].sort(), ['a', 'b', 'c'].sort());
  assert.deepEqual(outcome.otherTabsWithHits, []);
});

test('computeSearchOutcome: match on active tab shows up, no cross-tab hint needed', () => {
  const outcome = computeSearchOutcome(ROWS, 'double-crack', 'general', tabLabelOf);
  assert.deepEqual([...outcome.visibleOnActiveTab], ['a']);
  assert.deepEqual(outcome.otherTabsWithHits, []);
});

test('computeSearchOutcome: match on a different tab is reported, not shown on active tab', () => {
  const outcome = computeSearchOutcome(ROWS, 'profile', 'general', tabLabelOf);
  assert.deepEqual([...outcome.visibleOnActiveTab], []);
  assert.deepEqual(outcome.otherTabsWithHits, ['Profile']);
});

test('computeSearchOutcome: description matches count too, case-insensitively', () => {
  const outcome = computeSearchOutcome(ROWS, 'WHAT THIS APP', 'about', tabLabelOf);
  assert.deepEqual([...outcome.visibleOnActiveTab], ['c']);
});
