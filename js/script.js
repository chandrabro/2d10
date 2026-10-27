// Plain-text script  <->  scenes.
//
//   # Scene title | background name        (background optional, e.g. "Kitchen" or "vegetable_farm")
//   Narrator: text of the voice-over
//   Ram: a line spoken by the character called Ram
//   Sita (f): a NEW character is created from the name; (f) = woman, (m) = man (default)
//   Sita (f, old): tags can be combined – gender: f / m · age: old / child / teen / tall
//   // a comment line is ignored

import { newScene, newActor, newAction, newDialog, newCharacter, sequenceDialogs } from './state.js';
import { SCENES, getScene } from './engine/scenes/index.js';
import { estimateTtsDuration } from './engine/renderer.js';
import { STAGE_H } from './engine/util.js';

const NARR = /^(narrator|narration|voice[- ]?over|नरेटर|वाचक|सूत्रधार|कथावाचक|नैरेटर)$/i;
const AGES = { old: 'elder', elder: 'elder', elderly: 'elder', grandpa: 'elder', grandma: 'elder', child: 'child', kid: 'child', young: 'teen', teen: 'teen', teenager: 'teen', tall: 'tall' };
const norm = (s) => String(s || '').trim().toLowerCase();

export function findBackground(q) {
  const n = norm(q); if (!n) return null;
  return SCENES.find((s) => s.id === n) || SCENES.find((s) => norm(s.name) === n) || SCENES.find((s) => norm(s.name).includes(n) || s.id.includes(n.replace(/\s+/g, '_'))) || null;
}

/** Parse the text into blocks: [{ title, background, lines:[{ who, gender, text }] }] + warnings. */
export function parseScript(text) {
  const blocks = []; const warnings = []; let cur = null;
  const start = (title = '', bg = null) => { cur = { title, background: bg, lines: [] }; blocks.push(cur); return cur; };
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim(); if (!line || line.startsWith('//')) return;
    if (line.startsWith('#')) {
      const [t, b] = line.replace(/^#+\s*/, '').split('|');
      const bg = b ? findBackground(b) : null; if (b && !bg) warnings.push(`Line ${i + 1}: background "${b.trim()}" not found – the previous one is used.`);
      start((t || '').trim(), bg); return;
    }
    const m = /^([^:：]{1,40})[:：]\s*(.+)$/.exec(line);
    if (!cur) start('');
    if (!m) { cur.lines.push({ who: 'narrator', gender: null, text: line }); return; }
    let name = m[1].trim(); let gender = null, age = null;
    const g = /\s*\(([^)]*)\)\s*$/.exec(name);
    if (g) {
      for (const tag of g[1].split(/[,/;]|\s+/).map((x) => x.trim().toLowerCase()).filter(Boolean)) {
        if (['f', 'female', 'woman', 'girl'].includes(tag)) gender = 'f';
        else if (['m', 'male', 'man', 'boy'].includes(tag)) gender = 'm';
        if (AGES[tag]) age = AGES[tag];
        if (tag === 'girl' || tag === 'boy') age = age || 'child';
      }
      name = name.replace(g[0], '').trim();
    }
    cur.lines.push({ who: NARR.test(name) ? 'narrator' : name, gender, age, text: m[2].trim() });
  });
  return { blocks: blocks.filter((b) => b.lines.length), warnings };
}

/** Add the parsed script to the project as new scenes. Returns { scenes, characters, warnings }. */
export function buildScenes(project, parsed, { createCharacters = true } = {}) {
  const warnings = [...parsed.warnings]; const created = [];
  const find = (name) => { const n = norm(name); return project.characters.find((c) => norm(c.name) === n) || project.characters.find((c) => norm(c.name).startsWith(n) || n.startsWith(norm(c.name))) || project.characters.find((c) => norm(c.name).includes(n)); };
  let bg = project.scenes.length ? project.scenes[project.scenes.length - 1].background : 'living_room';
  const out = [];
  parsed.blocks.forEach((b, bi) => {
    if (b.background) bg = b.background.id;
    const sc = newScene(bg, { name: b.title || `Scene ${project.scenes.length + out.length + 1}`, transition: out.length || project.scenes.length ? 'fade' : 'cut' });
    const def = getScene(bg); const y = Math.round((def.groundY * STAGE_H + def.horizonY * STAGE_H) / 2 + 40);
    const slot = new Map();     // character id -> actor index
    const lines = [];
    for (const l of b.lines) {
      if (l.who === 'narrator') { lines.push({ actor: -1, text: l.text }); continue; }
      let ch = find(l.who);
      if (!ch && createCharacters) {
        const fem = l.gender === 'f';
        ch = newCharacter(l.age === 'elder' ? (fem ? 'grandma' : 'grandpa') : l.age === 'child' ? (fem ? 'girl_kid' : 'boy_kid') : fem ? 'custom_female' : 'custom_male', l.who);
        if (l.age && l.age !== 'elder' && l.age !== 'child') ch.appearance.build = l.age;
        project.characters.push(ch); created.push(ch.name);
      } else if (ch && l.age && ch.appearance) ch.appearance.build = l.age;    // an age tag on an existing character updates it
      if (!ch) { warnings.push(`Scene ${bi + 1}: no character called "${l.who}" – line skipped.`); continue; }
      if (!slot.has(ch.id)) {
        if (slot.size >= 3) { warnings.push(`Scene ${bi + 1}: more than 3 characters – "${l.who}" skipped (split the scene with a # line).`); continue; }
        slot.set(ch.id, slot.size);
      }
      lines.push({ actor: slot.get(ch.id), text: l.text });
    }
    const n = slot.size; const xs = n === 1 ? [640] : n === 2 ? [420, 860] : [300, 640, 980];
    [...slot.keys()].forEach((id, k) => {
      const a = newActor(id, xs[k], y); a.facing = k < n / 2 ? 1 : -1;
      if (project.faceCamera) a.orientation = 'front';
      sc.actors.push(a);
    });
    for (const l of lines) sc.dialogs.push(newDialog(l.actor, l.text, 0));
    sequenceDialogs(sc, {}, 0.5, (d) => d.duration || estimateTtsDuration(d.text));
    // each speaker "talks" while their line is spoken
    for (const d of sc.dialogs) if (d.actor >= 0) { const a = sc.actors[d.actor]; a.actions.push(newAction('talk', d.start, Math.round((d.start + d.duration) * 100) / 100)); }
    sc.duration = Math.max(5, Math.ceil(Math.max(0, ...sc.dialogs.map((d) => d.start + d.duration)) + 1));
    out.push(sc);
  });
  project.scenes.push(...out);
  return { scenes: out.length, characters: created, warnings };
}

/** The current story as a readable script (same format as above). */
export function projectToScript(project) {
  const lines = [];
  for (const s of project.scenes) {
    lines.push(`# ${s.name || 'Scene'} | ${getScene(s.background).name}`);
    for (const d of s.dialogs.slice().sort((a, b) => a.start - b.start)) {
      if (!String(d.text || '').trim()) continue;
      let who = 'Narrator';
      if (d.actor >= 0) { const a = s.actors[d.actor]; const c = a && project.characters.find((x) => x.id === a.characterId); who = c ? c.name : 'Unknown'; }
      lines.push(`${who}: ${String(d.text).trim()}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
