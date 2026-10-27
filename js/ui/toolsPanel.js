// 🧰 Tools window: small helpers that don't need their own top-bar button.
import { h, button } from './dom.js';
import { openScriptPanel } from './scriptPanel.js';
import { openHistoryPanel } from './historyPanel.js';
import { setAllFacing } from '../state.js';

export function openToolsPanel(app) {
  const back = () => openToolsPanel(app);
  const row = (title, text, btn) => h('div', { class: 'item' }, h('div', { class: 'head' }, h('b', {}, title)), h('div', { class: 'small muted', style: { margin: '4px 0 8px' } }, text), btn);
  app.modal(h('div', {},
    h('h2', {}, '🧰 Tools'),
    row('📝 Script → scenes', 'Type or paste your story as "Name: line" text and the app builds the scenes, characters and timing. Also downloads your current story as a script.', button('Open', () => openScriptPanel(app, back), 'primary')),
    row('🕘 Version history', 'Automatic snapshots of your project. Brings back an older version after a mistake or an accidental New / Open.', button('Open', () => openHistoryPanel(app, back), 'primary')),
    row('🎥 Face the camera', 'Make every character in every scene face the camera (both hands and feet visible), or go back to side view.', h('div', { class: 'row' },
      button('All face camera', () => { const n = setAllFacing(app.project, 'front'); app.commit('all face camera'); app.toast(`${n} actor(s) now face the camera.`); }, 'tiny'),
      button('All side view', () => { setAllFacing(app.project, 'side'); app.commit('all side view'); }, 'tiny'))),
    h('div', { class: 'row', style: { marginTop: '12px' } }, button('Close', () => app.closeModal()))));
}
