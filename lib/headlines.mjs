import Parser from 'rss-parser';
export const feeds=[
 {topic:'Big picture',publisher:'BBC',url:'https://feeds.bbci.co.uk/news/world/rss.xml'},
 {topic:'Tech',publisher:'BBC',url:'https://feeds.bbci.co.uk/news/technology/rss.xml'},
 {topic:'AI',publisher:'TechCrunch',url:'https://techcrunch.com/category/artificial-intelligence/feed/'},
 {topic:'Markets',publisher:'CNBC',url:'https://www.cnbc.com/id/100003241/device/rss/rss.html'},
 {topic:'Politics',publisher:'NPR',url:'https://feeds.npr.org/1014/rss.xml'}
];
export function pickHeadlines(results,now=new Date()){
 const seen=new Set();const items=[];
 for(const {feed,articles} of results){
  const valid=articles.map(a=>({...a,stamp:Date.parse(a.isoDate||a.pubDate)})).filter(a=>a.title && /^https?:\/\//.test(a.link||'') && Number.isFinite(a.stamp) && a.stamp<=now.getTime()+300000 && now.getTime()-a.stamp<=36*3600000).sort((a,b)=>b.stamp-a.stamp);
  let count=0;
  for(const a of valid){const u=new URL(a.link);u.hash='';const key=u.origin+u.pathname;const title=a.title.toLowerCase().replace(/\W/g,'');if(seen.has(key)||seen.has(title))continue;seen.add(key);seen.add(title);
   const d=new Date(a.stamp);const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',hourCycle:'h23'}).format(d));
   const overnight=(hour>=22||hour<8)&&now.getTime()-a.stamp<=24*3600000;
   items.push({title:a.title.slice(0,300),url:a.link,label:`${feed.topic} · ${feed.publisher}`,detail:`${overnight?'Overnight · ':''}${new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d)} PT`});
   if(++count===2)break;
  }
 }
 return items;
}
export async function fetchHeadlines(){
 const parser=new Parser();
 const results=await Promise.allSettled(feeds.map(async feed=>{
  const response=await fetch(feed.url,{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'PersonalDashboard/0.1 (private RSS reader)'},cache:'no-store'});
  if(!response.ok)throw Error('Feed unavailable');
  const text=await response.text();if(text.length>2500000)throw Error('Feed too large');
  return {feed,articles:(await parser.parseString(text)).items};
 }));
 const successful=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
 const failed=results.flatMap((r,i)=>r.status==='rejected'?[feeds[i].publisher+' '+feeds[i].topic]:[]);
 return {status:failed.length?'error':'ready',updatedAt:successful.length?new Date().toISOString():null,items:pickHeadlines(successful),note:`Selected topic feeds · latest 36 hours · up to two per topic. Overnight = 10 PM–8 AM PT.${failed.length?' Unavailable: '+failed.join(', ')+'.':''}`};
}
