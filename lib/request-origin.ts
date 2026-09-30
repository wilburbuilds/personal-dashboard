// The production server checks Host before routing. Allow the local UI and the
// explicitly configured private Tailscale origin; ignore forwarded host headers.
export function validOrigin(request:Request,allowMissing=false){
 const origin=request.headers.get('origin');
 if(!origin)return allowMissing;
 const local='http://'+request.headers.get('host');
 return origin===local || (!!process.env.DASHBOARD_ORIGIN&&origin===process.env.DASHBOARD_ORIGIN);
}
