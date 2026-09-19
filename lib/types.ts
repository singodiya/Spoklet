export type CEFR = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export type Mode = 'onboarding' | 'practice';
export type MistakeType = 'grammar' | 'vocabulary' | 'pronunciation' | 'fluency' | 'word_order';
export interface Profile {
  support_language?: import('./language').SupportLanguage;
  id: string; full_name: string; native_language: string | null; learning_goal: string | null;
  current_cefr_level: CEFR; current_stage_number: number; onboarding_complete: boolean;
  preferred_voice: string; speech_pace: number; streak_count: number; total_sessions: number;
  last_active_at: string | null;
}
export interface Stage {
  id: string; user_id: string; stage_number: number; title: string; cefr_level: CEFR;
  focus_skills: string[]; description: string; status: 'locked' | 'active' | 'completed'; sessions_required: number;
}
export interface Session {
  id: string; user_id: string; stage_id: string | null; mode: Mode; topic: string;
  summary: string | null; session_score: number | null; started_at: string; ended_at: string | null; counted: boolean;
}
export interface Message { id: string; session_id: string; user_id: string; role: 'user' | 'assistant'; content: string; created_at: string; sequence: number }
export interface Correction { original: string; corrected: string; type: MistakeType; explanation: string }
export interface Mistake { id: string; session_id: string; message_id: string; original_text: string; corrected_text: string; mistake_type: MistakeType; explanation: string; created_at: string }
export interface ChatResult { reply: string; corrections: Correction[]; done: boolean; messageId?: string; userMessageId?: string }
