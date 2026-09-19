import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has('error')) return NextResponse.redirect(new URL('/login?notice=oauth', url.origin));
  const code = url.searchParams.get('code');
  if (code) {
    const { error } = await serverSupabase().auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/', url.origin));
  }
  return NextResponse.redirect(new URL('/login?notice=expired', url.origin));
}
