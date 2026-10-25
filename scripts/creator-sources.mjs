// Bounded, resumable public demo import. At most six records, no follower/comment/contact collection.
import {config} from 'dotenv';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
config({quiet:true});
const inputs=[
 {id:'harsh-profile',dataset:'gd_l1viktl72bvl7bjuj0',url:'https://www.linkedin.com/in/harsh-kadodwala/',kind:'profile',limit:1},
 {id:'harsh-post',dataset:'gd_lyy3tktm25m4avu764',url:'https://www.linkedin.com/posts/harsh-kadodwala_over-the-last-week-i-was-selected-and-given-activity-7498558928197439488-NZZC',kind:'linkedin',limit:1},
 {id:'roger-creators',dataset:'gd_lyy3tktm25m4avu764',url:'https://www.linkedin.com/posts/roger-strandberg-562142208_update-thanks-so-much-for-everyone-who-commented-activity-7491154148910841856-KFDr',kind:'linkedin',limit:1},
 {id:'juan-creators',dataset:'gd_lyy3tktm25m4avu764',url:'https://www.linkedin.com/posts/juan-carlos-plate_bragi-is-looking-for-ugc-creators-bragi-activity-7447028299027050496-FFHH',kind:'linkedin',limit:1},
 {id:'shek-x',dataset:'gd_lwxkxvnf1cynvib9co',url:'https://x.com/shek_dev',kind:'x',limit:2,discovery:true},
];
await mkdir('work/creator-sources',{recursive:true});
const file='work/creator-sources/jobs.json';
let state;try{state=JSON.parse(await readFile(file,'utf8'));}catch{state={jobs:[]};}
const save=()=>writeFile(file,JSON.stringify(state,null,2));
async function request(path,body){const r=await fetch(`https://api.brightdata.com${path}`,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:`Bearer ${process.env.BRIGHTDATA_API_KEY}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error(`Bright Data HTTP ${r.status}`);return r.json();}
if(process.argv.includes('--start'))for(const i of inputs){if(state.jobs.some(j=>j.id===i.id))continue;const j={id:i.id,status:'intent'};state.jobs.push(j);await save();
 const q=new URLSearchParams({dataset_id:i.dataset,include_errors:'true',notify:'false',format:'json'});
 if(i.discovery){q.set('type','discover_new');q.set('discover_by','profile_url');}
 q.set('custom_output_fields',i.kind==='profile'?'url|name|position|about|avatar|current_company':i.kind==='x'?'url|description|date_posted|user_posted|is_repost':'url|use_url|user_url|user_id|user_name|post_text|date_posted|repost|user_image');
 try{const r=await request(`/datasets/v3/trigger?${q}`,{input:[{url:i.url,...(i.discovery?{num_of_posts:2,include_reposts:false,start_date:'2026-04-27',end_date:'2026-10-24'}:{})}],limit_per_input:i.limit});if(!/^sd_\w+$/.test(r.snapshot_id))throw new Error('Unconfirmed trigger');j.snapshotId=r.snapshot_id;j.status='running';}catch(e){j.status='uncertain';j.error=e.message;}await save();}
for(const j of state.jobs){if(!j.snapshotId||j.status==='ready')continue;const i=inputs.find(i=>i.id===j.id);const p=await request(`/datasets/v3/progress/${j.snapshotId}`);j.status=p.status;
 if(p.status==='ready'){const records=await request(`/datasets/v3/snapshot/${j.snapshotId}?format=json`);if(!Array.isArray(records)||records.length>i.limit)throw new Error('Record cap exceeded');await writeFile(`work/creator-sources/${j.id}.json`,JSON.stringify(records,null,2));j.records=records.length;j.valid=records.filter(r=>!r.error&&!r.error_code).length;}await save();}
console.log(JSON.stringify(state.jobs.map(({id,status,records,valid,error})=>({id,status,records,valid,error})),null,2));
