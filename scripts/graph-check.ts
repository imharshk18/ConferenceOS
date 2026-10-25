import 'dotenv/config';
import {writeFile} from 'node:fs/promises';
import {seedGraph,withGraph,graphSnapshot,pathCypher} from '../packages/core/graph';
import {talks,speakers,topics,rooms,people} from '../packages/core/data';
async function main() {
const results:{connection:boolean;data:boolean;path:boolean;nodes:number;edges:number;totalNodes:number;totalEdges:number;paths:string[];error?:string}={connection:false,data:false,path:false,nodes:0,edges:0,totalNodes:0,totalEdges:0,paths:[]};
try {
 await withGraph(async graph=>{const r=await graph.query<{ok:number}>('RETURN 1 AS ok');results.connection=r.data?.[0]?.ok===1;});
 await seedGraph();
 const snap=await graphSnapshot();results.nodes=snap.counts.nodes;results.edges=snap.counts.edges;
 results.data=results.nodes===talks.length+speakers.length+topics.length+rooms.length+people.length&&results.edges>=talks.length;
 await withGraph(async graph=>{
  const r=await graph.roQuery(pathCypher);results.path=(r.data?.length??0)>0;
  const readable=await graph.roQuery("MATCH (a:Attendee)-[interest:INTERESTED_IN]->(topic:Topic)<-[about:ABOUT]-(talk:Talk)<-[presents:PRESENTS]-(speaker:Speaker) WHERE a.eventId='universe2026' AND talk.eventId='universe2026' AND interest.eventId='universe2026' AND about.eventId='universe2026' AND presents.eventId='universe2026' RETURN a.name AS attendee,topic.name AS topic,talk.title AS talk,speaker.name AS speaker LIMIT 5");
  results.paths=(readable.data??[]).map((r:any)=>`${r.attendee} → INTERESTED_IN → ${r.topic} ← ABOUT ← ${r.talk} ← PRESENTS ← ${r.speaker}`);
  results.totalNodes=Number((await graph.roQuery<{count:number}>('MATCH (n) RETURN count(n) AS count')).data?.[0]?.count??0);
  results.totalEdges=Number((await graph.roQuery<{count:number}>('MATCH ()-[e]->() RETURN count(e) AS count')).data?.[0]?.count??0);
 });
} catch(error) {results.error=error instanceof Error?error.message.replace(/falkors?:\/\/[^\s]+/g,'[redacted connection]'):'Connection failed';}
await writeFile('verification.json',JSON.stringify({...results,checkedAt:new Date().toISOString(),graph:'conference',dataLabel:'Official Universe program; synthetic demo attendee interests and meetings',activeEventId:'universe2026'},null,2));
console.log(`${results.connection?'PASS':'FAIL'} Connection\n${results.data?'PASS':'FAIL'} Data: ${results.nodes} nodes, ${results.edges} edges\n${results.path?'PASS':'FAIL'} Multi-hop path`);
for(const path of results.paths) console.log(path);
if(results.error) console.error(results.error);
if(!results.connection||!results.data||!results.path)process.exitCode=1;
}
void main();
