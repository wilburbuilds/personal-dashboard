'use client';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

/* Minimal typing for the Web Speech API (not in lib.dom for every TS version). */
type SR = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const ctor = () => (typeof window === 'undefined' ? null : ((window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition ?? null));

const ERR: Record<string, string> = {
  'not-allowed': 'Microphone blocked. Allow it for this site in the browser settings.',
  'service-not-allowed': 'Voice typing is turned off. On Apple devices, turn on Dictation in Settings (Keyboard).',
  'no-speech': 'Didn\u2019t catch that. Try again.',
  'audio-capture': 'No microphone found.',
  network: 'Voice typing needs a connection to the browser\u2019s speech service.',
  unsupported: 'Voice typing isn\u2019t available in this browser. Use the keyboard\u2019s dictation key instead.',
};

/**
 * Dictation into a text field with the browser's own speech recognition (no outside service from
 * this app). Always rendered: detection differs across Safari/Chrome/iOS, so an unsupported
 * browser gets a clear message on tap instead of a missing button. `onText` gets the running transcript.
 */
export function MicButton({ onText, onDone, className = '', label = 'Dictate' }: { onText: (text: string) => void; onDone?: () => void; className?: string; label?: string }) {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rec = useRef<SR | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { rec.current?.abort(); if (timer.current) clearTimeout(timer.current); }, []);
  const say = (m: string) => { setMsg(m); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(null), 5000); };
  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    const C = ctor();
    if (!C) { say(ERR.unsupported); return; }
    let r: SR;
    try { r = new C(); } catch { say(ERR.unsupported); return; }
    r.lang = navigator.language || 'en-US'; r.interimResults = true; r.continuous = false;
    r.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; onText(t.trim()); };
    r.onend = () => { setOn(false); rec.current = null; onDone?.(); };
    r.onerror = (e) => { setOn(false); if (e.error !== 'aborted') say(ERR[e.error] ?? `Voice typing stopped (${e.error}).`); };
    rec.current = r; setOn(true); setMsg(null);
    try { r.start(); } catch { setOn(false); say(ERR.unsupported); }
  };
  return (
    <span className={`hd-micwrap ${className}`}>
      <button type="button" className={`hd-mic ${on ? 'on' : ''}`} aria-pressed={on} aria-label={on ? 'Stop dictation' : label} title={on ? 'Listening. Tap to stop' : `${label} (voice)`}
        onMouseDown={(e) => e.preventDefault()} onClick={toggle}>
        {on ? <MicOff aria-hidden className="hd-i" /> : <Mic aria-hidden className="hd-i" />}
      </button>
      {msg ? <span className="hd-mic-tip" role="status">{msg}</span> : null}
    </span>
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
