'use client';
import type React from 'react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Mic, MicOff } from 'lucide-react';

/* Minimal typing for the Web Speech API (not in lib.dom for every TS version). */
type SR = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const ctor = () => (typeof window === 'undefined' ? null : ((window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition ?? null));

/**
 * Dictation into a text field with the browser's own speech recognition (no outside service from
 * this app). Renders nothing where the browser lacks it. `onText(final, interim)` gets the running transcript.
 */
export function MicButton({ onText, onDone, className = '', label = 'Dictate' }: { onText: (text: string) => void; onDone?: () => void; className?: string; label?: string }) {
  const ok = useSyncExternalStore(() => () => {}, () => !!ctor(), () => false);
  const [on, setOn] = useState(false);
  const rec = useRef<SR | null>(null);
  useEffect(() => () => rec.current?.abort(), []);
  if (!ok) return null;
  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    const C = ctor(); if (!C) return;
    const r = new C();
    r.lang = navigator.language || 'en-US'; r.interimResults = true; r.continuous = false;
    r.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; onText(t.trim()); };
    r.onend = () => { setOn(false); rec.current = null; onDone?.(); };
    r.onerror = () => { setOn(false); };
    rec.current = r; setOn(true);
    try { r.start(); } catch { setOn(false); }
  };
  return (
    <button type="button" className={`hd-mic ${on ? 'on' : ''} ${className}`} aria-pressed={on} aria-label={on ? 'Stop dictation' : label} title={on ? 'Stop dictation' : `${label} (voice)`}
      onMouseDown={(e) => e.preventDefault()} onClick={toggle}>
      {on ? <MicOff aria-hidden className="hd-i" /> : <Mic aria-hidden className="hd-i" />}
    </button>
  );
}

/** Joins dictated text onto whatever was typed before dictation started. */
export function useDictation(value: string, setValue: (v: string) => void) {
  const base = useRef<string | null>(null);
  return {
    onText: (t: string) => { if (base.current === null) base.current = value; setValue(base.current ? `${base.current.replace(/\s+$/, '')} ${t}` : t); },
    onDone: () => { base.current = null; },
  };
}

/** Mic button bound to a controlled field. Hidden where Web Speech is unsupported. */
export function Dictate({ value, onChange, label, className }: { value: string; onChange: (v: string) => void; label?: string; className?: string }) {
  const d = useDictation(value, onChange);
  return <MicButton onText={d.onText} onDone={d.onDone} label={label} className={className} />;
}

/** Wraps an input/textarea so the mic sits inside its right edge. */
export function MicField({ children, value, onChange, label }: { children: React.ReactNode; value: string; onChange: (v: string) => void; label?: string }) {
  return <span className="hd-micfield">{children}<Dictate value={value} onChange={onChange} label={label} /></span>;
}
