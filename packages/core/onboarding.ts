import { validTopicIds } from './intelligence';
import { validNetworkAreas } from './network';

export const BLAND_PERSONA = 'ef4eb86a-7e0d-45b7-8079-74ea0841e62b';
export type OnboardingProfile = { name: string; headline: string; goal: string; context: string; skillIds: string[]; networkAreas: string[] };
export const ONBOARDING_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { name: {type:'string'}, headline: {type:'string'}, goal: {type:'string'}, context: {type:'string'},
    skillIds: {type:'array',items:{type:'string',enum:['ai','opensource','platform','security','graph','devex']}},
    networkAreas: {type:'array',items:{type:'string',enum:['ai','content','design','product','founders','growth','research','opensource','platform','security','graph','devex']}} },
  required: ['name','headline','goal','context','skillIds','networkAreas'],
};
export function cleanOnboarding(input: unknown): OnboardingProfile {
  const x = input as Record<string,unknown>;
  if (!x || typeof x !== 'object') throw new Error('Profile unavailable');
  const text = (key:string,max:number) => {
    if(typeof x[key] !== 'string' || (x[key] as string).length > max) throw new Error('Profile exceeds limits');
    return (x[key] as string).replace(/[\u0000-\u001f\u007f]/g,' ').trim();
  };
  if(!Array.isArray(x.skillIds) || !x.skillIds.every(s=>typeof s==='string') || !Array.isArray(x.networkAreas) || !x.networkAreas.every(s=>typeof s==='string')) throw new Error('Invalid interests');
  const skillIds = validTopicIds(x.skillIds);
  if(skillIds.length!==new Set(x.skillIds).size) throw new Error('Unknown interest');
  return {name:text('name',60),headline:text('headline',120),goal:text('goal',500),context:text('context',1600),skillIds,networkAreas:validNetworkAreas(x.networkAreas)};
}
export function phoneNumber(raw:string) {
  const value = raw.replace(/[\s().-]/g,'');
  if(!/^\+[1-9]\d{7,14}$/.test(value)) throw new Error('Use your number with its country code, such as +1…');
  return value;
}
/** Never accept callback metadata as an identity assertion. Compare provider-fetched data to our own intent. */
export function verifiedBlandCall(body:any, intent:{externalId:string;phone:string;callId?:string}) {
  return !!body && typeof body.call_id === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(body.call_id)
    && (!intent.callId || body.call_id === intent.callId) && body.external_id === intent.externalId
    && typeof body.to === 'string' && body.to.replace(/[\s().-]/g,'') === intent.phone;
}
