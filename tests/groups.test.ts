import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';
import { CONFERENCE_ID, talks } from '../packages/core/data';
import { commonGround, groupMatch, type GroupProfile } from '../packages/core/groups';
const modules=import.meta.glob('../convex/**/*.ts');
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T18:00:00Z'));});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});
const paging={numItems:2,cursor:null};
async function setup() {
  const t=convexTest(schema,modules);
  const ids=await t.run(async ctx=>{
    const ids=[];for(const name of ['Founder','Growth','Engineer','Stranger']) {
      const id=await ctx.db.insert('users',{name});ids.push(id);
      await ctx.db.insert('profiles',{userId:id,name,headline:`${name} headline`,goal:`${name} goal`,skillIds:['ai'],networkAreas:name==='Founder'?['founders']:name==='Growth'?['growth']:['product'],color:'#aabbcc',context:'NEVER SHARE PRIVATE CALL CONTEXT',source:'bland'});
    }return ids;
  });
  const [a,b,c,d]=ids.map((id,i)=>t.withIdentity({subject:`${id}|${i}`}));
  for(const client of [a,b,c])await client.mutation(api.groups.setSharing,{enabled:true,shareSessions:false,casualInterests:['Running']});
  const groupId=await a.mutation(api.groups.create,{conferenceId:CONFERENCE_ID,name:'Builders',capacity:3});
  return {t,ids,a,b,c,d,groupId};
}
describe('Conference Groups',()=>{
  it('reuses completed voice profiles and recommends with actual shared and complementary evidence',async()=>{
    const {b,groupId}=await setup();const state=(await b.query(api.groups.mine,{}))!;
    expect(state.profile?.name).toBe('Growth');expect(state.suggestions[0].id).toBe(groupId);
    expect(state.suggestions[0].reasons.some(r=>r.includes('AI & agents'))).toBe(true);
    expect(state.suggestions[0].reasons.some(r=>r.includes('complementary professional interests'))).toBe(true);
    expect(JSON.stringify(state.suggestions)).not.toContain('PRIVATE CALL');
    expect(JSON.stringify(state)).not.toContain('transcript');
  });
  it('requires conference participation and consent without creating connections or onboarding records',async()=>{
    const {t,b,d,groupId}=await setup();
    await expect(d.mutation(api.groups.join,{groupId})).rejects.toThrow('Enable profile sharing');
    expect((await d.query(api.groups.mine,{}))?.suggestions).toEqual([]);
    await b.mutation(api.groups.join,{groupId});await b.mutation(api.groups.join,{groupId});
    expect((await b.query(api.groups.details,{groupId})).count).toBe(2);
    expect(await t.run(ctx=>ctx.db.query('connections').collect())).toEqual([]);
    expect(await t.run(ctx=>ctx.db.query('onboardingCalls').collect())).toEqual([]);
  });
  it('prevents duplicate groups and oversubscription, and supports leave/rejoin',async()=>{
    const {t,a,b,c,d,groupId}=await setup();
    expect(await a.mutation(api.groups.create,{conferenceId:CONFERENCE_ID,name:' builders ',capacity:5})).toBe(groupId);
    await Promise.all([b.mutation(api.groups.join,{groupId}),c.mutation(api.groups.join,{groupId})]);
    await d.mutation(api.groups.setSharing,{enabled:true,shareSessions:false,casualInterests:[]});
    await expect(d.mutation(api.groups.join,{groupId})).rejects.toThrow('full');
    await b.mutation(api.groups.leave,{groupId});
    await expect(b.query(api.groups.details,{groupId})).rejects.toThrow('Join this group');
    await b.mutation(api.groups.join,{groupId});
    expect((await t.run(ctx=>ctx.db.query('groupMembers').collect())).length).toBe(3);
    await expect(a.mutation(api.groups.create,{conferenceId:'invented-event',name:'Other',capacity:5})).rejects.toThrow('available conference');
  });
  it('denies private content and all workspace writes to nonmembers and signed-out clients',async()=>{
    const {t,a,d,groupId,ids}=await setup();
    await a.mutation(api.groups.send,{groupId,body:'Private message',requestId:'private'});
    for(const client of [d,t]) {
      await expect(client.query(api.groups.details,{groupId})).rejects.toThrow();
      await expect(client.query(api.groups.history,{groupId,kind:'messages',paginationOpts:paging})).rejects.toThrow();
      await expect(client.mutation(api.groups.send,{groupId,body:'intrude',requestId:'x'})).rejects.toThrow();
      await expect(client.mutation(api.groups.cover,{groupId,talkId:talks[0].id,plan:'cover'})).rejects.toThrow();
      await expect(client.mutation(api.groups.shareNote,{groupId,talkId:talks[0].id,body:'intrude',requestId:'x'})).rejects.toThrow();
      await expect(client.mutation(api.groups.mute,{groupId,muted:true})).rejects.toThrow();
      await expect(client.mutation(api.groups.report,{groupId,reportedId:ids[0],reason:'intrude'})).rejects.toThrow();
      await expect(client.mutation(api.groups.block,{groupId,blockedId:ids[0]})).rejects.toThrow();
    }
  });
  it('Common Ground contains consented group and pair overlap, and withdraws profile data immediately',async()=>{
    const {a,b,c,groupId}=await setup();await b.mutation(api.groups.join,{groupId});await c.mutation(api.groups.join,{groupId});
    let detail=await a.query(api.groups.details,{groupId});
    expect(detail.ground.some(g=>g.category==='casual'&&g.label==='3 members share Running')).toBe(true);
    expect(detail.ground.some(g=>g.memberIds.length===2&&g.label.includes('complementary'))).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('PRIVATE CALL');
    await b.mutation(api.groups.setSharing,{enabled:false,shareSessions:false,casualInterests:['Private hobby']});
    detail=await a.query(api.groups.details,{groupId});
    expect(detail.people.some(p=>p.name==='Growth')).toBe(false);
    expect(JSON.stringify(detail)).not.toContain('Private hobby');
    expect(detail.ground.some(g=>g.label==='2 members share Running')).toBe(true);
    // Opting out of discovery does not remove membership or authored messages.
    await b.mutation(api.groups.send,{groupId,body:'Still a member',requestId:'withdrawn'});
  });
  it('shares saved session preferences only with explicit permission',async()=>{
    const {t,a,b,ids,groupId}=await setup();await b.mutation(api.groups.join,{groupId});
    await t.run(async ctx=>{for(const id of ids.slice(0,2))await ctx.db.insert('preferences',{userId:id,bookmarks:[talks[0].id],topicIds:['ai'],met:[]});});
    expect((await a.query(api.groups.details,{groupId})).ground.some(g=>g.label.includes(talks[0].title))).toBe(false);
    for(const client of [a,b])await client.mutation(api.groups.setSharing,{enabled:true,shareSessions:true,casualInterests:[]});
    expect((await a.query(api.groups.details,{groupId})).ground.some(g=>g.label.includes(talks[0].title))).toBe(true);
  });
  it('persists ordered paginated messages and deduplicates retried sends across client sessions',async()=>{
    const {t,a,b,ids,groupId}=await setup();await b.mutation(api.groups.join,{groupId});
    for(let i=0;i<5;i++) {vi.setSystemTime(Date.now()+1000);await a.mutation(api.groups.send,{groupId,body:`Message ${i}`,requestId:`m${i}`});}
    await a.mutation(api.groups.send,{groupId,body:'Message 4',requestId:'m4'});
    const reopened=t.withIdentity({subject:`${ids[1]}|new-session`});
    const first=await reopened.query(api.groups.history,{groupId,kind:'messages',paginationOpts:paging});
    expect(first.page.map(m=>m.body)).toEqual(['Message 4','Message 3']);expect(first.isDone).toBe(false);
    const second=await reopened.query(api.groups.history,{groupId,kind:'messages',paginationOpts:{...paging,cursor:first.continueCursor}});
    expect(second.page.map(m=>m.body)).toEqual(['Message 2','Message 1']);
    expect((await t.run(ctx=>ctx.db.query('groupMessages').collect())).length).toBe(5);
  });
  it('coordinates official sessions, shares only owned approved notes, and keeps copies independently',async()=>{
    const {t,ids,a,b,groupId}=await setup();await b.mutation(api.groups.join,{groupId});
    await a.mutation(api.groups.cover,{groupId,talkId:talks[0].id,plan:'attend'});
    await a.mutation(api.groups.cover,{groupId,talkId:talks[0].id,plan:'cover'});
    expect((await b.query(api.groups.details,{groupId})).coverage).toMatchObject([{covering:true}]);
    await expect(a.mutation(api.groups.cover,{groupId,talkId:'fake',plan:'cover'})).rejects.toThrow();
    const captureId=await t.run(ctx=>ctx.db.insert('captures',{userId:ids[0],kind:'session',title:talks[0].title,notes:'private raw notes',talkId:talks[0].id,revision:1,status:'approved',agentStage:'Reviewed',consentAt:Date.now(),files:[],transcript:'private transcript',draft:{summary:'Reviewed takeaway',topicIds:['ai'],takeaways:['A useful link: https://example.com'],actions:[]},error:null,attended:true,createdAt:Date.now(),updatedAt:Date.now(),attempts:0}));
    await expect(b.mutation(api.groups.shareNote,{groupId,talkId:talks[0].id,body:'try',requestId:'steal',captureId})).rejects.toThrow('reviewed session notes');
    for(let i=0;i<2;i++)await a.mutation(api.groups.shareNote,{groupId,talkId:talks[0].id,body:'Reviewed takeaway',requestId:'share',captureId});
    await t.run(ctx=>ctx.db.delete(captureId));
    const notes=await b.query(api.groups.history,{groupId,kind:'notes',paginationOpts:paging});
    expect(notes.page).toHaveLength(1);expect(notes.page[0].body).toContain('Reviewed takeaway');expect(JSON.stringify(notes)).not.toContain('private');
    await a.mutation(api.groups.cover,{groupId,talkId:talks[0].id,plan:'none'});
    expect((await b.query(api.groups.details,{groupId})).coverage).toEqual([]);
  });
  it('End Conference, Wrapped reads, calendar completion and demo actions preserve groups, notes and messages',async()=>{
    const {t,a,b,groupId}=await setup();await b.mutation(api.groups.join,{groupId});
    await a.mutation(api.groups.send,{groupId,body:'Before ending',requestId:'before'});
    await a.mutation(api.groups.shareNote,{groupId,talkId:talks[0].id,body:'Lasting note',requestId:'note'});
    await a.mutation(api.groups.completeConference,{conferenceId:CONFERENCE_ID});
    await a.mutation(api.groups.completeConference,{conferenceId:CONFERENCE_ID});
    expect((await a.query(api.groups.mine,{}))!.mine[0].past).toBe(true);
    // Same read models used by actual Conference Wrapped.
    await a.query(api.network.mine,{});await a.query(api.social.mine,{});await a.query(api.captures.mine,{});
    await a.mutation(api.demo.useHarsh,{});
    vi.setSystemTime(new Date('2027-04-10T12:00:00Z'));
    expect((await b.query(api.groups.mine,{}))!.mine[0].past).toBe(true);
    await b.mutation(api.groups.send,{groupId,body:'Months later',requestId:'after'});
    expect((await a.query(api.groups.history,{groupId,kind:'messages',paginationOpts:paging})).page.map(m=>m.body)).toEqual(['Months later','Before ending']);
    expect((await a.query(api.groups.history,{groupId,kind:'notes',paginationOpts:paging})).page[0].body).toBe('Lasting note');
    expect(await t.run(ctx=>ctx.db.query('groupMembers').collect())).toHaveLength(2);
  });
  it('saves mute and reports, hides blocked profile/content both ways and excludes future suggestions',async()=>{
    const {a,b,ids,t,groupId}=await setup();await b.mutation(api.groups.join,{groupId});
    await b.mutation(api.groups.send,{groupId,body:'Hide this',requestId:'hide'});
    await a.mutation(api.groups.mute,{groupId,muted:true});expect((await a.query(api.groups.mine,{}))!.mine[0].muted).toBe(true);
    await a.mutation(api.groups.report,{groupId,reportedId:ids[1],reason:'Concern'});
    expect(await t.run(ctx=>ctx.db.query('groupReports').collect())).toHaveLength(1);
    await a.mutation(api.groups.block,{groupId,blockedId:ids[1]});await a.mutation(api.groups.block,{groupId,blockedId:ids[1]});
    expect(await t.run(ctx=>ctx.db.query('groupBlocks').collect())).toHaveLength(1);
    expect((await a.query(api.groups.history,{groupId,kind:'messages',paginationOpts:paging})).page).toEqual([]);
    expect((await a.query(api.groups.details,{groupId})).people.some(p=>p.id===ids[1])).toBe(false);
    expect((await b.query(api.groups.details,{groupId})).people.some(p=>p.id===ids[0])).toBe(false);
    await b.mutation(api.groups.leave,{groupId});expect((await b.query(api.groups.mine,{}))!.suggestions).toEqual([]);
    await expect(b.mutation(api.groups.join,{groupId})).rejects.toThrow('unavailable');
  });
  it('does not invent hobby or professional explanations when data does not overlap',()=>{
    const person=(id:string,professional:string[],casual:string[]):GroupProfile=>({id,name:id,headline:'',goal:'',color:'#ffffff',demo:false,professional,casual,sessions:[]});
    const a=person('a',['security'],['Running']),b=person('b',['graph'],['Photography']);
    expect(commonGround([a,b])).toEqual([]);expect(groupMatch(a,[b]).score).toBe(0);
    expect(groupMatch(a,[person('c',['graph'],['Running'])]).score).toBe(0);
    expect(groupMatch(a,[person('d',['security'],[])]).score).toBe(5);
  });
});
