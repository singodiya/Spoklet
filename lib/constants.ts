export const VOICES = [
  { id: 'shubh', name: 'Shubh', description: 'A relaxed conversation', gender: 'Male' },
  { id: 'aditya', name: 'Aditya', description: 'Clear and steady', gender: 'Male' },
  { id: 'rahul', name: 'Rahul', description: 'An everyday companion', gender: 'Male' },
  { id: 'priya', name: 'Priya', description: 'Easy and expressive', gender: 'Female' },
  { id: 'ritu', name: 'Ritu', description: 'A fresh perspective', gender: 'Female' },
  { id: 'simran', name: 'Simran', description: 'A friendly presence', gender: 'Female' },
] as const;
export const SPEAKERS = VOICES.map(v => v.id) as [string, ...string[]];
export const MIN_SESSION_TURNS = 4;
export const SESSIONS_PER_STAGE = 3;
export const MAX_USER_TURNS = 60;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // Below Vercel's 4.5 MB request ceiling, including multipart overhead.
export const MAX_RECORDING_SECONDS = 90;
export const CEFR_LABELS = { A1: 'Finding your words', A2: 'Building your basics', B1: 'Finding your flow', B2: 'Speaking with confidence', C1: 'Making yourself heard' };
