import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const pacificDay = (now = new Date()) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' }).format(now);

const SESSION_BY_WEEKDAY = {
  Mon: {
    id: 'C',
    title: 'Lower + core',
    heading: /^### (?:Mon[^:\n]*:\s*)?Day C\b/m,
    meta: 'Day C · knee-friendly · evening',
  },
  Tue: {
    id: 'A',
    title: 'Push + core',
    heading: /^### (?:Tue[^:\n]*:\s*)?Day A\b/m,
    meta: 'Day A · evening',
  },
  Thu: {
    id: 'B',
    title: 'Pull + core',
    heading: /^### (?:Thu[^:\n]*:\s*)?Day B\b/m,
    meta: 'Day B · evening',
  },
  Sat: {
    id: 'Sat',
    title: 'Squat/deadlift technique + conditioning',
    heading: /^### (?:Saturday\b|Sat\b)/m,
    meta: 'Saturday · morning',
  },
};

function sectionAfter(program, heading) {
  const match = program.match(heading);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = program.slice(start);
  const next = rest.search(/^### /m);
  return next === -1 ? rest : rest.slice(0, next);
}

function exercisesFromSection(section, sessionId) {
  if (sessionId === 'Sat') {
    const lines = section
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\d+\.\s+/.test(l))
      .map((l) => l.replace(/^\d+\.\s+/, '').replace(/\s+—.*$/, '').trim())
      .filter(Boolean)
      .slice(0, 6);
    return lines.map((title) => title.slice(0, 120));
  }
  const rows = [...section.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm)]
    .map((m) => ({ name: m[1].trim(), sets: m[2].trim() }))
    .filter((r) => r.name && !/^exercise$/i.test(r.name) && !/^---/.test(r.name));
  return rows.map((r) => {
    const short = r.name.split('—')[0].split('(')[0].trim();
    return short.slice(0, 120);
  });
}

export function workoutFromProgram(program = '', now = new Date()) {
  const weekday = pacificDay(now);
  const session = SESSION_BY_WEEKDAY[weekday];
  const updatedAt = new Date().toISOString();
  if (!program.trim()) {
    return {
      status: 'unconnected',
      updatedAt: null,
      weekday,
      title: null,
      meta: null,
      exercises: [],
      note: 'Saved gym program not found in your personal vault.',
    };
  }
  if (!session) {
    return {
      status: 'ready',
      updatedAt,
      weekday,
      title: 'Rest day',
      meta: `${weekday} · no programmed session`,
      exercises: [],
      note: 'From current-program.md · Gym agent owns training.',
    };
  }
  const section = sectionAfter(program, session.heading);
  const exercises = exercisesFromSection(section, session.id);
  if (!exercises.length) {
    return {
      status: 'error',
      updatedAt,
      weekday,
      title: session.title,
      meta: session.meta,
      exercises: [],
      note: 'Program found, but today’s session could not be parsed.',
    };
  }
  return {
    status: 'ready',
    updatedAt,
    weekday,
    title: session.title,
    meta: session.meta,
    exercises,
    note: 'From current-program.md · Gym agent owns training.',
  };
}

export async function readWorkoutSource(
  root = process.env.DASHBOARD_PERSONAL_VAULT || join(homedir(), 'vaults/personal'),
  now = new Date(),
) {
  try {
    const program = await readFile(join(root, 'fitness/current-program.md'), 'utf8');
    return workoutFromProgram(program, now);
  } catch {
    return {
      status: 'unconnected',
      updatedAt: null,
      weekday: pacificDay(now),
      title: null,
      meta: null,
      exercises: [],
      note: 'Saved gym program not found in your personal vault.',
    };
  }
}
