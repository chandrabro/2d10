// 📝 Script → scenes window.
import { h, button, download } from './dom.js';
import { parseScript, buildScenes, projectToScript } from '../script.js';
import { SCENES } from '../engine/scenes/index.js';
import { snapshot } from '../history.js';

const EXAMPLE = `# The Village | Vegetable Farm
Narrator: Early in the morning, the sun rose over the fields.
Ram: Good morning, Sita! The vegetables are ready.
Sita (f): Good morning! I will carry them to the market.
Bua (f, old): Take care on the road, my child.

# At the market | Street
Narrator: By noon the market was full of people.
Sita (f): Fresh vegetables! Fresh vegetables!
Ram: Everyone loves your hard work.`;

export function openScriptPanel(app, back) {
  const ta = h('textarea', { rows: 14, style: { width: '100%', fontFamily: 'inherit' }, placeholder: EXAMPLE });
  const status = h('div', { class: 'note', style: { whiteSpace: 'pre-line' } }, 'Write one line per sentence: "Name: text". Start a new scene with "# Title | Background". Narrator lines use "Narrator:".');
  let create = true;
  const chk = h('input', { type: 'checkbox', checked: true, onChange: (e) => { create = e.target.checked; } });
  const bgList = h('details', {}, h('summary', { class: 'small muted' }, 'Show background names'), h('div', { class: 'small muted', style: { maxHeight: '120px', overflowY: 'auto' } }, SCENES.map((s) => s.name).join(' · ')));
  const addBtn = button('➕ Add these scenes to the story', () => {
    const parsed = parseScript(ta.value);
    if (!parsed.blocks.length) { status.textContent = 'Nothing to add yet – type some lines first.'; return; }
    app.pause(); snapshot(app.project, 'before script import', true);
    const first = app.project.scenes.length;
    const r = buildScenes(app.project, parsed, { createCharacters: create });
    app.sel.scene = Math.min(first, app.project.scenes.length - 1); app.sel.actor = -1;
    app.commit('script to scenes'); app.closeModal();
    app.toast(`Added ${r.scenes} scene(s)` + (r.characters.length ? ` and ${r.characters.length} new character(s): ${r.characters.join(', ')}` : '') + (r.warnings.length ? ` · ${r.warnings.length} warning(s): ${r.warnings[0]}` : ''), !!r.warnings.length);
  }, 'primary');
  app.modal(h('div', {},
    h('h2', {}, '📝 Script → scenes'),
    h('div', { class: 'note' }, 'Paste or type your story as a script. Characters are matched by name; unknown names become new characters – add tags in brackets: "Name (f)" woman, "(m)" man, "(old)", "(child)", "(teen)", e.g. "Bua (f, old)". Each speaker gets a "talk" action, lines are timed one after another, and you can then use ⏱ Measure all after choosing voices in 🎙 Cast voices.'),
    ta, bgList,
    h('label', { class: 'row small', style: { gap: '6px' } }, chk, 'Create new characters for unknown names'),
    status,
    h('div', { class: 'row', style: { marginTop: '12px', flexWrap: 'wrap' } },
      addBtn,
      button('Use example', () => { ta.value = EXAMPLE; }, 'tiny'),
      button('⬇ Download current story as script (.txt)', () => download(new Blob([projectToScript(app.project)], { type: 'text/plain;charset=utf-8' }), `${(app.project.title || 'story').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'story'}-script.txt`), 'tiny'),
      back ? button('← Tools', () => back()) : null,
      button('Close', () => app.closeModal()))));
}
