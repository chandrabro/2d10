// Inspector tab: project settings, music, export shortcuts, help.

import { h, field, select, num, range, textInput, checkbox, button } from './dom.js';
import { ASPECTS } from './stage.js';
import { setAllFacing } from '../state.js';
import { SUB_MODES, SUB_STYLES, ensureSubtitles } from '../engine/subtitles.js';

export function renderSettingsPanel(app, root) {
  const p = app.project;
  const sec = h('div', { class: 'section' }, h('h3', {}, 'Project'));
  sec.append(h('div', { class: 'grid2' },
    field('Aspect ratio', select(Object.keys(ASPECTS).map((k) => [k, k + (k === '9:16' ? ' (Shorts / Reels / TikTok)' : k === '16:9' ? ' (YouTube)' : k === '4:5' ? ' (Instagram)' : '')]), p.aspect, (v) => { p.aspect = v; app.commit('aspect'); app.stage.resize(); })),
    field('Speech bubble style', select([['rounded', 'Rounded'], ['box', 'Comic box'], ['thought', 'Thought cloud'], ['shout', 'Shout']], p.bubbleStyle, (v) => { p.bubbleStyle = v; app.commit('bubble'); }))));
  sec.append(h('div', { class: 'grid2' },
    field(' ', checkbox('Fade out at the end', p.fadeOut !== false, (v) => { p.fadeOut = v; app.commit('fade'); })),
    field('Watermark text', textInput(p.watermark || '', (v) => { p.watermark = v; app.commit('watermark'); }, { placeholder: 'optional' }))));
  sec.append(checkbox('Auto-fit camera: keep the speaking / moving character in frame on vertical, square and 4:5 videos', p.autoFit !== false, (v) => { p.autoFit = v; app.commit('auto-fit camera'); }));
  sec.append(field('Character view (all scenes)', select([['side', 'Side view (profile)'], ['front', '🎥 Face the camera – both hands & feet visible']], p.faceCamera ? 'front' : 'side', (v) => { setAllFacing(p, v); app.commit('character view'); })));
  sec.append(h('div', { class: 'grid2' },
    field('Voice sync offset (s)', num(p.ttsSync || 0, (v) => { p.ttsSync = Math.max(-1, Math.min(2, v || 0)); app.commit('tts sync'); }, { min: -1, max: 2, step: 0.05 })),
    h('div', { class: 'small muted', style: { alignSelf: 'end' } }, 'Fine-tune lip-sync for ALL browser voices. If the voice is heard AFTER the mouth moves, increase it; if the voice comes BEFORE, decrease it.')));
  root.append(sec);

  // ---------- subtitles ----------
  const sb = ensureSubtitles(p);
  const ss = h('div', { class: 'section' }, h('h3', {}, 'Subtitles (burned into the video)'));
  ss.append(h('div', { class: 'grid2' },
    field('Show subtitles for', select(SUB_MODES, sb.mode, (v) => { sb.mode = v; app.commit('subtitles'); })),
    field('Style', select(SUB_STYLES, sb.style, (v) => { sb.style = v; app.commit('subtitle style'); }))));
  ss.append(h('div', { class: 'grid2' },
    field('Position', select([['bottom', 'Bottom'], ['center', 'Center'], ['top', 'Top']], sb.position, (v) => { sb.position = v; app.commit('subtitle position'); })),
    field('Size', range(sb.size, (v) => { sb.size = v; app.commitLazy('subtitle size'); }, { min: 0.03, max: 0.09, step: 0.005 }))));
  ss.append(h('div', { class: 'grid2' },
    field('Text colour', h('input', { type: 'color', value: sb.color, onInput: (e) => { sb.color = e.target.value; app.commitLazy('subtitle color'); } })),
    field('Highlight colour (karaoke / names)', h('input', { type: 'color', value: sb.highlight, onInput: (e) => { sb.highlight = e.target.value; app.commitLazy('subtitle highlight'); } }))));
  ss.append(checkbox('Show the speaker’s name above the subtitle', !!sb.speakerNames, (v) => { sb.speakerNames = v; app.commit('subtitle names'); }));
  ss.append(checkbox('Hide speech bubbles when all speech is subtitled', !!sb.hideBubbles, (v) => { sb.hideBubbles = v; app.commit('subtitle bubbles'); }));
  ss.append(h('div', { class: 'small muted' }, 'Need a separate .srt / .vtt file for YouTube or TikTok? Use Export → Subtitle file.'));
  root.append(ss);

  root.append(h('div', { class: 'note' }, 'Narration and background music now live in the ', h('b', {}, 'Audio'), ' tab.', ' ', button('Open Audio tab', () => { app.tab = 'audio'; app.rerenderPanels(); }, 'tiny')));

  const help = h('div', { class: 'section' }, h('h3', {}, 'How to use'));
  help.append(h('ol', { class: 'small', style: { paddingLeft: '18px', margin: 0, lineHeight: 1.6 } },
    h('li', {}, h('b', {}, 'Characters tab:'), ' add ready-made characters (farmer, police, pilot, air hostess…) or build your own.'),
    h('li', {}, h('b', {}, 'Scene tab:'), ' pick one of 50 backgrounds, duration, time of day, weather and camera.'),
    h('li', {}, h('b', {}, 'Actors tab:'), ' add up to 3 characters, drag them on the stage, set facing and add actions (walk to a point, dig, laugh…).'),
    h('li', {}, h('b', {}, 'Dialog tab:'), ' write lines, choose browser voice / record / upload, set the start time. Use Auto-sequence so they never overlap.'),
    h('li', {}, h('b', {}, 'Export:'), ' MP4 is rendered entirely in your browser.')));
  help.append(h('div', { class: 'small muted', style: { marginTop: '8px' } }, h('kbd', {}, 'Space'), ' play/pause · ', h('kbd', {}, '←'), h('kbd', {}, '→'), ' step 0.1 s · ', h('kbd', {}, 'Ctrl+Z'), ' undo · ', h('kbd', {}, 'Ctrl+wheel'), ' zoom timeline · double-click a timeline track to add'));
  root.append(help);
}
