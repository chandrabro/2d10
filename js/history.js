// Version history: automatic snapshots of the project (kept in this browser only) so a bad edit,
// an accidental "New" or an overwritten project can be brought back.

const KEY = 'story-animator-history-v1';
const MAX = 10;
let lastAuto = 0;

function read() { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function write(list) {
  const l = list.slice(0, MAX);
  while (l.length) { try { localStorage.setItem(KEY, JSON.stringify(l)); return true; } catch (e) { l.pop(); } }   // storage full -> drop the oldest
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  return false;
}
const duration = (p) => (p.scenes || []).reduce((a, s) => a + (s.duration || 0), 0);

export function listHistory() { return read(); }

/** Store a snapshot. `force` skips the time throttle. Identical consecutive snapshots are ignored. */
export function snapshot(project, label = 'auto', force = false) {
  if (!project || !project.scenes || !project.scenes.length) return false;
  const now = Date.now();
  if (!force && now - lastAuto < 120000) return false;
  const json = JSON.stringify(project);
  const list = read();
  if (list[0] && list[0].json === json) return false;
  list.unshift({ t: now, label, title: project.title || 'Untitled', scenes: project.scenes.length, dur: Math.round(duration(project)), json });
  lastAuto = now;
  return write(list);
}
export function removeSnapshot(t) { write(read().filter((x) => x.t !== t)); }
export function clearHistory() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
