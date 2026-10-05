import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutFromProgram } from '../lib/workout.mjs';

const fixture = `## Sessions

### Day A — Push + core

| Exercise | Sets × reps |
|---|---|
| Dumbbell bench press | 3 × 8–10 |
| Standing dumbbell overhead press | 3 × 8–10 |

### Day B — Pull + core

| Exercise | Sets × reps |
|---|---|
| One-arm dumbbell row (each side) | 3 × 10 |

### Day C — Lower body, knee-friendly + core

| Exercise | Sets × reps |
|---|---|
| Goblet box squat to bench — pain-free depth only | 3 × 8–10 |
| Dumbbell Romanian deadlift (hinge at hips, soft knees) | 3 × 10 |
| Glute bridge | 2 × 12 |

### Saturday — Squat/deadlift technique + conditioning

1. Warm-up 10 min (easy bike + dynamic moves).
2. Barbell box squat — 4 × 6, light.
3. Barbell deadlift — 3 × 5, light.
`;

test('Monday maps to Day C lower + core', () => {
  const s = workoutFromProgram(fixture, new Date('2026-10-05T18:00:00Z'));
  assert.equal(s.status, 'ready');
  assert.equal(s.title, 'Lower + core');
  assert.ok(s.exercises[0].includes('Goblet box squat'));
  assert.ok(s.exercises.some((e) => /Romanian deadlift/i.test(e)));
});

test('Wednesday is a rest day', () => {
  const s = workoutFromProgram(fixture, new Date('2026-10-07T18:00:00Z'));
  assert.equal(s.status, 'ready');
  assert.equal(s.title, 'Rest day');
  assert.deepEqual(s.exercises, []);
});

test('Saturday lists technique session', () => {
  const s = workoutFromProgram(fixture, new Date('2026-10-10T18:00:00Z'));
  assert.equal(s.title, 'Squat/deadlift technique + conditioning');
  assert.ok(s.exercises.some((e) => /Barbell box squat/i.test(e)));
});

test('empty program is unconnected', () => {
  const s = workoutFromProgram('', new Date('2026-10-05T18:00:00Z'));
  assert.equal(s.status, 'unconnected');
});
