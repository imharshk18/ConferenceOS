type Node={id:string;kind:string;label:string};
type Edge={source:string;target:string;kind:string};
/** Topic → sessions → their speakers/rooms, only along actual public relationships. */
export function topicFocus(nodes:Node[],edges:Edge[],topicId:string){
 if(!nodes.some(n=>n.id===topicId&&n.kind==='Topic'))return {ids:[],edges:[] as Edge[]};
 const selected=edges.filter(e=>e.kind==='ABOUT'&&e.target===topicId);
 const talks=new Set(selected.map(e=>e.source));
 selected.push(...edges.filter(e=>(e.kind==='PRESENTS'&&talks.has(e.target))||(e.kind==='IN_ROOM'&&talks.has(e.source))));
 const valid=new Set(nodes.map(n=>n.id));
 const exact=selected.filter(e=>valid.has(e.source)&&valid.has(e.target));
 return {ids:[...new Set([topicId,...exact.flatMap(e=>[e.source,e.target])])],edges:exact};
}
