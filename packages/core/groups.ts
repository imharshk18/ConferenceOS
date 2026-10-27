import { NETWORK_AREAS } from './network';
import { topics, talks } from './data';

/** Only this allowlisted projection may enter group discovery or Common Ground. */
export type GroupProfile = {
  id: string; name: string; headline: string; goal: string; color: string; demo: boolean;
  professional: string[]; casual: string[]; sessions: string[];
};
export type Ground = { category: 'professional' | 'casual'; label: string; memberIds: string[] };
export const areaLabel = (id: string) => NETWORK_AREAS.find(a => a.id === id)?.label ?? topics.find(t => t.id === id)?.name ?? id;
const complementary = [['founders', 'growth'], ['content', 'product'], ['design', 'platform'], ['research', 'product']] as const;
export function commonGround(members: GroupProfile[]): Ground[] {
  const result: Ground[] = [];
  for (const category of ['professional', 'casual'] as const) {
    const values = new Map<string, {label:string; ids:string[]}>();
    for (const member of members) for (const value of new Set(category === 'professional' ? member.professional : member.casual)) {
      const key = value.toLocaleLowerCase();
      const entry = values.get(key) ?? {label:category === 'professional' ? areaLabel(value) : value, ids:[]};
      entry.ids.push(member.id); values.set(key, entry);
    }
    for (const {label, ids} of values.values()) if (ids.length > 1)
      result.push({category, label:`${ids.length} members share ${label}`, memberIds:ids});
  }
  for (const [a,b] of complementary) for (const left of members.filter(m => m.professional.includes(a))) {
    const right = members.find(m => m.id !== left.id && m.professional.includes(b));
    if (right) result.push({category:'professional', label:`${left.name} shared ${areaLabel(a)}; ${right.name} shared ${areaLabel(b)} — complementary professional interests`, memberIds:[left.id,right.id]});
  }
  const sessionIds = new Set(members.flatMap(m => m.sessions));
  for (const id of sessionIds) {
    const ids = members.filter(m => m.sessions.includes(id)).map(m => m.id);
    if (ids.length > 1) result.push({category:'professional',label:`${ids.length} members saved ${talks.find(t => t.id === id)?.title ?? 'the same session'}`,memberIds:ids});
  }
  const goals = new Set(members.map(m => m.goal.trim()).filter(Boolean));
  for (const goal of goals) {
    const ids = members.filter(m => m.goal.trim() === goal).map(m => m.id);
    if (ids.length > 1) result.push({category:'professional',label:`${ids.length} members share a goal: “${goal}”`,memberIds:ids});
  }
  return result;
}
export function groupMatch(me: GroupProfile, members: GroupProfile[]) {
  const evidence = commonGround([me,...members.filter(m => m.id !== me.id)]).filter(g => g.memberIds.includes(me.id));
  return { score:evidence.some(g => g.category === 'professional') ? evidence.reduce((n,g) => n + (g.category === 'professional' ? 5 : 1),0) : 0, reasons:evidence.map(g => g.label.replace(' members ', ' attendees ')) };
}
