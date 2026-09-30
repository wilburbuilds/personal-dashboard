export type HomeRoom={room:string;temperatureC:number|null;humidityPercent:number|null;observedAt:string;stale:boolean;history:{time:string;value:number}[]};
export function homeRooms():HomeRoom[];
export function receiverToken():string;
export function receiverURL():string;
export function tokenMatches(header?:string):boolean;
export function ingest(payload:unknown):number;
export function dataDirectory():string;
