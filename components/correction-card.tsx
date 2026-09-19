import { ArrowRight, Check } from 'lucide-react';
import type { Mistake } from '@/lib/types';
export default function CorrectionCard({ mistake }: { mistake: Mistake }) { return <article className="correction-card"><span className="correction-type"><Check size={12}/>{mistake.mistake_type.replace('_', ' ')}</span><div><span className="original">{mistake.original_text}</span><ArrowRight size={15}/><strong>{mistake.corrected_text}</strong></div><p>{mistake.explanation}</p></article>; }
