// Inspector tab: one narration track + one background-music track for the whole movie.

import { h, field, select, num, range, checkbox, button, fmtTime, round } from './dom.js';
import { totalDuration } from '../engine/renderer.js';
import * as tts from '../audio/tts.js';
import { ROLES, ensureVoices, resolveVoice, voiceOptions, languageOptions, suggestVoices } from '../audio/voices.js';


let voicesListener = false;

export function renderAudioPanel(app, root) {
  const p = app.project;
  const n = p.narration || (p.narration = { audioId: null, volume: 1, offset: 0 });
  const m = p.music || (p.music = { audioId: null, volume: 0.35, loop: true });
  const total = totalDuration(p);

  const pct = (v) => Math.round(v * 100) + '%';
  const volumeRow = (obj, key, setLive, max = 1) => {
    const lbl = h('span', { class: 'small muted', style: { minWidth: '40px', textAlign: 'right' } }, pct(obj[key] ?? 1));
    const slider = range(obj[key] ?? 1, (v) => { obj[key] = v; lbl.textContent = pct(v); setLive(v); app.commitLazy('volume'); }, { min: 0, max, step: 0.01 });
    return field('Volume', h('div', { class: 'row' }, slider, lbl));
  };
  const loadFile = async (file, obj, label) => {
    try {
      app.toast(`Loading ${label}…`);
      const clip = await app.store.add(file, file.name);
      obj.audioId = clip.id; app.pause(); app.commit(label);
      app.toast(`${label}: ${file.name} (${fmtTime(clip.duration)})`);
    } catch (err) { app.toast(`Could not decode that file: ${err.message}`, true); }
  };
  const filePicker = (obj, label) => h('input', { type: 'file', accept: 'audio/*,video/mp4', style: { fontSize: '12px' }, onChange: (e) => { const f = e.target.files[0]; if (f) loadFile(f, obj, label); e.target.value = ''; } });
  const preview = (obj) => button('▶ Preview', () => app.player.preview(obj.audioId), 'tiny');

  // ---------- default voices ----------
  const voices = ensureVoices(p);
  const vs = h('div', { class: 'section' }, h('h3', {}, '🗣 Browser voices (preview & live recording only)'));
  if (!tts.ttsAvailable()) vs.append(h('div', { class: 'note warn' }, 'This browser has no speech synthesis. Use narration / uploaded / recorded audio instead.'));
  else {
    if (!voicesListener && 'speechSynthesis' in window) { voicesListener = true; speechSynthesis.addEventListener('voiceschanged', () => { if (app.tab === 'audio' || app.tab === 'dialog') app.rerenderPanels(); }); }
    if (!tts.getVoices().length) vs.append(h('div', { class: 'note' }, 'Loading the voices installed on this device…'));
    vs.append(h('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'Every dialog line follows these automatically: male characters, female characters (by each character\'s gender) and the Narrator (choose "Narrator" as the speaker in the Dialog tab). In a dialog you can still pick a different voice for that line.'));
    vs.append(field('Show voices for language', h('div', { class: 'row' },
      h('select', { onChange: (e) => { app.voiceLang = e.target.value; app.rerenderPanels(); } }, ...languageOptions().map(([v, l]) => h('option', { value: v, selected: v === (app.voiceLang || '') }, l))),
      button('✨ Suggest voices', () => {
        const sg = suggestVoices(app.voiceLang || ''); if (!sg) { app.toast('No voices found on this device yet.', true); return; }
        voices.male.voice = sg.male; voices.female.voice = sg.female; voices.narrator.voice = sg.narrator; app.commit('suggest voices');
        app.toast(sg.distinct ? 'Voices picked – use ▶ to test them.' : 'No clearly male/female voices found – pitch differs per role; choose manually if needed.');
      }, 'tiny fixed'))));
    for (const [role, label] of ROLES) {
      const v = voices[role];
      const sample = role === 'narrator' ? 'Once upon a time, in a small village near the hills.' : role === 'female' ? 'Hello! How are you today?' : 'Hello! How are you doing today?';
      vs.append(h('div', { class: 'item' },
        h('div', { class: 'head' }, h('b', {}, label), button('▶ Test', async () => { tts.cancel(); await tts.speak(sample, { voice: v.voice, rate: v.rate, pitch: v.pitch }); }, 'tiny fixed')),
        field('Voice', h('select', { onChange: (e) => { v.voice = e.target.value; app.commit('default voice'); } },
          h('option', { value: '', selected: !v.voice }, 'System default voice'),
          ...voiceOptions(app.voiceLang || '', v.voice).map(([val, l]) => h('option', { value: val, selected: val === v.voice }, l)))),
        h('div', { class: 'grid2' },
          field('Speed', num(v.rate, (x) => {
            const old = v.rate; v.rate = Math.max(0.5, Math.min(2, x || 1));
            // keep timings of auto-voice lines in step with the new speed
            for (const sc of p.scenes) for (const d of sc.dialogs) if (d.source === 'tts' && !d.audioId && !d.voice && resolveVoice(p, sc, { ...d, rate: 1 }).role === role) d.duration = Math.round(d.duration * old / v.rate * 100) / 100;
            app.commit('default speed');
          }, { min: 0.5, max: 2, step: 0.05 })),
          field('Pitch', num(v.pitch, (x) => { v.pitch = Math.max(0.5, Math.min(2, x || 1)); app.commit('default pitch'); }, { min: 0.5, max: 2, step: 0.05 })))));
    }
    vs.append(button('Use these defaults for every dialog', () => {
      let n = 0; for (const sc of p.scenes) for (const d of sc.dialogs) if (d.voice) { d.voice = ''; n++; }
      app.commit('reset dialog voices'); app.toast(n ? `${n} dialog line(s) now follow the defaults.` : 'All dialog lines already follow the defaults.');
    }, 'tiny', { title: 'Clears manually chosen voices on all dialogs' }));
    vs.append(h('div', { class: 'note' }, 'Browser voices are only audible in the preview and in Export → Live recording. For the fast MP4 export, upload a narration file below. Nepali voices are rarely installed in browsers; Hindi usually is.'));
  }
  root.append(vs);

  // ---------- narration ----------
  const ns = h('div', { class: 'section' }, h('h3', {}, '🎙 Narration (one file for the whole movie)'));
  ns.append(h('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'Starts at the beginning of scene 1 (or at the offset below) and plays straight through all scenes.'));
  ns.append(field('Narration file (mp3, wav, m4a, ogg…)', filePicker(n, 'Narration')));
  if (n.audioId) {
    const clip = app.store.get(n.audioId);
    ns.append(h('div', { class: 'row' },
      h('span', { class: 'badge ' + (clip ? 'ok' : 'warn') }, clip ? `🎙 ${clip.name} · ${fmtTime(clip.duration)}` : '⚠ file missing – upload again'),
      clip ? preview(n) : null,
      button('remove', () => { n.audioId = null; app.pause(); app.commit('remove narration'); }, 'tiny fixed')));
    ns.append(volumeRow(n, 'volume', (v) => app.player.setNarrationVolume(v)));
    ns.append(field('Start offset (seconds)', num(n.offset || 0, (v) => { n.offset = Number.isFinite(v) ? v : 0; app.pause(); app.commit('narration offset'); }, { min: -600, max: 3600, step: 0.1, width: '90px' })));
    if (clip) {
      const end = (n.offset || 0) + clip.duration;
      if (end > total + 0.05) {
        ns.append(h('div', { class: 'note warn' }, `Narration ends at ${fmtTime(end)} but the movie is only ${fmtTime(total)} long – the end would be cut off. `,
          button('Extend last scene to fit', () => {
            const last = p.scenes[p.scenes.length - 1]; if (!last) return;
            last.duration = round(last.duration + (end - total) + 0.5, 1); app.commit('fit narration');
          }, 'tiny')));
      } else ns.append(h('div', { class: 'small muted' }, `Narration ends at ${fmtTime(end)} · movie length ${fmtTime(total)}`));
    }
  }
  root.append(ns);

  // ---------- background music ----------
  const ms = h('div', { class: 'section' }, h('h3', {}, '🎵 Background music (one file for the whole movie)'));
  ms.append(field('Music file (mp3, wav, m4a, ogg…)', filePicker(m, 'Music')));
  if (m.audioId) {
    const clip = app.store.get(m.audioId);
    ms.append(h('div', { class: 'row' },
      h('span', { class: 'badge ' + (clip ? 'ok' : 'warn') }, clip ? `🎵 ${clip.name} · ${fmtTime(clip.duration)}` : '⚠ file missing – upload again'),
      clip ? preview(m) : null,
      button('remove', () => { m.audioId = null; app.pause(); app.commit('remove music'); }, 'tiny fixed')));
    ms.append(volumeRow(m, 'volume', (v) => app.player.setMusicVolume(v)));
    ms.append(checkbox('Loop until the movie ends', m.loop !== false, (v) => { m.loop = v; app.pause(); app.commit('loop'); }));
    ms.append(checkbox('Fade music out at the end', p.fadeOut !== false, (v) => { p.fadeOut = v; app.commit('fade'); }));
  } else ms.append(h('div', { class: 'small muted' }, 'Tip: keep the music around 15–35% so it does not drown the voices.'));
  root.append(ms);

  root.append(h('div', { class: 'note' }, 'Narration, music and any recorded / uploaded dialog audio are mixed into every export (MP4 fast export, WebM, and live recording). Browser text-to-speech voices are the only audio that needs the live-recording method.'));
}
