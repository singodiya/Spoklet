import 'server-only';
import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { isConfigured, serverSupabase } from './supabase/server';
import { adminSupabase } from './supabase/admin';

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function authenticate(request: Request) {
  // Validate the user on every handler; middleware is not an authorization boundary.
  if (!isConfigured()) throw new ApiError(503, 'Spoklet is being set up. Please try again later.');
  const supabase = serverSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new ApiError(401, 'Please log in to continue.');
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && origin !== process.env.NEXT_PUBLIC_SITE_URL) throw new ApiError(403, 'This request came from an unexpected location.');
  return { supabase, user };
}
export async function jsonBody<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.output<T>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'Send a JSON request.');
  const text = await request.text();
  if (text.length > 18000) throw new ApiError(413, 'That message is too long. Try a shorter reply.');
  try { return schema.parse(JSON.parse(text)); } catch (error) { if (error instanceof ZodError) throw error; throw new ApiError(400, 'The request could not be read.'); }
}
export function failure(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: 'Please check the information and try again.', fields: error.issues.map(i => i.path.join('.')) }, { status: 400 });
  // Never return/log upstream payloads, credentials, or private transcripts.
  console.error('[Spoklet] Request failed:', error instanceof Error ? error.name : 'DatabaseError');
  return NextResponse.json({ error: 'Something interrupted the conversation. Please try again. Your saved progress is safe.' }, { status: 500 });
}
export async function rateLimit(userId: string, bucket: string, limit: number) {
  const { data, error } = await adminSupabase().rpc('consume_api_quota', { p_user_id: userId, p_bucket: bucket, p_limit: limit });
  if (error) throw new ApiError(503, 'Practice is temporarily unavailable. Please try again shortly.');
  if (!data) throw new ApiError(429, 'Let’s take a short breath. Please try again in a minute.');
}
export async function ownedSession(supabase: ReturnType<typeof serverSupabase>, userId: string, sessionId: string) {
  const { data, error } = await supabase.from('conversation_sessions').select('*').eq('id', sessionId).eq('user_id', userId).single();
  if (error || !data) throw new ApiError(404, 'This conversation could not be found.');
  return data;
}
export async function claimSession(userId: string, sessionId: string, requestId: string) {
  const { data, error } = await adminSupabase().rpc('claim_session', { p_user_id: userId, p_session_id: sessionId, p_request_id: requestId });
  if (error) throw new ApiError(error.message.includes('busy') ? 409 : 400, error.message.includes('busy') ? 'Vashu is still finishing the previous turn. Try again in a moment.' : 'This conversation is no longer available.');
  return data;
}
export async function releaseSession(sessionId: string, requestId: string) {
  await adminSupabase().from('conversation_sessions').update({ processing_token: null, processing_started_at: null }).eq('id', sessionId).eq('processing_token', requestId);
}
