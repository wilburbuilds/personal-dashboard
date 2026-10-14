import type { Overview, ProjectBoard, TaskDetail, Move } from '@/lib/sources/vikunja-projects';
export declare function demoOverview(): Overview;
export declare function demoProjectBoard(id: number): ProjectBoard;
export declare function demoTaskDetail(id: number): TaskDetail;
export declare function demoMove(m: Move): { done: boolean };
