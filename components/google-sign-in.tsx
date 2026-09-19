'use client';
import Image from 'next/image';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { browserSupabase } from '@/lib/supabase/client';
export default function GoogleSignIn({ disabled, onBusy, onError }: { disabled: boolean; onBusy: (busy: boolean) => void; onError: (message: string) => void }) {
  const [loading, setLoading] = useState(false);
  async function signIn() {
    setLoading(true); onBusy(true); onError('');
    try {
      const { error } = await browserSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      // Supabase navigates to Google. The callback exchanges the PKCE code for an SSR cookie session.
    } catch {
      setLoading(false); onBusy(false); onError('Google sign-in couldn’t start. Please try again, or use your email.');
    }
  }
  return <button className="google-sign-in" type="button" disabled={disabled || loading} onClick={signIn}>{loading ? <Loader2 className="spin" size={19}/> : <Image src="/google.svg" width={20} height={20} alt="" aria-hidden="true"/>}<span>{loading ? 'Connecting to Google…' : 'Continue with Google'}</span></button>;
}
