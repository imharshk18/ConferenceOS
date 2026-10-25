import {topics,talks,speakers,rooms,people} from './data';

export type GraphProof={nodes:{id:string;kind:string;label:string}[];edges:{id:string;source:string;target:string;kind:string}[];traversalNodeIds:string[]};
export type SessionRecommendation={talkId:string;topicId:string;speakerId:string;proof:GraphProof;path:string[];pathNodeIds:string[];pathEdgeKinds:string[]};
export type PersonRecommendation={personId:string;topicId:string;proof:GraphProof;path:string[];pathNodeIds:string[];pathEdgeKinds:string[]};
export type RecommendationState={revision:number;status:'idle'|'loading'|'ready'|'error';source:'live'|'preview';talks:SessionRecommendation[];people:PersonRecommendation[];error:string|null;updatedAt:number|null};
export type PresentationStatus='waiting'|'paired'|'loading'|'live'|'error'|'expired'|'revoked';
export type DesktopPresentation={status:PresentationStatus;expiresAt:number;codeExpiresAt:number;revision:number|null;proof:GraphProof|null;updatedAt:number|null};
export const DEFAULT_TOPIC_IDS=['ai','security'];
export function validTopicIds(ids:string[]){return [...new Set(ids)].filter(id=>topics.some(t=>t.id===id)).slice(0,6);}
export const publicNodeMetadata=new Map<string,{id:string;kind:string;label:string}>([
 ...topics.map(t=>[t.id,{id:t.id,kind:'Topic',label:t.name}] as const),
 ...talks.map(t=>[t.id,{id:t.id,kind:'Talk',label:t.title}] as const),
 ...speakers.map(s=>[s.id,{id:s.id,kind:'Speaker',label:s.name}] as const),
 ...rooms.map(r=>[r.id,{id:r.id,kind:'Room',label:r.name}] as const),
]);
export const demoNodeMetadata=new Map(people.map(p=>[`demo:${p.id}`,{id:`demo:${p.id}`,kind:'Attendee',label:p.name}]));
/** Presentation nodes are selected from the bundled public program, never arbitrary graph labels. */
export function isPublicProof(proof:GraphProof){
 if(proof.nodes.length<2||proof.nodes.length>8||proof.edges.length!==proof.nodes.length-1||proof.traversalNodeIds.length!==proof.nodes.length)return false;
 const ids=new Set<string>();
 for(const n of proof.nodes){const expected=publicNodeMetadata.get(n.id);if(!expected||expected.kind!==n.kind||expected.label!==n.label||ids.has(n.id))return false;ids.add(n.id);}
 if(new Set(proof.traversalNodeIds).size!==ids.size||!proof.traversalNodeIds.every(id=>ids.has(id)))return false;
 for(const e of proof.edges){
  if(!e.id||!ids.has(e.source)||!ids.has(e.target))return false;
  const talk=talks.find(t=>t.id===(e.kind==='PRESENTS'?e.target:e.source));
  if(!talk)return false;
  if(e.kind==='ABOUT'){if(!talk.topicIds.includes(e.target))return false;}
  else if(e.kind==='PRESENTS'){if(!talk.speakerIds.includes(e.source))return false;}
  else if(e.kind==='IN_ROOM'){if(talk.roomId!==e.target)return false;}
  else return false;
 }
 return proof.traversalNodeIds.slice(1).every((id,i)=>proof.edges.some(e=>(e.source===id&&e.target===proof.traversalNodeIds[i])||(e.target===id&&e.source===proof.traversalNodeIds[i])));
}
export function legacyProof(proof:GraphProof){return {path:proof.traversalNodeIds.map(id=>proof.nodes.find(n=>n.id===id)?.label??''),pathNodeIds:proof.traversalNodeIds,pathEdgeKinds:proof.edges.map(e=>e.kind)};}
export function choosePresentationProof(recommendations:SessionRecommendation[],approvedTopicIds:string[],currentTopicIds:string[]):GraphProof|null{
 const match=recommendations.find(r=>approvedTopicIds.includes(r.topicId)&&currentTopicIds.includes(r.topicId)&&isPublicProof(r.proof)&&r.proof.nodes.some(n=>n.id===r.topicId&&n.kind==='Topic')&&r.proof.nodes.some(n=>n.id===r.talkId&&n.kind==='Talk')&&r.proof.nodes.every(n=>n.kind!=='Topic'||approvedTopicIds.includes(n.id)));
 return match?.proof??null;
}
export function canCommitRevision(currentRevision:number|undefined,jobRevision:number){return (currentRevision??0)===jobRevision;}
