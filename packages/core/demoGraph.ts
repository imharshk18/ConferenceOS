import {talks,topics,speakers,rooms,people} from './data';
export const demoGraph={
 nodes:[...topics.map(t=>({id:t.id,kind:'Topic',label:t.name})),...talks.map(t=>({id:t.id,kind:'Talk',label:t.title})),...speakers.map(s=>({id:s.id,kind:'Speaker',label:s.name})),...rooms.map(r=>({id:r.id,kind:'Room',label:r.name})),...people.map(p=>({id:`demo:${p.id}`,kind:'Attendee',label:p.name}))],
 links:[...talks.flatMap(t=>[...t.speakerIds.filter(Boolean).map(id=>({source:id,target:t.id,kind:'PRESENTS'})),...(t.roomId?[{source:t.id,target:t.roomId,kind:'IN_ROOM'}]:[]),...t.topicIds.map(id=>({source:t.id,target:id,kind:'ABOUT'}))]),...people.flatMap(p=>p.topicIds.map(id=>({source:`demo:${p.id}`,target:id,kind:'INTERESTED_IN'}))),...(people.length>=2?[{source:`demo:${people[0].id}`,target:`demo:${people[1].id}`,kind:'MET'}]:[])]
};
