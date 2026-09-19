'use client';
import { Languages } from 'lucide-react';
import { LANGUAGE_OPTIONS, type SupportLanguage } from '@/lib/language';
export default function LanguagePicker({ value, onChange, disabled = false }: { value: SupportLanguage; onChange: (value: SupportLanguage) => void; disabled?: boolean }) {
  return <fieldset className="language-picker" disabled={disabled}>
    <legend><Languages size={16}/> Vashu की भाषा · Support language</legend>
    <div>{LANGUAGE_OPTIONS.map(option => <label key={option.value} className={value === option.value ? 'selected' : ''}>
      <input type="radio" name="support-language" value={option.value} checked={value === option.value} onChange={() => onChange(option.value)}/>
      <strong>{option.label}</strong><small>{option.description}</small>
    </label>)}</div>
  </fieldset>;
}
