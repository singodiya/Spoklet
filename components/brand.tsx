import Link from 'next/link';
export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="logo" aria-label="Spoklet home"><span className="logo-mark" aria-hidden="true"><i/><i/><i/><i/></span>{!compact && <span>spoklet<span className="logo-period">.</span></span>}</Link>;
}
export function Waveform({ active = true, small = false }: { active?: boolean; small?: boolean }) {
  return <div className={`waveform ${active ? 'active' : ''} ${small ? 'small' : ''}`} aria-hidden="true">{Array.from({ length: small ? 15 : 37 }, (_, i) => <i key={i} style={{ '--bar': `${14 + (Math.sin(i * 1.7) + 1) * 24}px`, '--delay': `${i * -0.12}s` } as React.CSSProperties}/>)}</div>;
}
