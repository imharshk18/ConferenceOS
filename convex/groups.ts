import { getAuthUserId } from '@convex-dev/auth/server';
import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query, type QueryCtx, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { CONFERENCE_ID, CONFERENCE_END, event, talks } from '../packages/core/data';
import { commonGround, groupMatch, type GroupProfile } from '../packages/core/groups';
import { profileFor } from './socialState';
type Ctx = QueryCtx | MutationCtx;
async function user(ctx: Ctx) {
  const id = await getAuthUserId(ctx);
  if (!id) throw new Error('Sign in first');
  return id;
}
function text(value: string, max: number) {
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g,' ');
  if (!cleaned || cleaned.length > max) throw new Error(`Use 1–${max} characters`);
  return cleaned;
}
function conference(id: string) {
  if (id !== CONFERENCE_ID) throw new Error('Choose an available conference');
}
async function participation(ctx: Ctx, id: Id<'users'>) {
  return ctx.db.query('conferenceParticipation').withIndex('by_user_conference',q=>q.eq('userId',id).eq('conferenceId',CONFERENCE_ID)).unique();
}
async function member(ctx: Ctx, groupId: Id<'conferenceGroups'>, id: Id<'users'>) {
  return ctx.db.query('groupMembers').withIndex('by_group_user',q=>q.eq('groupId',groupId).eq('userId',id)).unique();
}
async function permitted(ctx: Ctx, groupId: Id<'conferenceGroups'>, id: Id<'users'>) {
  const group = await ctx.db.get(groupId), membership = await member(ctx,groupId,id);
  if (!group || !membership?.active) throw new Error('Join this group to open its private workspace');
  return {group,membership};
}
async function blocked(ctx: Ctx, id: Id<'users'>) {
  const [outgoing,incoming] = await Promise.all([
    ctx.db.query('groupBlocks').withIndex('by_user',q=>q.eq('userId',id)).collect(),
    ctx.db.query('groupBlocks').withIndex('by_blocked',q=>q.eq('blockedId',id)).collect(),
  ]);
  return new Set([...outgoing.map(b=>b.blockedId),...incoming.map(b=>b.userId)]);
}
async function sharedProfile(ctx: Ctx, id: Id<'users'>): Promise<GroupProfile | null> {
  const profile = await profileFor(ctx,id);
  if (!profile?.groupSharing) return null;
  const prefs = profile.shareGroupSessions ? await ctx.db.query('preferences').withIndex('by_userId',q=>q.eq('userId',id)).unique() : null;
  return {id,name:profile.name,headline:profile.headline,goal:profile.goal,color:profile.color,demo:profile.source==='demo',
    professional:[...new Set([...profile.skillIds,...profile.networkAreas??[]])],casual:profile.casualInterests??[],sessions:prefs?.bookmarks??[]};
}
async function groupPeople(ctx: Ctx, groupId: Id<'conferenceGroups'>) {
  return (await ctx.db.query('groupMembers').withIndex('by_group',q=>q.eq('groupId',groupId)).collect()).filter(m=>m.active);
}
async function profiles(ctx: Ctx, ids: Id<'users'>[], hidden: Set<Id<'users'>>) {
  const result: GroupProfile[] = [];
  for (const id of ids) if (!hidden.has(id)) { const p = await sharedProfile(ctx,id); if(p)result.push(p); }
  return result;
}
export const mine = query({args:{},handler:async ctx=>{
  const id = await getAuthUserId(ctx); if(!id)return null;
  const p = await profileFor(ctx,id), enrolled = await participation(ctx,id), hidden = await blocked(ctx,id);
  const myMemberships = await ctx.db.query('groupMembers').withIndex('by_user',q=>q.eq('userId',id)).collect();
  const mine = [];
  for (const m of myMemberships.filter(m=>m.active)) {
    const g = await ctx.db.get(m.groupId);
    if(g)mine.push({id:g._id,name:g.name,conferenceName:event.name,conferenceId:g.conferenceId,muted:m.muted,
      past:enrolled?.completed===true || Date.now()>=CONFERENCE_END,count:(await groupPeople(ctx,g._id)).length});
  }
  const me = await sharedProfile(ctx,id), suggestions = [];
  if(me && enrolled && !enrolled.completed && Date.now()<CONFERENCE_END) {
    for(const g of await ctx.db.query('conferenceGroups').withIndex('by_conference',q=>q.eq('conferenceId',CONFERENCE_ID)).take(200)) {
      if(myMemberships.some(m=>m.groupId===g._id&&m.active))continue;
      const members=await groupPeople(ctx,g._id);
      if(!members.length || members.length>=g.capacity || members.some(m=>hidden.has(m.userId)))continue;
      const people=await profiles(ctx,members.map(m=>m.userId),hidden),match=groupMatch(me,people);
      if(match.score>0)suggestions.push({id:g._id,name:g.name,capacity:g.capacity,count:members.length,people,...match});
    }
  }
  return {profile:p?{name:p.name,headline:p.headline,goal:p.goal,professional:[...new Set([...p.skillIds,...p.networkAreas??[]])],casual:p.casualInterests??[],sharing:p.groupSharing??false,shareSessions:p.shareGroupSessions??false}:null,
    enrolled:!!enrolled,past:enrolled?.completed===true||Date.now()>=CONFERENCE_END,mine,suggestions:suggestions.sort((a,b)=>b.score-a.score).slice(0,12),conferenceId:CONFERENCE_ID,conferenceName:event.name};
}});
/** Consent shares only the previewed profile projection; context and call drafts never leave the owner. */
export const setSharing = mutation({args:{enabled:v.boolean(),shareSessions:v.boolean(),casualInterests:v.array(v.string())},handler:async(ctx,args)=>{
  const id=await user(ctx),p=await profileFor(ctx,id);if(!p)throw new Error('Complete your existing profile first');
  if(args.casualInterests.length>12)throw new Error('Use up to 12 outside-work interests');
  const casualInterests=[...new Map(args.casualInterests.map(s=>{const label=text(s,40);return [label.toLowerCase(),label];})).values()];
  await ctx.db.patch(p._id,{groupSharing:args.enabled,shareGroupSessions:args.shareSessions,casualInterests});
  if(args.enabled && !await participation(ctx,id))await ctx.db.insert('conferenceParticipation',{userId:id,conferenceId:CONFERENCE_ID,completed:false});
}});
export const completeConference = mutation({args:{conferenceId:v.string()},handler:async(ctx,{conferenceId})=>{
  conference(conferenceId);const id=await user(ctx),p=await participation(ctx,id);
  if(p)await ctx.db.patch(p._id,{completed:true});
  else await ctx.db.insert('conferenceParticipation',{userId:id,conferenceId,completed:true});
  // Deliberately no writes to memberships, messages, connections, captures, or notes.
}});
export const create = mutation({args:{conferenceId:v.string(),name:v.string(),capacity:v.number()},handler:async(ctx,args)=>{
  conference(args.conferenceId);const id=await user(ctx),p=await participation(ctx,id);
  if(!await sharedProfile(ctx,id)||!p)throw new Error('Enable profile sharing to participate');
  if(p.completed||Date.now()>=CONFERENCE_END)throw new Error('New groups open during the conference');
  if(!Number.isInteger(args.capacity)||args.capacity<3||args.capacity>12)throw new Error('Choose 3–12 members');
  const name=text(args.name,70),owned=await ctx.db.query('conferenceGroups').withIndex('by_owner',q=>q.eq('ownerId',id)).collect();
  const duplicate=owned.find(g=>g.conferenceId===args.conferenceId&&g.name.toLowerCase()===name.toLowerCase());
  if(duplicate) {
    if(!(await member(ctx,duplicate._id,id))?.active)throw new Error('You already started a group with this name. Choose a different name, or rejoin the existing group.');
    return duplicate._id;
  }
  if(owned.length>=10)throw new Error('You can start up to 10 groups');
  const groupId=await ctx.db.insert('conferenceGroups',{conferenceId:args.conferenceId,name,ownerId:id,capacity:args.capacity,createdAt:Date.now()});
  await ctx.db.insert('groupMembers',{groupId,userId:id,active:true,muted:false,joinedAt:Date.now()});
  return groupId;
}});
export const join = mutation({args:{groupId:v.id('conferenceGroups')},handler:async(ctx,{groupId})=>{
  const id=await user(ctx),g=await ctx.db.get(groupId);if(!g)throw new Error('Group unavailable');conference(g.conferenceId);
  if(!await sharedProfile(ctx,id)||!await participation(ctx,id))throw new Error('Enable profile sharing to participate');
  const old=await member(ctx,groupId,id);if(old?.active)return;
  const members=await groupPeople(ctx,groupId),hidden=await blocked(ctx,id);
  if(members.some(m=>hidden.has(m.userId)))throw new Error('Group unavailable');
  if(members.length>=g.capacity)throw new Error('This group is full');
  if(old)await ctx.db.patch(old._id,{active:true,joinedAt:Date.now()});
  else await ctx.db.insert('groupMembers',{groupId,userId:id,active:true,muted:false,joinedAt:Date.now()});
  // Joining is never a direct connection or a network graph edge.
}});
export const leave = mutation({args:{groupId:v.id('conferenceGroups')},handler:async(ctx,{groupId})=>{
  const id=await user(ctx),m=await member(ctx,groupId,id);if(m?.active)await ctx.db.patch(m._id,{active:false});
}});
export const mute = mutation({args:{groupId:v.id('conferenceGroups'),muted:v.boolean()},handler:async(ctx,args)=>{
  const {membership}=await permitted(ctx,args.groupId,await user(ctx));await ctx.db.patch(membership._id,{muted:args.muted});
}});
export const details = query({args:{groupId:v.id('conferenceGroups')},handler:async(ctx,{groupId})=>{
  const id=await user(ctx),{group,membership}=await permitted(ctx,groupId,id),hidden=await blocked(ctx,id),members=await groupPeople(ctx,groupId);
  const people=await profiles(ctx,members.map(m=>m.userId),hidden);
  const coverage=(await ctx.db.query('groupCoverage').withIndex('by_group',q=>q.eq('groupId',groupId)).collect()).filter(c=>!hidden.has(c.userId)&&members.some(m=>m.userId===c.userId));
  const captures=await ctx.db.query('captures').withIndex('by_user',q=>q.eq('userId',id)).collect();
  return {id:groupId,name:group.name,conferenceName:event.name,capacity:group.capacity,count:members.length,muted:membership.muted,me:id,people,ground:commonGround(people),
    coverage:coverage.map(c=>({talkId:c.talkId,userId:c.userId,covering:c.covering,name:people.find(p=>p.id===c.userId)?.name??'Group member'})),
    savedNotes:captures.filter(c=>c.kind==='session'&&c.status==='approved'&&c.talkId&&c.draft).map(c=>({id:c._id,talkId:c.talkId!,title:c.title,revision:c.revision,preview:c.draft!.summary}))};
}});
export const history = query({args:{groupId:v.id('conferenceGroups'),kind:v.union(v.literal('messages'),v.literal('notes')),paginationOpts:paginationOptsValidator},handler:async(ctx,args)=>{
  const id=await user(ctx);await permitted(ctx,args.groupId,id);const hidden=await blocked(ctx,id);
  const rows=args.kind==='messages'
    ? await ctx.db.query('groupMessages').withIndex('by_group',q=>q.eq('groupId',args.groupId)).order('desc').paginate(args.paginationOpts)
    : await ctx.db.query('groupNotes').withIndex('by_group',q=>q.eq('groupId',args.groupId)).order('desc').paginate(args.paginationOpts);
  const page=[];
  for(const row of rows.page)if(!hidden.has(row.authorId)) {
    const p=await sharedProfile(ctx,row.authorId);
    page.push({id:row._id,body:row.body,authorId:row.authorId,name:p?.name??'Group member',demo:p?.demo??false,createdAt:row.createdAt,talkId:'talkId' in row?row.talkId:null});
  }
  return {...rows,page};
}});
export const send = mutation({args:{groupId:v.id('conferenceGroups'),body:v.string(),requestId:v.string()},handler:async(ctx,args)=>{
  const id=await user(ctx);await permitted(ctx,args.groupId,id);const body=text(args.body,4000),requestId=text(args.requestId,100);
  const old=await ctx.db.query('groupMessages').withIndex('by_request',q=>q.eq('groupId',args.groupId).eq('authorId',id).eq('requestId',requestId)).unique();
  if(old)return old._id;
  return ctx.db.insert('groupMessages',{groupId:args.groupId,authorId:id,body,requestId,createdAt:Date.now()});
}});
export const cover = mutation({args:{groupId:v.id('conferenceGroups'),talkId:v.string(),plan:v.union(v.literal('attend'),v.literal('cover'),v.literal('none'))},handler:async(ctx,args)=>{
  const id=await user(ctx);await permitted(ctx,args.groupId,id);
  if(!talks.some(t=>t.id===args.talkId))throw new Error('Choose an official session');
  const old=await ctx.db.query('groupCoverage').withIndex('by_group_user_talk',q=>q.eq('groupId',args.groupId).eq('userId',id).eq('talkId',args.talkId)).unique();
  if(args.plan==='none'){if(old)await ctx.db.delete(old._id);return;}
  if(old)await ctx.db.patch(old._id,{covering:args.plan==='cover'});
  else await ctx.db.insert('groupCoverage',{groupId:args.groupId,userId:id,talkId:args.talkId,covering:args.plan==='cover'});
}});
export const shareNote = mutation({args:{groupId:v.id('conferenceGroups'),talkId:v.string(),body:v.string(),requestId:v.string(),captureId:v.optional(v.id('captures'))},handler:async(ctx,args)=>{
  const id=await user(ctx);await permitted(ctx,args.groupId,id);
  if(!talks.some(t=>t.id===args.talkId))throw new Error('Choose an official session');
  let body=text(args.body,8000);
  if(args.captureId) {
    const c=await ctx.db.get(args.captureId);
    if(!c||c.userId!==id||c.kind!=='session'||c.talkId!==args.talkId||c.status!=='approved'||!c.draft)throw new Error('Choose your reviewed session notes');
    body=text([c.draft.summary,...c.draft.takeaways].join('\n'),8000);
  }
  const requestId=text(args.requestId,100),old=await ctx.db.query('groupNotes').withIndex('by_request',q=>q.eq('groupId',args.groupId).eq('authorId',id).eq('requestId',requestId)).unique();
  if(old)return old._id;
  return ctx.db.insert('groupNotes',{groupId:args.groupId,authorId:id,talkId:args.talkId,body,requestId,createdAt:Date.now()});
}});
export const report = mutation({args:{groupId:v.id('conferenceGroups'),reportedId:v.id('users'),reason:v.string()},handler:async(ctx,args)=>{
  const id=await user(ctx);await permitted(ctx,args.groupId,id);
  if(id===args.reportedId||!await member(ctx,args.groupId,args.reportedId))throw new Error('Choose a group member');
  await ctx.db.insert('groupReports',{groupId:args.groupId,reporterId:id,reportedId:args.reportedId,reason:text(args.reason,1000),createdAt:Date.now()});
}});
export const block = mutation({args:{groupId:v.id('conferenceGroups'),blockedId:v.id('users')},handler:async(ctx,args)=>{
  const id=await user(ctx);await permitted(ctx,args.groupId,id);
  if(id===args.blockedId||!await member(ctx,args.groupId,args.blockedId))throw new Error('Choose a group member');
  if(!await ctx.db.query('groupBlocks').withIndex('by_pair',q=>q.eq('userId',id).eq('blockedId',args.blockedId)).unique())
    await ctx.db.insert('groupBlocks',{userId:id,blockedId:args.blockedId});
}});
