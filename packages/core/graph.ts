import { FalkorDB } from 'falkordb';
import { talks, topics, speakers, rooms, people, pathCypher } from './data';
import {publicNodeMetadata,demoNodeMetadata,isPublicProof,legacyProof,validTopicIds,type GraphProof,type SessionRecommendation,type PersonRecommendation} from './intelligence';
export const EVENT_ID='universe2026';

export async function withGraph<T>(fn:(graph:ReturnType<FalkorDB['selectGraph']>)=>Promise<T>):Promise<T> {
  const url = process.env.FALKORDB_URL?.replace('falkors\\://','falkors://');
  if (!url) throw new Error('FALKORDB_URL is missing from server environment');
  let db:Awaited<ReturnType<typeof FalkorDB.connect>>|undefined;
  for(let attempt=0;attempt<3;attempt++) {
    try {db=await FalkorDB.connect({url,socket:{connectTimeout:10000,reconnectStrategy:false}});break;}
    catch(error) {
      const message=error instanceof Error?error.message:String(error);
      if(attempt===2||!/(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket|timed out|connection.*closed)/i.test(message))throw error;
      await new Promise(resolve=>setTimeout(resolve,250*2**attempt));
    }
  }
  if(!db)throw new Error('Graph connection unavailable');
  db.on('error',()=>{}); // Commands reject normally; avoid an uncaught EventEmitter error during socket loss.
  try { return await fn(db.selectGraph('conference')); } finally { await db.close(); }
}
export async function seedGraph() {
 return withGraph(async graph=>{
  const common={eventId:EVENT_ID};
  await graph.query('UNWIND $rows AS row MERGE (n:Topic {id:row.id}) SET n.name=row.name,n.eventId=$eventId,n.demo=false',{params:{...common,rows:topics.map(t=>({id:t.id,name:t.name}))}});
  await graph.query('UNWIND $rows AS row MERGE (n:Speaker {id:row.id}) SET n.name=row.name,n.eventId=$eventId,n.demo=false',{params:{...common,rows:speakers.map(s=>({id:s.id,name:s.name}))}});
  await graph.query('UNWIND $rows AS row MERGE (n:Room {id:row.id}) SET n.name=row.name,n.eventId=$eventId,n.demo=false',{params:{...common,rows:rooms.map(r=>({id:r.id,name:r.name}))}});
  await graph.query('UNWIND $rows AS row MERGE (t:Talk {id:row.id}) SET t.title=row.title,t.day=row.day,t.time=row.time,t.eventId=$eventId,t.demo=false',{params:{...common,rows:talks.map(t=>({id:t.id,title:t.title,day:t.day,time:t.time}))}});
  const speakerLinks=talks.flatMap(t=>(((t as unknown as {speakerIds?:string[]}).speakerIds)??[t.speakerId]).filter(Boolean).map(speakerId=>({talkId:t.id,speakerId})));
  await graph.query('UNWIND $rows AS row MATCH (s:Speaker {id:row.speakerId}),(t:Talk {id:row.talkId}) MERGE (s)-[e:PRESENTS]->(t) SET e.eventId=$eventId',{params:{...common,rows:speakerLinks}});
  await graph.query('UNWIND $rows AS row MATCH (t:Talk {id:row.talkId}),(r:Room {id:row.roomId}) MERGE (t)-[e:IN_ROOM]->(r) SET e.eventId=$eventId',{params:{...common,rows:talks.filter(t=>t.roomId).map(t=>({talkId:t.id,roomId:t.roomId}))}});
  await graph.query('UNWIND $rows AS row MATCH (t:Talk {id:row.talkId}),(topic:Topic {id:row.topicId}) MERGE (t)-[e:ABOUT]->(topic) SET e.eventId=$eventId',{params:{...common,rows:talks.flatMap(t=>t.topicIds.map(topicId=>({talkId:t.id,topicId})))}});
  await graph.query('UNWIND $rows AS row MERGE (a:Attendee {id:row.id}) SET a.name=row.name,a.demo=true,a.eventId=$eventId',{params:{...common,rows:people.map(p=>({id:`demo:${p.id}`,name:p.name}))}});
  await graph.query('UNWIND $rows AS row MATCH (a:Attendee {id:row.personId}),(t:Topic {id:row.topicId}) MERGE (a)-[e:INTERESTED_IN]->(t) SET e.eventId=$eventId',{params:{...common,rows:people.flatMap(p=>p.topicIds.map(topicId=>({personId:`demo:${p.id}`,topicId})))}});
  if(people.length>=2)await graph.query('MATCH (a:Attendee {id:$a}),(b:Attendee {id:$b}) MERGE (a)-[e:MET]->(b) SET e.eventId=$eventId',{params:{...common,a:`demo:${people[0].id}`,b:`demo:${people[1].id}`}});
  return true;
 });
}
export async function graphSnapshot() {
 return withGraph(async graph=>{
  const params={eventId:EVENT_ID};
  const nodeResult=await graph.roQuery<{id:string;kind:string}>('MATCH (n) WHERE n.eventId=$eventId AND (n:Topic OR n:Talk OR n:Speaker OR n:Room) RETURN n.id AS id, labels(n)[0] AS kind LIMIT 600',{params});
  const edgeResult=await graph.roQuery<{source:string;target:string;kind:string}>('MATCH (a)-[e]->(b) WHERE a.eventId=$eventId AND b.eventId=$eventId AND e.eventId=$eventId AND type(e) IN ["ABOUT","PRESENTS","IN_ROOM"] RETURN a.id AS source,b.id AS target,type(e) AS kind LIMIT 1200',{params});
  const nodes=(nodeResult.data??[]).flatMap(n=>{const official=publicNodeMetadata.get(n.id);return official?.kind===n.kind?[official]:[];});
  const ids=new Set(nodes.map(n=>n.id));
  const links=(edgeResult.data??[]).filter(e=>ids.has(e.source)&&ids.has(e.target)&&isPublicProof({nodes:[publicNodeMetadata.get(e.source)!,publicNodeMetadata.get(e.target)!],edges:[{id:`${e.source}:${e.kind}:${e.target}`,...e}],traversalNodeIds:[e.source,e.target]}));
  return {nodes,links,counts:{nodes:nodes.length,edges:links.length}};
 });
}
export async function recommendGraph(topicIds:string[]) {
 const valid=validTopicIds(topicIds);
 if(!valid.length)return {talks:[] as SessionRecommendation[],people:[] as PersonRecommendation[],source:'live' as const};
 return withGraph(async graph=>{
  const params={topicIds:valid,eventId:EVENT_ID};
  const result=await graph.roQuery('MATCH p=(topic:Topic)<-[about:ABOUT]-(talk:Talk)<-[presents:PRESENTS]-(speaker:Speaker) WHERE topic.id IN $topicIds AND talk.eventId=$eventId AND topic.eventId=$eventId AND speaker.eventId=$eventId AND about.eventId=$eventId AND presents.eventId=$eventId RETURN p,talk.id AS talkId,topic.id AS topicId,speaker.id AS speakerId,topic.name AS topic,talk.title AS title,speaker.name AS speaker ORDER BY talk.day,talk.time LIMIT 60',{params});
  const personResult=await graph.roQuery('MATCH p=(a:Attendee)-[interest:INTERESTED_IN]->(t:Topic) WHERE t.id IN $topicIds AND a.demo=true AND a.eventId=$eventId AND t.eventId=$eventId AND interest.eventId=$eventId RETURN p,a.id AS personId,t.id AS topicId,a.name AS name,t.name AS topic LIMIT 60',{params});
  const sessionRows:SessionRecommendation[]=[];
  for(const r of result.data??[] as any[]){const proof=proofFromFalkorPath(r.p);if(proof&&isPublicProof(proof)&&valid.includes(r.topicId)&&talks.some(t=>t.id===r.talkId&&t.topicIds.includes(r.topicId)&&t.speakerIds.includes(r.speakerId)))sessionRows.push({talkId:r.talkId,topicId:r.topicId,speakerId:r.speakerId,proof,...legacyProof(proof)});}
  const personRows:PersonRecommendation[]=[];
  for(const r of personResult.data??[] as any[]){const proof=proofFromFalkorPath(r.p,true);const personId=String(r.personId).replace(/^demo:/,'');if(proof&&proof.nodes.length===2&&proof.edges.length===1&&proof.edges[0].kind==='INTERESTED_IN'&&proof.edges[0].source===`demo:${personId}`&&proof.edges[0].target===r.topicId&&valid.includes(r.topicId)&&people.some(p=>p.id===personId&&p.topicIds.includes(r.topicId)))personRows.push({personId,topicId:r.topicId,proof,...legacyProof(proof)});}
  return {talks:sessionRows,people:personRows,source:'live' as const};
 });
}
/** Retain path traversal order while resolving stored relationship direction by graph internal IDs. */
export function proofFromFalkorPath(path:any,allowDemo=false):GraphProof|null{
 if(!path||!Array.isArray(path.nodes)||!Array.isArray(path.edges)||path.nodes.length>8)return null;
 const ids=new Map<string,string>();const nodes:GraphProof['nodes']=[];
 for(const n of path.nodes){const id=String(n.properties?.id??'');const metadata=publicNodeMetadata.get(id)??(allowDemo?demoNodeMetadata.get(id):undefined);if(!metadata||!Array.isArray(n.labels)||!n.labels.includes(metadata.kind))return null;ids.set(String(n.id),id);nodes.push(metadata);}
 const edges:GraphProof['edges']=[];
 for(const e of path.edges){const source=ids.get(String(e.sourceId??e.sourceNode?.id??e.sourceNode));const target=ids.get(String(e.destinationId??e.destinationNode?.id??e.destinationNode));if(!source||!target||e.id===undefined||typeof e.relationshipType!=='string')return null;edges.push({id:`falkor:${e.id}`,source,target,kind:e.relationshipType});}
 if(edges.length!==nodes.length-1)return null;
 const traversalNodeIds=nodes.map(n=>n.id);
 if(!traversalNodeIds.slice(1).every((id,i)=>edges.some(e=>(e.source===id&&e.target===traversalNodeIds[i])||(e.target===id&&e.source===traversalNodeIds[i]))))return null;
 return {nodes,edges,traversalNodeIds};
}
export {pathCypher};
