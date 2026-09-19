'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS } from '@/lib/constants';
import type { SupportLanguage } from '@/lib/language';
export function useRecorder(onTranscript: (text: string) => Promise<void>, language: SupportLanguage = 'hinglish') {
  const [recording, setRecording] = useState(false); const [transcribing, setTranscribing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [seconds, setSeconds] = useState(0); const [level, setLevel] = useState(0); const [error, setError] = useState(''); const [canRetry, setCanRetry] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null); const clock = useRef<ReturnType<typeof setInterval>>();
  const analyserFrame = useRef<number>(); const context = useRef<AudioContext>(); const blobRef = useRef<Blob>(); const controller = useRef<AbortController>(); const alive = useRef(true); const acquiring = useRef(false);
  const callback = useRef(onTranscript); callback.current = onTranscript;
  const release = useCallback(() => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; clearInterval(clock.current); if (analyserFrame.current) cancelAnimationFrame(analyserFrame.current); void context.current?.close().catch(() => {}); context.current = undefined; }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); if (recorder.current?.state === 'recording') { recorder.current.onstop = null; recorder.current.stop(); } release(); }; }, [release]);
  async function transcribe(blob: Blob) {
    setTranscribing(true); setCanRetry(false); setError(''); controller.current = new AbortController();
    try {
      const data = new FormData(); const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
      data.append('file', blob, `voice.${extension}`);
      data.append('support_language', language);
      const response = await fetch('/api/stt', { method: 'POST', body: data, signal: controller.current.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'I couldn’t hear that. Please try again.');
      if (!alive.current) return;
      setTranscribing(false); blobRef.current = undefined;
      await callback.current(result.text);
    } catch (e) { if (alive.current) { setError(e instanceof Error ? e.message : 'Your recording could not be transcribed.'); setCanRetry(true); } }
    finally { if (alive.current) setTranscribing(false); }
  }
  function stop() { if (recorder.current?.state === 'recording') recorder.current.stop(); }
  async function start() {
    if (acquiring.current || recorder.current?.state === 'recording' || transcribing) return;
    acquiring.current = true; setRequesting(true); setError(''); setCanRetry(false); blobRef.current = undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Recording needs a microphone-enabled browser on HTTPS or localhost. Try the latest Chrome, Edge, Firefox, or Safari.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!alive.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(media, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      recorder.current = rec;
      const chunks: BlobPart[] = []; let size = 0; let maxLevel = 0; let measured = false; let failed = false;
      try {
        const ac = new AudioContext(); context.current = ac; await ac.resume(); const analyser = ac.createAnalyser(); analyser.fftSize = 256; ac.createMediaStreamSource(media).connect(analyser); const data = new Uint8Array(analyser.fftSize);
        const sample = () => { if (!alive.current || recorder.current?.state === 'inactive') return; analyser.getByteTimeDomainData(data); const rms = Math.sqrt(data.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / data.length); measured = ac.state === 'running'; maxLevel = Math.max(maxLevel, rms); setLevel(Math.min(rms * 7, 1)); analyserFrame.current = requestAnimationFrame(sample); };
        rec.onstart = sample;
      } catch { /* Recording still works without the optional input meter. */ }
      rec.ondataavailable = event => { if (event.data.size) { chunks.push(event.data); size += event.data.size; if (size > MAX_AUDIO_BYTES && rec.state === 'recording') rec.stop(); } };
      rec.onerror = () => { failed = true; release(); setRecording(false); setError('Recording was interrupted. Check your microphone and try again.'); };
      rec.onstop = () => {
        release(); if (!alive.current || failed) return;
        setRecording(false); setLevel(0);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > MAX_AUDIO_BYTES) { setError('That recording was too large. Try a shorter reply.'); return; }
        if (blob.size < 500 || (measured && maxLevel < 0.006)) { setError('I didn’t hear a voice. Check your microphone, then try again.'); return; }
        blobRef.current = blob; void transcribe(blob);
      };
      rec.start(250); setRecording(true); setSeconds(0); const startedAt = Date.now();
      clock.current = setInterval(() => { const elapsed = Math.floor((Date.now() - startedAt) / 1000); setSeconds(elapsed); if (elapsed >= MAX_RECORDING_SECONDS) stop(); }, 250);
    } catch (e) {
      release(); if (alive.current) setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Microphone access is off. Allow the microphone in your browser’s site settings, then try again.' : e instanceof Error ? e.message : 'Your microphone could not start.');
    } finally { acquiring.current = false; if (alive.current) setRequesting(false); }
  }
  return { start, stop, recording, requesting, transcribing, seconds, level, error, canRetry, retry: () => { if (blobRef.current) void transcribe(blobRef.current); } };
}
