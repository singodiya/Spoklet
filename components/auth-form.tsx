'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Check, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { Logo } from './brand';
import { browserSupabase } from '@/lib/supabase/client';
import GoogleSignIn from './google-sign-in';

export default function AuthForm({ mode, notice }: { mode: 'signup' | 'login'; notice?: string }) {
  const signup = mode === 'signup';
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOAuthBusy] = useState(false);
  const [error, setError] = useState(notice === 'expired' ? 'That sign-in link has expired. Please try signing in again.' : notice === 'oauth' ? 'Google sign-in wasn’t completed. You can try again or use your email.' : notice === 'setup' ? 'Spoklet is still being set up. Please try again later.' : '');
  const [show, setShow] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || oauthBusy) return; setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim(); const password = String(form.get('password'));
    try {
      const supabase = browserSupabase();
      if (signup) {
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: String(form.get('name')).trim() }, emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback` } });
        if (authError) throw authError;
        if (!data.session) { setSent(true); return; }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
      router.replace('/'); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'We couldn’t sign you in. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="auth-page"><div className="auth-left"><Logo/><div className="auth-story"><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h1>A little courage.<br/>A conversation.<br/><span>A new you.</span></h1><Image src="/voice-orb.png" alt="A glowing green voice orb" width={680} height={680} priority/><p>You don’t need all the right words.<br/>Just a place to start finding them.</p></div><span className="auth-foot">A LITTLE MORE ENGLISH. A LOT MORE YOU.</span></div><main id="main" className="auth-main"><Link href="/" className="auth-back">← Back to Spoklet</Link><div className="auth-content">{sent ? <><span className="auth-mail"><Mail size={30}/></span><span className="eyebrow">ONE LAST THING</span><h2>Check your inbox.</h2><p>Follow the confirmation link we’ve sent to your email. Then, your first conversation is just a hello away.</p><Link href="/login" className="button">Go to login <ArrowUpRight size={20}/></Link></> : <><span className="eyebrow">{signup ? 'LET’S FIND YOUR VOICE' : 'GOOD TO HAVE YOU BACK'}</span><h2>{signup ? 'Your first hello.' : 'Ready for a little more?'}</h2><p>{signup ? 'Create your account. Vashu will take it from here.' : 'Your next conversation is waiting for you.'}</p>{!signup && <><GoogleSignIn disabled={busy} onBusy={setOAuthBusy} onError={setError}/><div className="auth-divider"><span/>or use your email<span/></div></>}<form onSubmit={submit}>{signup && <label htmlFor="name">What should we call you?<input id="name" name="name" autoComplete="given-name" placeholder="Your first name" required minLength={1} maxLength={100}/></label>}<label htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254}/></label><label htmlFor="password">Password<div className="password-field"><input id="password" name="password" type={show ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} placeholder={signup ? 'At least 8 characters' : 'Your password'} required minLength={signup ? 8 : 1} maxLength={128}/><button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>{error && <p className="error-banner" role="alert">{error}</p>}<button type="submit" disabled={busy || oauthBusy} className="button full-width">{busy ? <Loader2 className="spin" size={20}/> : signup ? 'Find my speaking voice' : 'Let’s keep going'}{!busy && <ArrowUpRight size={20}/>}</button></form><div className="auth-switch">{signup ? 'Already part of the conversation?' : 'New around here?'} <Link href={signup ? '/login' : '/signup'}>{signup ? 'Log in' : 'Join Spoklet'}</Link></div><div className="auth-reassurance"><Check size={15}/> Your pace. Your space. No judgment.</div></>}</div></main></div>;
}
