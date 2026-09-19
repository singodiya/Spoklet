'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, AudioLines, Check, ChevronDown, Keyboard, Loader2, Mic, RotateCcw, Send, ShieldCheck, Sparkles, Square, Volume2 } from 'lucide-react';
import { api } from '@/lib/client-api';
import { useRecorder } from '@/hooks/use-recorder';
import { supportLanguage, type SupportLanguage } from '@/lib/language';
import type { ChatIntent } from '@/lib/ai/prompts';
import type { ChatResult, Message, Mistake, Mode, Profile, Session, Stage } from '@/lib/types';
import { MAX_USER_TURNS, MIN_SESSION_TURNS } from '@/lib/constants';
import { Waveform } from './brand';
import LanguagePicker from './language-picker';
import CorrectionCard from './correction-card';
interface Ending { summary: string; score: number | null; counted: boolean; stageAdvanced?: boolean }
interface Pending { message: string; requestId: string; intent: ChatIntent; language: SupportLanguage }
export default function VoiceRoom({ mode, profile, stage }: { mode: Mode; profile: Profile; stage?: Stage }) {
  const onboarding = mode === 'onboarding';
  const router = useRouter();
  const [language, setLanguage] = useState(supportLanguage(profile.support_language));
  const english = language === 'english';
  const t = (en: string, hi: string) => english ? en : hi;
  const [languageNotice, setLanguageNotice] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'thinking' | 'voicing' | 'ending' | 'saving'>('idle');
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [done, setDone] = useState(false);
  const [ending, setEnding] = useState<Ending | null>(null);
  const [audioNotice, setAudioNotice] = useState('');
  const [audioSources, setAudioSources] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const audioIndex = useRef(0);
  const ttsAbort = useRef<AbortController>();
  const requestAbort = useRef<AbortController>();
  const alive = useRef(true);
  const transcript = useRef<HTMLDivElement>(null);
  const recorder = useRecorder(async spoken => { await sendMessage(spoken); }, language);
  const userTurns = messages.filter(m => m.role === 'user').length;
  const busy = phase !== 'idle' || recorder.transcribing || recorder.requesting;
  const blocked = busy || recorder.recording || !!pending;
  useEffect(() => { alive.current = true; return () => { alive.current = false; ttsAbort.current?.abort(); requestAbort.current?.abort(); }; }, []);
  useEffect(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages, pending]);
  useEffect(() => {
    if (!audioSources.length || !audio.current) return;
    audioIndex.current = 0; audio.current.src = audioSources[0];
    void audio.current.play().catch(() => { setAudioNotice('Tap play to listen · सुनने के लिए play दबाएँ।'); setSpeaking(false); });
  }, [audioSources]);
  function stopAudio() { ttsAbort.current?.abort(); audio.current?.pause(); setSpeaking(false); }
  async function speak(reply: string, selectedLanguage = language) {
    stopAudio(); setAudioNotice('');
    const controller = new AbortController(); ttsAbort.current = controller;
    try {
      const data = await api<{ audios: string[] }>('/api/tts', { text: reply.slice(0, 2500), speaker: profile.preferred_voice, pace: Number(profile.speech_pace), support_language: selectedLanguage }, controller.signal);
      if (alive.current && !controller.signal.aborted) setAudioSources(data.audios.map(a => `data:audio/mpeg;base64,${a}`));
    } catch (e) { if (alive.current && !controller.signal.aborted) setAudioNotice(e instanceof Error ? e.message : 'Playback is unavailable. Your transcript is saved.'); }
  }
  async function sendMessage(message: string, options: { requestId?: string; intent?: ChatIntent; session?: Session; language?: SupportLanguage } = {}) {
    const currentSession = options.session ?? sessionRef.current;
    if (!currentSession || busyRef.current) return;
    const intent = options.intent ?? 'message';
    const selectedLanguage = options.language ?? language;
    const requestId = options.requestId ?? crypto.randomUUID();
    busyRef.current = true; stopAudio(); setError(''); setPhase('thinking');
    setPending({ message, requestId, intent, language: selectedLanguage });
    requestAbort.current = new AbortController();
    try {
      const result = await api<ChatResult>('/api/chat', { sessionId: currentSession.id, message, mode, requestId, intent, support_language: selectedLanguage }, requestAbort.current.signal);
      if (!alive.current) return;
      const at = new Date().toISOString();
      setMessages(previous => {
        if (previous.some(m => m.id === result.messageId)) return previous;
        return [...previous, ...(message ? [{ id: result.userMessageId || `${requestId}-user`, session_id: currentSession.id, user_id: profile.id, role: 'user' as const, content: message, created_at: at, sequence: previous.length }] : []), { id: result.messageId || requestId, session_id: currentSession.id, user_id: profile.id, role: 'assistant' as const, content: result.reply, created_at: at, sequence: previous.length + 1 }];
      });
      setMistakes(previous => [...previous, ...result.corrections.map((c, i) => ({ id: `${requestId}-${i}`, session_id: currentSession.id, message_id: result.userMessageId || requestId, original_text: c.original, corrected_text: c.corrected, mistake_type: c.type, explanation: c.explanation, created_at: at }))]);
      setPending(null); if (message) setText(''); setDone(result.done);
      setPhase('voicing'); await speak(result.reply, selectedLanguage);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Your reply could not be sent. Please try again.'); }
    finally { busyRef.current = false; if (alive.current) setPhase('idle'); }
  }
  async function changeLanguage(value: SupportLanguage) {
    if (busyRef.current || value === language) return;
    busyRef.current = true; setPhase('saving'); stopAudio(); setError(''); setLanguageNotice('');
    requestAbort.current = new AbortController();
    try {
      await api('/api/settings', { support_language: value }, requestAbort.current.signal);
      if (!alive.current) return;
      setLanguage(value); setLanguageNotice('Language saved · भाषा बदल गई।'); setAudioSources([]);
      router.refresh();
      busyRef.current = false; setPhase('idle');
      if (sessionRef.current && !done && !ending) await sendMessage('', { intent: 'resume', language: value });
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Your language could not be saved.'); }
    finally { busyRef.current = false; if (alive.current) setPhase('idle'); }
  }
  async function begin() {
    if (busyRef.current) return;
    busyRef.current = true; setPhase('starting'); setError(''); requestAbort.current = new AbortController();
    try {
      const data = await api<{ session: Session; messages: Message[]; mistakes: Mistake[] }>('/api/session/start', { mode }, requestAbort.current.signal);
      if (!alive.current) return;
      setSession(data.session); sessionRef.current = data.session; setMessages(data.messages); setMistakes(data.mistakes);
      busyRef.current = false; setPhase('idle');
      await sendMessage('', { session: data.session, intent: data.messages.length ? 'resume' : 'message' });
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Your conversation could not start.'); }
    finally { busyRef.current = false; if (alive.current) setPhase('idle'); }
  }
  async function finish() {
    if (!session || busyRef.current || recorder.recording || recorder.transcribing) return;
    busyRef.current = true; setPhase('ending'); setError(''); stopAudio(); requestAbort.current = new AbortController();
    try { const result = await api<Ending>('/api/session/end', { sessionId: session.id, requestId: crypto.randomUUID() }, requestAbort.current.signal); if (alive.current) setEnding(result); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'We couldn’t save your session. Please try again.'); }
    finally { busyRef.current = false; if (alive.current) setPhase('idle'); }
  }
  function nextAudio() {
    if (audioIndex.current + 1 < audioSources.length && audio.current) {
      audioIndex.current++; audio.current.src = audioSources[audioIndex.current];
      void audio.current.play().catch(() => setAudioNotice('Tap play to continue.'));
    } else setSpeaking(false);
  }
  const stateLabel = recorder.recording ? t('I’m listening. Take your time.', 'मैं सुन रहा हूँ। आराम से बोलें।')
    : recorder.transcribing ? t('Finding your words…', 'आपकी बात समझ रहे हैं…')
    : phase === 'thinking' ? pending?.intent === 'finish' ? t('Building your roadmap…', 'आपका roadmap बन रहा है…') : t('Vashu is thinking…', 'Vashu सोच रहा है…')
    : phase === 'voicing' ? t('Getting your voice reply ready…', 'आवाज़ तैयार हो रही है…')
    : speaking ? t('Vashu is speaking', 'Vashu बोल रहा है')
    : phase === 'ending' ? t('Saving your progress…', 'आपकी progress save हो रही है…')
    : phase === 'starting' ? t('Opening your conversation…', 'आपकी बातचीत खोल रहे हैं…')
    : phase === 'saving' ? 'Saving language…' : t('One small sentence at a time.', 'छोटे वाक्यों से शुरुआत करें।');
  return <main id="main" className={`workspace voice-room ${onboarding ? 'onboarding-room' : ''}`}>
    <header className="workspace-heading"><div><span className="eyebrow">{onboarding ? 'YOUR FIRST CONVERSATION · पहली बातचीत' : `STAGE ${stage?.stage_number} · ${stage?.title}`}</span><h1>{onboarding ? t('Start in the language you know.', 'हिंदी से शुरू करें। English साथ सीखें।') : t('Let’s talk about it.', 'आज किस बारे में बात करें?')}</h1><p>{onboarding ? t('Hindi, Hinglish, or English. Speak or type. Vashu will help with the next step.', 'हिंदी, Hinglish या English — बोलें या लिखें। Vashu आपकी मदद करेगा।') : t('Try a little English. Ask for help whenever you need it.', 'थोड़ी English की कोशिश करें। जब चाहें मदद लें।')}</p></div>{!onboarding && session && !ending && <button className="button button-secondary" disabled={blocked} onClick={finish}>{phase === 'ending' ? <Loader2 className="spin" size={17}/> : <Check size={17}/>} {t('Finish session', 'Session पूरा करें')}</button>}</header>
    {ending ? <section className="session-finished"><div className="finished-icon"><Check size={35}/></div><span className="eyebrow">ONE CONVERSATION FORWARD</span><h2>{ending.counted ? t('A little more confident.', 'एक और कदम आगे।') : t('Every bit of practice helps.', 'हर छोटी कोशिश मायने रखती है।')}</h2><p>{ending.summary}</p>{ending.score != null && <div className="session-score"><strong>{ending.score}<small>/100</small></strong><span>Conversation clarity<br/>A coaching estimate, not a test score.</span></div>}{!ending.counted && <p className="helper-text">{t('Saved. Four of your own replies are needed to count a session toward your roadmap.', 'बातचीत save हो गई। Roadmap में progress के लिए आपके चार जवाब ज़रूरी हैं।')}</p>}{ending.stageAdvanced && <p className="success-banner"><Sparkles size={18}/>{t('Your next stage is unlocked.', 'आपका अगला stage खुल गया।')}</p>}<a href="/dashboard" className="button">{t('See my roadmap', 'मेरा roadmap देखें')}<ArrowUpRight size={19}/></a></section>
    : <>
      <div className="conversation-tools"><LanguagePicker value={language} onChange={value => void changeLanguage(value)} disabled={blocked}/><p role="status" className="language-notice">{languageNotice || t('Your language choice also applies to voice replies.', 'Vashu इसी भाषा में बोलकर समझाएगा।')}</p></div>
      {onboarding && <section className="onboarding-progress" aria-label="Roadmap progress"><div><span className="eyebrow">{done ? 'ROADMAP READY' : 'YOUR PERSONAL ROADMAP'}</span><strong>{done ? t('Your plan is ready.', 'आपका plan तैयार है।') : t(`${Math.min(userTurns, 4)} of 4 short replies`, `${Math.min(userTurns, 4)} / 4 छोटे जवाब`)}</strong><p>{t('Short answers count. Help buttons do not count as answers.', 'छोटे जवाब भी ठीक हैं। मदद के buttons जवाबों में नहीं गिने जाते।')}</p></div><div className="onboarding-progress-actions"><a className="text-link" href="/dashboard">{t('Explore roadmap', 'Roadmap देखें')}<ArrowUpRight size={16}/></a>{session && !done && <button className="button button-secondary" onClick={() => sendMessage('', { intent: 'finish' })} disabled={blocked || userTurns < 4}><Sparkles size={16}/>{t('Build my roadmap', 'मेरा roadmap बनाओ')}</button>}</div></section>}
      <div className="voice-grid"><section className="voice-main">
        <div className={`voice-stage ${recorder.recording ? 'listening' : ''} ${speaking ? 'speaking' : ''}`}><div className="partner-caption"><AudioLines size={17}/><span>VASHU</span><span className="live-dot"/></div><div className="room-orb"><Image src="/voice-orb.png" alt="Vashu’s luminous voice orb" width={640} height={640} priority style={{ scale: recorder.recording ? 1 + recorder.level * 0.12 : 1 }}/></div><div className="voice-state" role="status">{busy && <Loader2 className="spin" size={16}/>}<span>{stateLabel}</span></div><div className="voice-waves"><Waveform active={speaking || recorder.recording || phase === 'thinking'} small/></div>
          {!session ? <div className="begin-conversation"><button className="button button-large" disabled={busy} onClick={begin}>{busy ? t('Getting ready…', 'तैयार हो रहे हैं…') : t('Start / resume with Vashu', 'Vashu से बात करें')}<ArrowUpRight size={21}/></button><span><ShieldCheck size={14}/>{t('Your previous conversation resumes automatically.', 'पुरानी बातचीत हो तो वहीं से जारी रहेगी।')}</span></div>
          : done ? <div className="onboarding-done"><span><Check size={17}/>{t('Your personal roadmap is ready.', 'आपका personal roadmap तैयार है।')}</span><a href="/dashboard" className="button">{t('See my roadmap', 'मेरा roadmap देखें')}<ArrowUpRight size={19}/></a></div>
          : <div className="recorder-controls"><button className={`record-button ${recorder.recording ? 'recording' : ''}`} disabled={busy || !!pending || userTurns >= MAX_USER_TURNS} onClick={() => { if (recorder.recording) recorder.stop(); else { stopAudio(); void recorder.start(); } }} aria-label={recorder.recording ? 'Stop recording and send' : 'Start recording'}>{recorder.recording ? <Square size={26} fill="currentColor"/> : busy ? <Loader2 className="spin" size={27}/> : <Mic size={29}/>}</button><span>{recorder.recording ? `${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, '0')} / 1:30 · Tap to send` : userTurns >= MAX_USER_TURNS ? t('Finish this conversation to continue.', 'अब यह session पूरा करें।') : t('Tap to talk. Tap again to send.', 'बोलने के लिए दबाएँ। भेजने के लिए फिर दबाएँ।')}</span><button className="type-toggle" onClick={() => setTyping(!typing)} disabled={busy || recorder.recording}><Keyboard size={15}/>{typing ? t('Hide keyboard', 'Keyboard छिपाएँ') : t('Type instead', 'लिखकर जवाब दें')}</button></div>}
        </div>
        <div className="audio-player"><audio ref={audio} controls={!recorder.recording && !recorder.transcribing} hidden={!audioSources.length || recorder.recording} onPlay={() => { setSpeaking(true); setAudioNotice(''); }} onPause={() => setSpeaking(false)} onEnded={nextAudio} onError={() => setAudioNotice('Try replaying this message · दोबारा सुनकर देखें।')} aria-label="Vashu’s latest spoken reply"/>{speaking && <button className="type-toggle" onClick={stopAudio}><Square size={13}/>{t('Stop playback', 'आवाज़ रोकें')}</button>}{audioNotice && <p role="status">{audioNotice}</p>}</div>
        {(error || recorder.error) && <div className="error-banner" role="alert"><p>{error || recorder.error}</p>{pending && <button onClick={() => sendMessage(pending.message, pending)} disabled={busy}><RotateCcw size={14}/>{t('Try again', 'दोबारा कोशिश करें')}</button>}{recorder.canRetry && <button onClick={recorder.retry} disabled={busy}><RotateCcw size={14}/>Retry transcription</button>}</div>}
        {session && !done && <>
          <div className="help-actions" aria-label="Ask Vashu for help"><span>{t('Need a hand?', 'मदद चाहिए?')}</span><button disabled={blocked} onClick={() => sendMessage('', { intent: 'explain' })}>हिंदी में समझाओ</button><button disabled={blocked} onClick={() => sendMessage('', { intent: 'example' })}>{t('Give an example', 'एक example दो')}</button><button disabled={blocked} onClick={() => sendMessage('', { intent: 'simplify' })}>{t('Make it easier', 'थोड़ा आसान करो')}</button></div>
          {onboarding && userTurns === 0 && <div className="quick-replies"><span>{t('Or choose your goal:', 'या अपना लक्ष्य चुनें:')}</span>{[{ en: 'I want English for work.', hi: 'मुझे काम के लिए English सीखनी है।', label: 'काम · Work' }, { en: 'I want English for daily conversations.', hi: 'मुझे रोज़ की बातचीत के लिए English सीखनी है।', label: 'रोज़ की बातें · Daily life' }, { en: 'I want English for travel.', hi: 'मुझे travel के लिए English सीखनी है।', label: 'Travel' }].map(reply => <button key={reply.en} disabled={blocked} onClick={() => sendMessage(t(reply.en, reply.hi))}>{reply.label}<ArrowUpRight size={13}/></button>)}</div>}
          {typing && <form className="text-composer" onSubmit={e => { e.preventDefault(); if (text.trim()) void sendMessage(text.trim()); }}><label className="sr-only" htmlFor="reply">Your reply in Hindi, Hinglish, or English</label><textarea id="reply" value={text} onChange={e => setText(e.target.value)} placeholder={t('Type your answer. Hindi is welcome too…', 'हिंदी, Hinglish या English में अपना जवाब लिखें…')} maxLength={4000} rows={2} disabled={blocked}/><button type="submit" className="icon-button" disabled={!text.trim() || blocked || userTurns >= MAX_USER_TURNS} aria-label="Send reply"><Send size={20}/></button></form>}
          {!onboarding && <p className="session-counter">{Math.min(userTurns, MIN_SESSION_TURNS)} / {MIN_SESSION_TURNS} {t('replies to count toward your roadmap', 'जवाब · roadmap progress के लिए')}{userTurns >= MIN_SESSION_TURNS && <Check size={14}/>}</p>}
        </>}
        <div className="voice-tip"><Sparkles size={17}/><p>{onboarding ? t('Four short replies help us make a provisional plan. You can visit your roadmap or settings at any time.', 'चार छोटे जवाबों से एक शुरुआती personal plan बनेगा। Roadmap और Settings कभी भी खोल सकते हैं।') : t('Mistakes are welcome. Use Hindi to ask for help, then try one small sentence in English.', 'गलतियाँ होने दें। हिंदी में मदद माँगें, फिर एक छोटा English वाक्य आज़माएँ।')} <Link href="/settings">{t('Voice & pace settings', 'आवाज़ और रफ़्तार बदलें')}</Link></p></div>
      </section>
      <aside className="conversation-panel"><div className="conversation-heading"><div><span className="eyebrow">THE CONVERSATION</span><h2>{t('Your words, right here.', 'आपकी बातचीत, यहीं।')}</h2></div><span className="transcript-tag">Saved as you go</span></div><div className="transcript" ref={transcript} role="log" aria-live="polite" aria-label="Conversation transcript">{messages.length ? messages.map(m => <article className={`chat-message ${m.role}`} key={m.id}><div><span>{m.role === 'user' ? t('You', 'आप') : 'Vashu'}</span>{m.role === 'assistant' && <button onClick={() => speak(m.content)} disabled={blocked} aria-label="Replay Vashu’s message"><Volume2 size={14}/></button>}</div><p>{m.content}</p></article>) : <div className="transcript-empty"><span className="transcript-empty-icon"><AudioLines size={33}/></span><h3>{t('A comfortable place to begin.', 'बिना झिझक शुरुआत करें।')}</h3><p>{t('Start with Vashu. You can speak or type, and ask for an example at any time.', 'Vashu से बात शुरू करें। बोलें, लिखें या एक example माँगें।')}</p></div>}{pending?.message && <article className="chat-message user pending"><div><span>{t('You', 'आप')} · {error ? 'Not sent yet' : 'Sending…'}</span></div><p>{pending.message}</p></article>}</div>{mistakes.length > 0 && <details className="live-corrections" open><summary><span><Sparkles size={15}/>{t('A little nudge', 'छोटा सुधार')} · {mistakes.length}</span><ChevronDown size={16}/></summary><div>{mistakes.map(m => <CorrectionCard key={m.id} mistake={m}/>)}</div></details>}</aside></div>
    </>}
  </main>;
}

