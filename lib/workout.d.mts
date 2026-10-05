export type WorkoutSource = {
  status: 'ready' | 'unconnected' | 'error';
  updatedAt: string | null;
  weekday: string;
  title: string | null;
  meta: string | null;
  exercises: string[];
  note: string;
};
export function workoutFromProgram(program?: string, now?: Date): WorkoutSource;
export function readWorkoutSource(root?: string, now?: Date): Promise<WorkoutSource>;
