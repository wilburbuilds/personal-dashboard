import { z } from 'zod';
export const keys = ['weather','health','calendar','overnight','followups','headlines','automations','discord','home'] as const;
const link = z.string().url().refine(s => /^https?:\/\//.test(s));
export const itemSchema = z.object({title:z.string().max(300), detail:z.string().max(1200).optional(),label:z.string().max(100).optional(),time:z.string().max(100).optional(),url:link.optional()});
export const sourceSchema = z.object({status:z.enum(['ready','unconnected','error']), updatedAt:z.string().datetime().nullable(),note:z.string().max(1000),items:z.array(itemSchema).max(30),metrics:z.array(z.object({label:z.string().max(60),value:z.string().max(60),unit:z.string().max(30).optional()})).max(8).optional(),weather:z.object({condition:z.enum(['sun','cloud','rain','snow','storm']),high:z.number(),low:z.number(),unit:z.enum(['F','C']),location:z.string().max(100)}).optional()});
export const snapshotSchema = z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),sources:z.record(z.enum(keys),sourceSchema)});
export const preferencesSchema=z.object({city:z.string().max(150),topics:z.string().max(500),sourceNotes:z.string().max(2000),deviceLocation:z.boolean()});
export type Snapshot=z.infer<typeof snapshotSchema>;
export type Preferences=z.infer<typeof preferencesSchema>;
export const defaultPreferences:Preferences={city:'',topics:'',sourceNotes:'',deviceLocation:false};
const notes = ['Choose your weather location.','Connect your health app or wearable.','Choose your personal calendar.','Connect your personal notifications.','Connect messages to surface replies you may have missed.','Choose the topics you want to follow.','Choose the personal scheduled tasks to include.','Choose the servers and channels to follow.','Connect your Home Assistant instance.'];
export function emptySnapshot():Snapshot {return {date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles'}).format(new Date()),sources:Object.fromEntries(keys.map((key,i)=>[key,{status:'unconnected',updatedAt:null,note:notes[i],items:[]}]))};}
