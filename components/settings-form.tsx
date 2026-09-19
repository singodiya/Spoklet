'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Play, Settings2, Volume2 } from 'lucide-react';
import LogoutButton from './logout-button';
import LanguagePicker from './language-picker';
import { VOICES } from '@/lib/constants';
import { api } from '@/lib/client-api';
import { supportLanguage } from '@/lib/language';
import type { Profile } from '@/lib/types';
export default function SettingsForm({ profile, email }: { profile: Profile; email: string }) {
  const router = useRouter();
  const [voice, setVoice] = useState(profile.preferred_voice);
  const [pace, setPace] = useState(Number(profile.speech_pace));
  const [name, setName] = useState(profile.full_name);
  const [language, setLanguage] = useState(supportLanguage(profile.support_language));
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [source, setSource] = useState('');
  const audio = useRef<HTMLAudioElement>(null);
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (source && audio.current) void audio.current.play().catch(() => setError('Tap the audio player to hear your voice preview.')); }, [source]);
  async function preview() {
    setPreviewing(true); setError(''); audio.current?.pause();
    controller.current?.abort(); controller.current = new AbortController();
    const text = language === 'english' ? 'Hi! I’m Vashu. Take your time. We will practise one small sentence together.'
      : language === 'hindi' ? 'नमस्ते! मैं वशु हूँ। आप आराम से हिंदी में बात कर सकते हैं। हम एक-एक छोटा अंग्रेज़ी वाक्य साथ में सीखेंगे।'
      : 'नमस्ते! मैं Vashu हूँ। आप हिंदी में बात कर सकते हैं। हम साथ में छोटे-छोटे English sentences की practice करेंगे।';
    try {
      const data = await api<{ audios: string[] }>('/api/tts', { text, speaker: voice, pace, support_language: language }, controller.current.signal);
      setSource(`data:audio/mpeg;base64,${data.audios[0]}`);
    } catch (e) { if (!controller.current.signal.aborted) setError(e instanceof Error ? e.message : 'Preview isn’t available right now.'); }
    finally { setPreviewing(false); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setSaved(false);
    try { await api('/api/settings', { full_name: name.trim(), preferred_voice: voice, speech_pace: pace, support_language: language }); setSaved(true); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Your preferences could not be saved.'); }
    finally { setBusy(false); }
  }
  return <main id="main" className="workspace settings-page">
    <header className="workspace-heading"><div><span className="eyebrow">SETTINGS · आपकी पसंद</span><h1>Make yourself at home.</h1><p>भाषा, आवाज़ और रफ़्तार — अपने हिसाब से चुनें।</p></div><Settings2 className="heading-icon" size={32}/></header>
    <form onSubmit={save} onChange={() => setSaved(false)}>
      <section className="settings-block"><div><span className="eyebrow">01 · YOUR LANGUAGE</span><h2>जिस भाषा में सहज हों।</h2><p>Vashu explains in your language and helps you practise small English sentences.</p></div><LanguagePicker value={language} onChange={setLanguage} disabled={busy}/></section>
      <section className="settings-block"><div><span className="eyebrow">02 · YOUR PARTNER</span><h2>A voice that feels right.</h2><p>Same Vashu. A sound you connect with.</p></div><fieldset className="voice-options" disabled={busy}><legend className="sr-only">Choose a voice</legend>{VOICES.map(v => <label key={v.id} className={voice === v.id ? 'voice-option selected' : 'voice-option'}><input type="radio" name="voice" value={v.id} checked={voice === v.id} onChange={() => setVoice(v.id)}/><span className="voice-option-icon"><Volume2 size={20}/></span><span><strong>{v.name}</strong><small>{v.description} · {v.gender}</small></span><span className="radio-indicator">{voice === v.id && <Check size={12}/>}</span></label>)}</fieldset></section>
      <section className="settings-block pace-block"><div><span className="eyebrow">03 · YOUR RHYTHM</span><h2>Let’s go at your pace.</h2><p>धीरे बोलें या थोड़ा तेज़ — सुनकर चुनें।</p></div><div><div className="pace-value"><label htmlFor="pace">Speaking pace</label><output htmlFor="pace">{pace.toFixed(2)}×</output></div><input id="pace" type="range" min="0.5" max="2" step="0.05" value={pace} disabled={busy} onChange={e => setPace(Number(e.target.value))}/><div className="range-labels"><span>Slow · धीरे · 0.5×</span><span>Fast · तेज़ · 2×</span></div><button type="button" className="button button-secondary" onClick={preview} disabled={previewing || busy}>{previewing ? <Loader2 size={17} className="spin"/> : <Play size={16}/>}सुनकर देखें · Preview</button><audio ref={audio} controls src={source || undefined} hidden={!source} aria-label="Voice and pace preview"/></div></section>
      <section className="settings-block"><div><span className="eyebrow">04 · ABOUT YOU</span><h2>Your corner of Spoklet.</h2></div><div className="profile-fields"><label htmlFor="full-name">Your name · आपका नाम<input id="full-name" value={name} disabled={busy} onChange={e => setName(e.target.value)} maxLength={100} required/></label><label htmlFor="account-email">Email<input id="account-email" value={email} readOnly/></label><p className="helper-text">Your goal and starting point come from your first conversation. Your support language can change at any time.</p></div></section>
      {error && <div role="alert" className="error-banner">{error}</div>}
      <div className="settings-save"><p role="status">{saved ? <><Check size={16}/> Preferences saved · आपकी पसंद save हो गई।</> : 'These preferences apply to your next reply.'}</p><button className="button" disabled={busy}>{busy ? <Loader2 className="spin" size={18}/> : <Check size={18}/>}Save preferences</button></div>
    </form><LogoutButton/>
  </main>;
}

