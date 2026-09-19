'use client';
import Link from 'next/link';
import { AudioLines, RotateCcw } from 'lucide-react';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main" className="full-page-state"><AudioLines size={42}/><span className="eyebrow">A SMALL INTERRUPTION</span><h1>Let’s try that again.</h1><p>We couldn’t load your learning space. Please try again in a moment.</p><div><button onClick={reset} className="button">Try again <RotateCcw size={17}/></button><Link href="/login" className="button button-secondary">Back to login</Link></div><p className="helper-text">Setting up Spoklet for the first time? Apply the database schema and check your environment configuration.</p></main>; }
