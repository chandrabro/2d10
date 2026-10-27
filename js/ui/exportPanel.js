// Export modal.

import { h, field, select, button, checkbox, download, fmtTime } from './dom.js';
import { exportMp4Offline, exportRealtime, exportLiveWithTabAudio, snapshotPng, supportsWebCodecs } from '../export/exporter.js';
import { totalDuration, dialogDuration } from '../engine/renderer.js';
import { buildCues, toSrt, toVtt, SUB_MODES } from '../engine/subtitles.js';
import { hasTts } from '../audio/mixer.js';
import { ASPECTS } from './stage.js';

export function openExportModal(app) {
  const p = app.project;
  const [aw, ah] = ASPECTS[p.aspect] || ASPECTS['16:9'];
  const resolutions = [['720', `${aw} × ${ah} (HD)`], ['1080', `${Math.round(aw * 1.5)} × ${Math.round(ah * 1.5)} (Full HD)`]];
  let res = '1080', fps = '30', quality = 'high', mode = supportsWebCodecs() ? 'mp4' : 'realtime';
  const tts = hasTts(p);
  const total = totalDuration(p);
  const body = h('div');
  const progress = h('div', { class: 'progress' }, h('i'));
  const status = h('div', { class: 'small muted', style: { margin: '6px 0 10px' } }, `Movie length: ${fmtTime(total)} · ${p.scenes.length} scene(s)`);
  let controller = null;
  const modeSel = select([
    ['mp4', supportsWebCodecs() ? 'MP4 – fast, frame-perfect (recommended)' : 'MP4 (needs Chrome/Edge – not available here)'],
    ['live', 'Live recording with system audio – captures browser TTS voices'],
    ['realtime', 'WebM / MP4 via screen-less real-time recording (fallback)'],
  ], mode, (v) => { mode = v; updateNote(); });
  const note = h('div', { class: 'note' });
  const updateNote = () => {
    note.className = 'note';
    const nTts = p.scenes.reduce((n, sc) => n + sc.dialogs.filter((d) => d.source === 'tts' && !d.audioId && d.text).length, 0);
    const mixed = 'Narration, background music and recorded / uploaded dialog audio are included.';
    if (mode === 'mp4') {
      note.textContent = nTts ? `${mixed} ${nTts} dialog line(s) use a browser TTS voice – the browser cannot hand that audio to the exporter, so they will be SILENT in this mode. Use a narration file, record / upload those lines, or pick "Live recording" (Windows / ChromeOS).` : `Renders every frame exactly. ${mixed} Encoding happens in your browser; nothing is uploaded.`;
      if (nTts) note.className = 'note warn';
    } else if (mode === 'live') {
      note.className = 'note warn';
      note.textContent = `Plays the movie in real time (${fmtTime(total)}). ${nTts ? 'In the share dialog choose "Entire screen" (NOT a tab) and tick "Also share system audio" – browser TTS voices can only be heard that way, on Windows / ChromeOS. Keep this tab in front and mute other apps.' : 'No browser-TTS lines in this project, so no screen sharing is needed.'} ${mixed}`;
    } else note.textContent = `Records the canvas in real time with MediaRecorder (WebM, or MP4 where supported). ${mixed} Browser TTS lines are silent.`;
  };
  updateNote();
  const startBtn = button('Start export', run, 'accent');
  const cancelBtn = button('Cancel', () => { if (controller) controller.abort(); else app.closeModal(); }, 'ghost');
  const pngBtn = button('Save current frame as PNG', async () => { const blob = await snapshotPng(p, app.store, app.time, res === '1080' ? aw * 1.5 : aw, res === '1080' ? ah * 1.5 : ah); download(blob, `${safeName(p.title)}-frame.png`); }, 'ghost');
  body.append(
    h('h2', {}, 'Export video'),
    status,
    field('Format', select([['16:9', '16:9 · YouTube / landscape'], ['9:16', '9:16 · Shorts / Reels / TikTok (vertical)'], ['1:1', '1:1 · Square'], ['4:5', '4:5 · Instagram portrait'], ['4:3', '4:3 · Classic']], p.aspect, (v) => { p.aspect = v; app.commit('aspect'); app.stage.resize(); openExportModal(app); })),
    aw / ah < 1.7 ? checkbox('Auto-fit camera – keep the speaking / moving character in frame', p.autoFit !== false, (v) => { p.autoFit = v; app.commit('auto-fit camera'); }) : '',
    h('div', { class: 'grid2' },
      field('Burned-in subtitles', select(SUB_MODES, p.subtitles ? p.subtitles.mode : 'narrator', (v) => { p.subtitles.mode = v; app.commit('subtitles'); })),
      field('Subtitle file', h('div', { class: 'row' },
        button('.srt', () => saveSubs('srt'), 'tiny'), button('.vtt', () => saveSubs('vtt'), 'tiny')))),
    h('div', { class: 'grid3' },
      field('Resolution', select(resolutions, res, (v) => { res = v; })),
      field('Frame rate', select([['24', '24 fps (film)'], ['30', '30 fps'], ['60', '60 fps']], fps, (v) => { fps = v; })),
      field('Quality', select([['medium', 'Medium (small file)'], ['high', 'High'], ['ultra', 'Ultra']], quality, (v) => { quality = v; }))),
    field('Method', modeSel), note, progress,
    h('div', { class: 'row', style: { marginTop: '12px' } }, startBtn, pngBtn, cancelBtn));
  app.modal(body);
  function saveSubs(kind) {
    const cues = buildCues(p, app.store.info, dialogDuration, { speakerNames: !!(p.subtitles && p.subtitles.speakerNames) });
    if (!cues.length) { app.toast('There are no dialog lines to turn into subtitles.', true); return; }
    download(new Blob([kind === 'srt' ? toSrt(cues) : toVtt(cues)], { type: 'text/plain;charset=utf-8' }), `${safeName(p.title)}.${kind}`);
    app.toast(`Saved ${cues.length} subtitle cues (${kind.toUpperCase()}). Style & colours: Settings → Subtitles.`);
  }

  async function run() {
    if (!p.scenes.length) { app.toast('Nothing to export – add a scene first.', true); return; }
    const scale = res === '1080' ? 1.5 : 1;
    const width = Math.round(aw * scale), height = Math.round(ah * scale);
    controller = new AbortController();
    startBtn.disabled = true; modeSel.disabled = true; pngBtn.disabled = true; cancelBtn.textContent = 'Cancel export';
    app.pause();
    const onProgress = ({ stage, ratio, fps: f, level }) => {
      progress.firstChild.style.width = Math.round(ratio * 100) + '%';
      const meter = level == null ? '' : '  ·  sound captured: ' + '█'.repeat(Math.min(10, Math.round(Math.sqrt(level) * 18))).padEnd(10, '░') + (level < 0.002 ? ' (silent)' : '');
      status.textContent = stage === 'audio' ? 'Mixing audio…' : stage === 'finalize' ? 'Finalising file…' : `Rendering ${Math.round(ratio * 100)}%` + (f ? ` · ${f.toFixed(0)} frames/s` : '') + meter;
    };
    try {
      const opts = { width, height, fps: parseInt(fps), quality, onProgress, signal: controller.signal };
      let result;
      if (mode === 'mp4') result = await exportMp4Offline(p, app.store, opts);
      else if (mode === 'live') result = await exportLiveWithTabAudio(p, app.store, app.player, opts);
      else result = await exportRealtime(p, app.store, opts);
      const name = `${safeName(p.title)}.${result.ext}`;
      download(result.blob, name);
      status.textContent = `Done: ${name} (${(result.blob.size / 1048576).toFixed(1)} MB)`;
      if (result.maxLevel != null && result.maxLevel < 0.003) {
        status.textContent += '\n⚠ NO BROWSER-VOICE SOUND was captured, so those lines are silent in this video. Make sure "Entire screen" and "Also share system audio" were chosen and the PC is not muted – or, easier, turn the lines into real audio with 🎙 Cast voices (Gemini) and use the fast MP4 export.';
        status.style.whiteSpace = 'pre-line';
      }
      app.toast(`Exported ${name}`);
    } catch (e) {
      console.error(e);
      status.textContent = 'Export failed: ' + e.message;
      app.toast('Export failed: ' + e.message, true);
      if (mode === 'mp4' && /WebCodecs|encoder|load/i.test(e.message)) status.textContent += ' — try the real-time WebM method.';
    } finally {
      controller = null; startBtn.disabled = false; modeSel.disabled = false; pngBtn.disabled = false; cancelBtn.textContent = 'Close';
    }
  }
}
function safeName(s) { return String(s || 'story').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'story'; }
