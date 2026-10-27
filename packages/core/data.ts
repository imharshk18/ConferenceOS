import {officialEvent,officialTalks,officialSpeakers,officialRooms,officialProgramSource} from './officialProgram';
import {profileSources} from './profileSources';
export const CONFERENCE_ID='universe2026';
export const CONFERENCE_END=Date.parse('2026-10-30T07:00:00Z');
export const event=officialEvent;
export const programSource=officialProgramSource;
export const topics=[
 {id:'ai',name:'AI & agents',color:'#bdf46b'}, {id:'opensource',name:'Open source',color:'#c5b6ff'},
 {id:'platform',name:'Platform engineering',color:'#ffa98a'}, {id:'security',name:'Security',color:'#83cbe8'},
 {id:'graph',name:'Knowledge graphs',color:'#f9ce6b'}, {id:'devex',name:'Developer experience',color:'#f3a8d3'},
];
export const speakers=officialSpeakers;
export const rooms=officialRooms;
export const talks=officialTalks.map(t=>({...t,track:t.track||t.officialTopics[0]||t.format}));
export type Talk=typeof talks[number];
/** An absent presenter stays absent; this display label never becomes a Speaker node. */
export function speakerFor(talk:Talk){return speakers.find(s=>s.id===talk.speakerId)??{id:'',name:'No presenter listed',role:'Official program',company:'GitHub Universe',initials:'U26',color:'#d7eac9',bio:'',photoUrl:'',githubHandle:'',sourceUrl:talk.sourceUrl,modifiedAt:null,demo:false};}
const cityCenters:Record<string,[number,number]>={Madison:[43.07,-89.4],'San Francisco':[37.77,-122.42],London:[51.51,-.13],'New York':[40.71,-74.01]};
const palette=['#d9c6b9','#b4c5d5','#d5b0a4','#c5ccb2','#c1b3cb','#d1c9a5'];
/** These interests and conference relationships are synthetic, not scraped personal preferences. */
const syntheticTopics:Record<string,string[]>={harsh:['ai','security'],abhinav:['ai','devex'],aimen:['devex','ai'],gabby:['ai','platform'],sagar:['ai','opensource'],vida:['ai','devex']};
export const people=profileSources.map((p,i)=>({...p,initials:p.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase(),color:palette[i%palette.length],topicIds:syntheticTopics[p.id]??['ai'],latitude:cityCenters[p.city]?.[0]??0,longitude:cityCenters[p.city]?.[1]??0,locationPrecision:'city-center-demo' as const,preferencesSynthetic:true,demo:true}));
export type Person=typeof people[number];
export const pathCypher=`MATCH p=(a:Attendee)-[i:INTERESTED_IN]->(topic:Topic)<-[ab:ABOUT]-(talk:Talk)<-[pr:PRESENTS]-(speaker:Speaker) WHERE a.eventId='universe2026' AND talk.eventId='universe2026' AND i.eventId='universe2026' AND ab.eventId='universe2026' AND pr.eventId='universe2026' RETURN p LIMIT 5`;
