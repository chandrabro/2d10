// 🕘 Version history window.
import { h, button, fmtTime } from './dom.js';
import { listHistory, snapshot, removeSnapshot } from '../history.js';
import { migrate } from '../state.js';

export function openHistoryPanel(app, back) {
  const box = h('div', { class: 'list', style: { maxHeight: '55vh', overflowY: 'auto' } });
  const fmt = (t) => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function build() {
    box.innerHTML = '';
    const list = listHistory();
    if (!list.length) box.append(h('div', { class: 'note' }, 'No snapshots yet. They are saved automatically every few minutes while you work, and before New / Open / Demo / Restore.'));
    for (const s of list) {
      box.append(h('div', { class: 'item' },
        h('div', { class: 'head' }, h('b', {}, s.title), h('span', { class: 'badge' }, `${s.scenes} scenes · ${fmtTime(s.dur)}`)),
        h('div', { class: 'small muted' }, `${fmt(s.t)} · ${s.label} · ${(s.json.length / 1024).toFixed(0)} KB`),
        h('div', { class: 'row', style: { marginTop: '6px' } },
          button('↩ Restore this version', () => restore(s), 'tiny primary'),
          button('Delete', () => { removeSnapshot(s.t); build(); }, 'tiny danger'))));
    }
  }
  function restore(s) {
    if (!confirm('Restore this version? Your current project is saved as a snapshot first, so you can come back.')) return;
    app.pause(); snapshot(app.project, 'before restore', true);
    const p = migrate(JSON.parse(s.json)); if (!p) { app.toast('That snapshot could not be read.', true); return; }
    app.project = p; app._snapshot = JSON.stringify(p); app.undo.length = 0; app.redo.length = 0;
    app.sel = { scene: 0, actor: -1, action: null, dialog: null, character: null }; app.time = 0;
    document.getElementById('projectTitle').value = p.title;
    app.commit('restore version'); app.stage.resize(); app.closeModal(); app.toast(`Restored "${p.title}" (${fmt(s.t)})`);
  }
  build();
  app.modal(h('div', {},
    h('h2', {}, '🕘 Version history'),
    h('div', { class: 'note' }, 'Snapshots are kept only in this browser (last 10). Voice audio made with Gemini or recordings is not inside a snapshot – use Save file for a full backup.'),
    box,
    h('div', { class: 'row', style: { marginTop: '12px' } },
      button('📌 Save a snapshot now', () => { app.project && snapshot(app.project, 'manual', true); build(); app.toast('Snapshot saved.'); }, 'primary'),
      back ? button('← Tools', () => back(), '') : null,
      button('Close', () => app.closeModal()))));
}
