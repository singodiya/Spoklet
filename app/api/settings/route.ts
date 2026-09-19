import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, authenticate, failure, jsonBody } from '@/lib/api';
import { SPEAKERS } from '@/lib/constants';
import { SUPPORT_LANGUAGES } from '@/lib/language';
export async function POST(request: Request) {
  try {
    const { user, supabase } = await authenticate(request);
    const data = await jsonBody(request, z.object({ full_name: z.string().trim().min(1).max(100).optional(), preferred_voice: z.enum(SPEAKERS).optional(), speech_pace: z.number().min(0.5).max(2).optional(), support_language: z.enum(SUPPORT_LANGUAGES).optional() }).strict().refine(value => Object.keys(value).length > 0));
    const { support_language, ...profileFields } = data;
    if (Object.keys(profileFields).length) {
      const { error } = await supabase.from('profiles').update(profileFields).eq('id', user.id);
      if (error) throw new ApiError(503, 'Your preferences could not be saved. Please try again.');
    }
    if (support_language) {
      const { error } = await supabase.auth.updateUser({ data: { support_language } });
      if (error) throw new ApiError(503, 'Your language preference could not be saved. Please try again.');
    }
    return NextResponse.json({ saved: true });
  } catch (error) { return failure(error); }
}
