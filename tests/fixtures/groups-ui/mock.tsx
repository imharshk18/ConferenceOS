import {useSyncExternalStore} from 'react';
import {getFunctionName} from 'convex/server';
import {commonGround} from '../../../packages/core/groups';
import {talks} from '../../../packages/core/data';
const people=[{id:'me',name:'Maya',headline:'Building consumer tools',goal:'Meet creators and growth collaborators',professional:['ai','founders'],casual:['Running'],sessions:[],demo:false,color:'#b9dfce'},{id:'peer',name:'Alex · demo',headline:'Simulated growth specialist',goal:'Meet consumer founders',professional:['ai','growth'],casual:['Running'],sessions:[],demo:true,color:'#b9dfce'}];
let rev=0,joined=false,sharing=true,muted=false,messages:any[]=[],coverage:any[]=[],notes:any[]=[];const listeners=new Set<()=>void>();
const tick=()=>{rev++;listeners.forEach(l=>l());};
const subscribe=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
function useTick(){useSyncExternalStore(subscribe,()=>rev);}
export function useQuery(ref:any,args:any){useTick();if(args==='skip')return undefined;const name=getFunctionName(ref);
 if(name==='groups:mine')return {profile:{...people[0],sharing,shareSessions:false},enrolled:true,past:false,mine:joined?[{id:'group',name:'Consumer builders',conferenceName:'GitHub Universe 2026',count:2,past:false,muted}]:[],suggestions:joined?[]:[{id:'group',name:'Consumer builders',capacity:5,count:1,people:[people[1]],reasons:['You both shared AI & agents'],score:5}],conferenceId:'universe2026',conferenceName:'GitHub Universe 2026'};
 if(name==='groups:details')return {id:'group',name:'Consumer builders',conferenceName:'GitHub Universe 2026',capacity:5,count:2,muted,me:'me',people,ground:commonGround(people),coverage,savedNotes:[]};
 throw Error(name);
}
export function usePaginatedQuery(ref:any,args:any){useTick();return {results:[...(args.kind==='messages'?messages:notes)].reverse(),status:'Exhausted',loadMore(){}};}
export function useMutation(ref:any){return async(args:any)=>{const name=getFunctionName(ref);
 if(name==='groups:join'||name==='groups:create'){joined=true;tick();return 'group';}
 if(name==='groups:setSharing')sharing=args.enabled;
 if(name==='groups:mute')muted=args.muted;
 if(name==='groups:leave')joined=false;
 if(name==='groups:send')messages.push({id:args.requestId,body:args.body,authorId:'me',name:'Maya',createdAt:Date.now(),demo:false});
 if(name==='groups:cover')coverage=args.plan==='none'?[]:[{talkId:args.talkId,userId:'me',covering:args.plan==='cover',name:'Maya'}];
 if(name==='groups:shareNote')notes.push({id:args.requestId,body:args.body,talkId:args.talkId,authorId:'me',name:'Maya',createdAt:Date.now(),demo:false});
 tick();return null;
};}
