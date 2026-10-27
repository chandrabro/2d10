// Default TTS voices for male characters, female characters and the narrator, and the logic that
// decides which voice a dialog line uses. A dialog with voice '' (Auto) follows the project default
// for its speaker; picking a voice inside the dialog overrides it for that line only.

import * as tts from './tts.js';

export const ROLES = [['male', '👨 Male characters'], ['female', '👩 Female characters'], ['narrator', '🎙 Narrator']];
export const NARRATOR = -1; // dialog.actor value for the narrator

export function defaultVoices() {
  return {
    male: { voice: '', rate: 1, pitch: 0.9 },
    female: { voice: '', rate: 1, pitch: 1.15 },
    narrator: { voice: '', rate: 0.95, pitch: 1 },
  };
}
export function ensureVoices(project) {
  const def = defaultVoices();
  project.voices ||= def;
  for (const k of Object.keys(def)) project.voices[k] = { ...def[k], ...(project.voices[k] || {}) };
  return project.voices;
}

export function roleOf(project, scene, d) {
  if (d.actor === NARRATOR || d.actor == null) return 'narrator';
  const a = scene && scene.actors[d.actor];
  const c = a && project.characters.find((x) => x.id === a.characterId);
  return c && c.appearance && c.appearance.gender === 'female' ? 'female' : 'male';
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** The voice, rate and pitch that will actually be used for this dialog line. */
export function resolveVoice(project, scene, d) {
  const role = roleOf(project, scene, d);
  if (d.voice) return { role, auto: false, voice: d.voice, rate: clamp(d.rate || 1, 0.5, 2), pitch: clamp(d.pitch || 1, 0.5, 2) };
  const def = (project.voices && project.voices[role]) || { voice: '', rate: 1, pitch: 1 };
  return { role, auto: true, voice: def.voice || '', rate: clamp((def.rate || 1) * (d.rate || 1), 0.5, 2), pitch: clamp((def.pitch || 1) * (d.pitch || 1), 0.5, 2) };
}

// ---------- voice lists ----------
const base = (lang) => String(lang || '').split(/[-_]/)[0].toLowerCase();
export function languageOptions() {
  const counts = new Map();
  for (const v of tts.getVoices()) counts.set(base(v.lang), (counts.get(base(v.lang)) || 0) + 1);
  let names; try { names = new Intl.DisplayNames(['en'], { type: 'language' }); } catch (e) { names = null; }
  return [['', 'All languages'], ...[...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([l, n]) => [l, `${(names && names.of(l)) || l} (${n})`])];
}
/** <option> data for a voice dropdown; `current` is kept in the list even if the language filter hides it. */
export function voiceOptions(langFilter, current) {
  const all = tts.getVoices();
  let list = langFilter ? all.filter((v) => base(v.lang) === langFilter) : all;
  if (current && !list.some((v) => v.name === current)) { const c = all.find((v) => v.name === current); if (c) list = [c, ...list]; }
  return list.map((v) => [v.name, `${v.name} (${v.lang})`]);
}
export function voiceLabel(name) { return name ? name : 'system default voice'; }

const FEMALE = /female|woman|zira|samantha|susan|hazel|aria|jenny|heera|swara|kalpana|karen|victoria|fiona|moira|tessa|veena|allison|ava|serena|nora|amelie|sara|lekha|priya/i;
const MALE = /(^|[^a-z])male|man\b|david|mark|james|george|ravi|hemant|prabhat|daniel|alex|fred|rishi|guy|ryan|thomas|oliver|aaron|arthur|madhur/i;
/** Pick sensible defaults from the voices installed on this device (prefers `langFilter`, else the browser language). */
export function suggestVoices(langFilter = '') {
  const all = tts.getVoices(); if (!all.length) return null;
  const lang = langFilter || base(navigator.language || 'en');
  let pool = all.filter((v) => base(v.lang) === lang); if (!pool.length) pool = all;
  const female = pool.find((v) => FEMALE.test(v.name) && !/^(?=.*\bmale\b)(?!.*female)/i.test(v.name));
  const male = pool.find((v) => MALE.test(v.name) && !FEMALE.test(v.name));
  const rest = pool.filter((v) => v !== female && v !== male);
  return { male: (male || rest[0] || pool[0]).name, female: (female || rest[1] || rest[0] || pool[0]).name, narrator: (male || rest[0] || pool[0]).name, distinct: !!(male && female) };
}
