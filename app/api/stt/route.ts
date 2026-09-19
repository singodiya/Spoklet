import { NextResponse } from 'next/server';
import { ApiError, authenticate, failure, rateLimit } from '@/lib/api';
import { MAX_AUDIO_BYTES } from '@/lib/constants';
import { providerRequest } from '@/lib/ai/providers';
import { SUPPORT_LANGUAGES, supportLanguage } from '@/lib/language';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { user } = await authenticate(request);
    if (Number(request.headers.get('content-length')) > MAX_AUDIO_BYTES + 65536) throw new ApiError(413, 'Please record a shorter message.');
    const form = await request.formData();
    const file = form.get('file');
    const requestedLanguage = form.get('support_language');
    if (requestedLanguage !== null && !SUPPORT_LANGUAGES.some(value => value === requestedLanguage)) throw new ApiError(400, 'Choose Hindi, Hinglish, or English.');
    const language = supportLanguage(requestedLanguage ?? user.user_metadata?.support_language);
    if (!(file instanceof File) || !file.size) throw new ApiError(400, 'Please record something first.');
    if (file.size > MAX_AUDIO_BYTES) throw new ApiError(413, 'Please keep recordings under 4 MB.');
    const type = file.type.split(';')[0];
    const formats: Record<string, string> = { 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac' };
    if (!formats[type]) throw new ApiError(415, 'That recording format is not supported. Try Chrome, Edge, Firefox, or Safari.');
    await rateLimit(user.id, 'stt', 20);
    if (!process.env.GROQ_API_KEY) throw new ApiError(503, 'Voice transcription is not configured yet.');
    const body = new FormData();
    body.append('file', file, `recording.${formats[type]}`);
    body.append('model', 'whisper-large-v3-turbo'); body.append('response_format', 'json');
    if (language === 'english') body.append('language', 'en');
    const data = await providerRequest('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body });
    if (typeof data.text !== 'string' || !data.text.trim()) throw new ApiError(422, 'I couldn’t catch that. Try speaking a little closer to your microphone.');
    return NextResponse.json({ text: data.text.trim().slice(0, 4000) });
  } catch (error) { return failure(error); }
}
