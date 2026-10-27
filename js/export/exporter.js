// Video export – everything runs in the browser.
//  1. exportMp4Offline: frame-exact MP4 (H.264 + AAC/Opus) via WebCodecs + Mediabunny (loaded from a CDN on demand).
//  2. exportRealtime: MediaRecorder fallback (WebM, or MP4 where the browser supports it).
//  3. exportLiveWithTabAudio: real-time recording that captures the tab's audio, so browser TTS voices are included.

import { renderFrame, totalDuration } from '../engine/renderer.js';
import { renderMix, hasAnyAudio, hasTts } from '../audio/mixer.js';

const MEDIABUNNY_URL = 'https://cdn.jsdelivr.net/npm/mediabunny@1.61.6/dist/bundles/mediabunny.min.mjs';
let mbPromise = null;
export function loadMediabunny() {
  if (!mbPromise) mbPromise = import(/* webpackIgnore: true */ MEDIABUNNY_URL).catch((e) => { mbPromise = null; throw new Error('Could not load the MP4 encoder library (needs internet for the first load): ' + e.message); });
  return mbPromise;
}
export const supportsWebCodecs = () => typeof window !== 'undefined' && 'VideoEncoder' in window;

const yieldUI = () => new Promise((r) => setTimeout(r, 0));

export async function exportMp4Offline(project, store, { width = 1280, height = 720, fps = 30, quality = 'high', onProgress = () => {}, signal } = {}) {
  if (!supportsWebCodecs()) throw new Error('WebCodecs is not available in this browser. Use Chrome / Edge, or choose the WebM export.');
  const mb = await loadMediabunny();
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, Quality, getFirstEncodableVideoCodec, getFirstEncodableAudioCodec } = mb;
  const videoCodec = await getFirstEncodableVideoCodec(['avc', 'hevc', 'av1', 'vp9'], { width, height });
  if (!videoCodec) throw new Error('No supported video encoder found for ' + width + 'x' + height);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const bitrate = quality === 'ultra' ? 16e6 : quality === 'high' ? 9e6 : quality === 'medium' ? 5e6 : 2.5e6;
  const videoSource = new CanvasSource(canvas, { codec: videoCodec, quality: new Quality({ bitrate: Math.round(bitrate * (width * height) / (1920 * 1080)) }) });
  output.addVideoTrack(videoSource, { frameRate: fps });
  let audioSource = null, mix = null;
  const includeAudio = hasAnyAudio(project, store);
  if (includeAudio) {
    onProgress({ stage: 'audio', ratio: 0 });
    mix = await renderMix(project, store, 48000);
    const audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: 48000 }) || 'pcm-s16';
    audioSource = new AudioBufferSource({ codec: audioCodec, quality: new Quality({ bitrate: 160e3 }) });
    output.addAudioTrack(audioSource);
  }
  output.setMetadataTags?.({ title: project.title || 'StoryStage movie', comment: 'Made with StoryStage' });
  await output.start();
  if (audioSource) { await audioSource.add(mix); audioSource.close?.(); }
  const total = totalDuration(project);
  const frames = Math.ceil(total * fps);
  const audioInfo = store.info;
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    if (signal && signal.aborted) { await output.cancel(); throw new Error('Export cancelled'); }
    const t = i / fps;
    renderFrame(ctx, project, t, { width, height, audioInfo });
    await videoSource.add(t, 1 / fps);
    if (i % 5 === 0) { onProgress({ stage: 'video', ratio: i / frames, fps: i / ((performance.now() - t0) / 1000) }); await yieldUI(); }
  }
  videoSource.close?.();
  onProgress({ stage: 'finalize', ratio: 1 });
  await output.finalize();
  return { blob: new Blob([output.target.buffer], { type: 'video/mp4' }), ext: 'mp4', codec: videoCodec };
}

function pickRecorderMime() {
  const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

/** Measures the loudness of a captured audio stream (so we can tell the user when NOTHING is being captured). */
function monitorLevel(actx, stream) {
  const src = actx.createMediaStreamSource(stream);
  const an = actx.createAnalyser(); an.fftSize = 1024; src.connect(an);   // not connected to the speakers -> no echo
  const buf = new Float32Array(an.fftSize); let max = 0;
  return {
    read() { an.getFloatTimeDomainData(buf); let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]; const r = Math.sqrt(sum / buf.length); if (r > max) max = r; return r; },
    max: () => max,
    stop() { try { src.disconnect(); } catch (e) { /* ignore */ } },
  };
}

/** Real-time render + MediaRecorder.
 *  Audio in the recording = offline mix (narration, music, recorded/uploaded dialogs)
 *  + optionally a live MediaStream (captured browser-TTS voices) mixed in through WebAudio. */
async function recordRealtime(project, store, { width, height, fps, onProgress, signal, liveAudioStream = null, player = null }) {
  if (!window.MediaRecorder) throw new Error('MediaRecorder is not available in this browser.');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const stream = canvas.captureStream(fps);
  const actx = store.ctx; await Promise.race([store.resume(), new Promise((r) => setTimeout(r, 500))]);
  const dest = actx.createMediaStreamDestination();
  let mixSrc = null, liveSrc = null;
  if (hasAnyAudio(project, store)) {
    const mix = await renderMix(project, store, actx.sampleRate);
    mixSrc = actx.createBufferSource(); mixSrc.buffer = mix; mixSrc.connect(dest);
  }
  let level = null;
  if (liveAudioStream) { liveSrc = actx.createMediaStreamSource(liveAudioStream); liveSrc.connect(dest); try { level = monitorLevel(actx, liveAudioStream); } catch (e) { console.warn('level monitor failed', e); } }
  if (mixSrc || liveSrc) dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mime = pickRecorderMime();
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 8e6, audioBitsPerSecond: 192e3 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const total = totalDuration(project);
  const done = new Promise((resolve) => { rec.onstop = () => resolve(); });
  rec.start(250);
  // start the speech scheduler first, then take the clock, so voices and picture share one t=0
  if (player) { player.ttsOnly = true; player.ttsEnabled = true; player.setMuted(false); await player.play(project, 0); }
  const start = performance.now();
  if (mixSrc) mixSrc.start();
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (signal && signal.aborted) return resolve();
      if (t >= total) return resolve();
      renderFrame(ctx, project, t, { width, height, audioInfo: store.info });
      onProgress({ stage: 'video', ratio: t / total, level: level ? level.read() : undefined });
      requestAnimationFrame(tick);
    };
    tick();
  });
  await new Promise((r) => setTimeout(r, 400)); // let the last words / tail of the audio land
  rec.stop(); await done;
  if (mixSrc) { try { mixSrc.stop(); } catch (e) { /* ignore */ } }
  if (liveSrc) { try { liveSrc.disconnect(); } catch (e) { /* ignore */ } }
  const maxLevel = level ? level.max() : null; if (level) level.stop();
  if (player) { player.pause(); player.ttsOnly = false; }
  if (signal && signal.aborted) throw new Error('Export cancelled');
  const type = rec.mimeType || mime || 'video/webm';
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', codec: type, maxLevel };
}

export async function exportRealtime(project, store, opts) { return recordRealtime(project, store, opts); }

/**
 * Live export that also captures browser text-to-speech voices.
 *
 * Why this exists: Chrome's Web Speech API (speechSynthesis) is played by the operating system's
 * speech engine / a separate browser process, NOT by this tab's audio pipeline. "Share tab audio"
 * therefore never contains TTS voices (it only contains Web Audio / <audio> output). Only "system
 * audio" capture (Share ENTIRE SCREEN + "Also share system audio", Windows / ChromeOS) can hear them.
 *
 * Everything else (narration, music, recorded/uploaded dialogs) is mixed offline and added to the
 * recording directly, so it does not depend on what the capture hears.
 */
export async function exportLiveWithTabAudio(project, store, player, opts) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('Screen/audio capture is not available in this browser. Use desktop Chrome or Edge.');
  if (!hasTts(project)) return recordRealtime(project, store, { ...opts, player: null }); // nothing to capture
  const disp = await navigator.mediaDevices.getDisplayMedia({
    video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    systemAudio: 'include', selfBrowserSurface: 'include', surfaceSwitching: 'exclude',
  });
  const stopAll = () => disp.getTracks().forEach((t) => t.stop());
  try {
    const surface = disp.getVideoTracks()[0]?.getSettings?.().displaySurface;
    const audioTracks = disp.getAudioTracks();
    if (surface === 'browser') throw new Error('You shared a browser tab. Chrome cannot hear text-to-speech voices from a shared tab. Start again and choose "Entire screen", then tick "Also share system audio".');
    if (!audioTracks.length) throw new Error('No audio was shared. Start again, choose "Entire screen" and tick "Also share system audio" (Windows / ChromeOS Chrome or Edge). On macOS use narration / recorded / uploaded audio instead.');
    // keep the (unused) video track alive – stopping it can end the capture session in some Chrome versions
    return await recordRealtime(project, store, { ...opts, liveAudioStream: new MediaStream(audioTracks), player });
  } finally { stopAll(); if (player) { player.ttsOnly = false; } }
}

export function snapshotPng(project, store, time, width = 1920, height = 1080) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  renderFrame(canvas.getContext('2d'), project, time, { width, height, audioInfo: store.info });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
