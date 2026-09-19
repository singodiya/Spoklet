import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, authenticate, failure, jsonBody, rateLimit } from '@/lib/api';
import { SPEAKERS } from '@/lib/constants';
import { providerRequest } from '@/lib/ai/providers';
import { SUPPORT_LANGUAGES, supportLanguage, speechLanguage } from '@/lib/language';
export const runtime = 'nodejs';
export const maxDuration = 60;
const input = z.object({ text: z.string().trim().min(1).max(2500), speaker: z.enum(SPEAKERS).default('shubh'), pace: z.number().min(0.5).max(2).default(1), support_language: z.enum(SUPPORT_LANGUAGES).optional() });
export async function POST(request: Request) {
  try {
    const { user } = await authenticate(request);
    const { text, speaker, pace, support_language } = await jsonBody(request, input);
    const language = supportLanguage(support_language ?? user.user_metadata?.support_language);
    await rateLimit(user.id, 'tts', 25);
    if (!process.env.SARVAM_API_KEY) throw new ApiError(503, 'Voice playback is not configured yet.');
    const data = await providerRequest('https://api.sarvam.ai/text-to-speech', {
      method: 'POST', headers: { 'api-subscription-key': process.env.SARVAM_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target_language_code: speechLanguage(language, text), speaker, model: 'bulbul:v3', pace, output_audio_codec: 'mp3' }),
    });
    if (!Array.isArray(data.audios) || !data.audios.length || data.audios.some((audio: unknown) => typeof audio !== 'string' || !audio)) throw new ApiError(502, 'Voice playback isn’t available right now. You can still read the reply.');
    return NextResponse.json({ audios: data.audios, mimeType: 'audio/mpeg' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
