import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';
export async function GET(request: Request) {
  const url = new URL(request.url); const token_hash = url.searchParams.get('token_hash');
  if (token_hash) {
    const { error } = await serverSupabase().auth.verifyOtp({ token_hash, type: 'email' });
    if (!error) return NextResponse.redirect(new URL('/', url.origin));
  }
  return NextResponse.redirect(new URL('/login?notice=expired', url.origin));
}
