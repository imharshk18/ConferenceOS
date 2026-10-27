import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { areaLabel } from '../../packages/core/groups';
import { talks } from '../../packages/core/data';
import { friendlyError } from './friendlyError';

type Props = { authenticated:boolean; connected:boolean };
function Button({label,onPress,disabled=false,quiet=false}:{label:string;onPress:()=>void;disabled?:boolean;quiet?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,quiet&&s.quiet,{opacity:disabled ? 0.4 : pressed ? 0.7 : 1}]}><Text style={quiet?s.link:s.buttonText}>{label}</Text></Pressable>;
}
function Tags({values}:{values:string[]}) { return <View style={s.tags}>{values.map(v=><View key={v} style={s.chip}><Text style={s.chipText}>{v}</Text></View>)}</View>; }
function useAction(connected:boolean) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
  async function run(fn:()=>Promise<unknown>) {if(lock.current||!connected)return;lock.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(friendlyError(e,'Couldn’t save this change. Reconnect and try again.'));}finally{lock.current=false;setBusy(false);}}
  return {run,busy,error};
}
/** These controls live in the existing profile panel as well as the group entry point. */
export function GroupProfileSettings({connected}:{connected:boolean}) {
  const data=useQuery(api.groups.mine,{}),save=useMutation(api.groups.setSharing),{run,busy,error}=useAction(connected);
  const [casual,setCasual]=useState(''),[sessions,setSessions]=useState(false);
  const p=data?.profile;
  useEffect(()=>{setCasual(p?.casual.join(', ')??'');setSessions(p?.shareSessions??false);},[p?.casual.join(','),p?.shareSessions]);
  if(!p)return <Text style={s.copy}>Complete your existing profile to use Conference Groups.</Text>;
  const update=(enabled:boolean)=>void run(()=>save({enabled,shareSessions:sessions,casualInterests:casual.split(',').map(s=>s.trim()).filter(Boolean)}));
  return <View style={s.card}>
    <Text style={s.kicker}>YOUR PROFILE · YOUR CHOICE</Text><Text style={s.subtitle}>Share your common ground.</Text>
    <Text style={s.copy}>Conference Groups uses your existing profile. Enabling sharing also confirms you’re participating in {data?.conferenceName}. Your name, headline, goal, professional areas and the optional interests below become visible to participating attendees.</Text>
    <Text style={s.name}>{p.name}</Text><Text style={s.copy}>{p.headline}{p.goal?`\n${p.goal}`:''}</Text><Tags values={p.professional.map(areaLabel)}/>
    <Text style={s.copy}>Outside-work interests · optional, comma separated</Text><TextInput accessibilityLabel="Outside-work interests in your profile" value={casual} onChangeText={setCasual} placeholder="Add only what you want to share" placeholderTextColor="#748997" maxLength={490} style={s.input}/>
    <Pressable accessibilityRole="switch" accessibilityLabel="Share saved session preferences with groups" accessibilityState={{checked:sessions}} onPress={()=>setSessions(!sessions)} style={s.line}><Text style={[s.copy,{flex:1}]}>Include my saved session preferences</Text><Ionicons name={sessions?'checkbox':'square-outline'} size={24} color="#b9dfce"/></Pressable>
    <Text style={s.meta}>Private call details, transcripts, recordings, and conversation memories stay private. Changes to these profile fields update group matching. Turning sharing off removes this profile context from groups; messages you chose to send remain.</Text>
    <Button label={p.sharing?'Save sharing preferences':'Share profile & find groups'} disabled={busy||!connected} onPress={()=>update(true)}/>
    {p.sharing&&<Button quiet label="Turn group profile sharing off" disabled={busy||!connected} onPress={()=>update(false)}/>}
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
export function ConferenceGroups({authenticated,connected}:Props) {
  const [open,setOpen]=useState(false),[selected,setSelected]=useState<Id<'conferenceGroups'>|null>(null),[section,setSection]=useState<'suggested'|'mine'|'past'>('suggested'),[settings,setSettings]=useState(false),[name,setName]=useState(''),[capacity,setCapacity]=useState(5);
  const data=useQuery(api.groups.mine,authenticated?{}:'skip'),create=useMutation(api.groups.create),join=useMutation(api.groups.join),{run,busy,error}=useAction(connected),insets=useSafeAreaInsets();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Open Conference Groups" onPress={()=>setOpen(true)} style={({pressed})=>[s.launcher,{opacity:pressed ? 0.8 : 1}]}>
      <View style={s.line}><View style={s.groupIcon}><Ionicons name="people-outline" color="#bce4d2" size={25}/></View><View style={{flex:1}}><Text style={s.kicker}>A SMALLER CIRCLE. A LONGER CONNECTION.</Text><Text style={s.subtitle}>Conference Groups</Text><Text style={s.meta}>{data?.mine.length?`${data.mine.length} groups · keep the conversation going`:'Find your people, together.'}</Text></View><Ionicons name="arrow-forward" size={20} color="#c4e6d6"/></View>
    </Pressable>
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>{setOpen(false);setSelected(null);}}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={[s.page,{paddingTop:insets.top+12,paddingBottom:insets.bottom}]}>
        <View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel={selected?'Back to groups':'Close groups'} hitSlop={12} onPress={()=>{if(selected)setSelected(null);else setOpen(false);}}><Ionicons name={selected?'arrow-back':'close'} size={25} color="#dceae5"/></Pressable><Text style={s.headerTitle}>Conference Groups</Text><Ionicons name="people-outline" size={23} color="#91b5aa"/></View>
        {!authenticated?<Text style={s.copy}>Sign in to open your groups.</Text>:selected?<WorkspaceBoundary key={selected} onClose={()=>setSelected(null)}><GroupWorkspace groupId={selected} connected={connected} onLeave={task=>{setSelected(null);void run(task);}}/></WorkspaceBoundary>:<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:35}}>
          {!connected&&<Text style={s.error}>Offline · reconnect to send messages or make changes.</Text>}
          {!data?<ActivityIndicator color="#b9dfce"/>:<>
            <Text style={s.kicker}>{data.conferenceName.toUpperCase()}</Text><Text style={s.title}>Good company.{'\n'}Shared ambition.</Text><Text style={s.copy}>Small groups built around professional interests. Chat and share what you learn, at your own pace.</Text>
            <View style={s.tabs}>{(['suggested','mine','past'] as const).map(key=><Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:section===key}} onPress={()=>setSection(key)} style={[s.tab,section===key&&s.tabActive]}><Text style={section===key?s.activeTab:s.meta}>{key==='suggested'?'Suggested':key==='mine'?'My Groups':'Past Conferences'}</Text></Pressable>)}</View>
            <Button quiet label={settings?'Hide profile sharing':'Profile sharing & interests'} onPress={()=>setSettings(!settings)}/>
            {(settings||!data.profile?.sharing)&&<GroupProfileSettings connected={connected}/>}
            {section==='suggested'?<>
              {data.past?<Text style={s.copy}>Your conference has finished. Your groups and conversations are in Past Conferences.</Text>:<>
                {data.suggestions.map(g=><View key={g.id} style={s.card}><Text style={s.kicker}>{data.conferenceName} · {g.count}/{g.capacity} MEMBERS</Text><Text style={s.subtitle}>{g.name}</Text><Text style={s.copy}>{g.people.map(p=>`${p.name}${p.demo?' · simulated':''}`).join(' · ')}</Text><Tags values={g.reasons.slice(0,3)}/><Text style={s.meta}>Shared profile interests explain this suggestion. Each person chooses whether to join. Private chat and notes open after joining.</Text><Button label={`Join ${g.name}`} disabled={busy||!connected} onPress={()=>void run(async()=>{await join({groupId:g.id});setSelected(g.id);})}/></View>)}
                {!data.suggestions.length&&<View style={s.card}><Ionicons name="people-circle-outline" size={40} color="#a9cdbd"/><Text style={s.subtitle}>Room for your circle.</Text><Text style={s.copy}>Suggestions appear when other participating attendees share relevant profile interests and have room in their group. Start a circle for others to discover.</Text></View>}
                {data.profile?.sharing&&<View style={s.card}><Text style={s.subtitle}>Start a group</Text><Text style={s.copy}>We recommend 3–5 people. Your group starts with you; nobody else is enrolled automatically.</Text><TextInput accessibilityLabel="Group name" value={name} onChangeText={setName} maxLength={70} placeholder="A name for your professional circle" placeholderTextColor="#748997" style={s.input}/><View style={s.line}><Text style={s.copy}>Member limit</Text>{[3,4,5,8,12].map(n=><Pressable accessibilityRole="button" accessibilityLabel={`${n} member limit`} accessibilityState={{selected:capacity===n}} key={n} onPress={()=>setCapacity(n)} style={[s.size,capacity===n&&s.tabActive]}><Text style={s.link}>{n}</Text></Pressable>)}</View><Button label="Create group" disabled={!name.trim()||busy||!connected} onPress={()=>void run(async()=>{const id=await create({conferenceId:data.conferenceId,name,capacity});setName('');setSelected(id);})}/></View>}
              </>}
            </>:<>
              {data.mine.filter(g=>section==='past'?g.past:!g.past).map(g=><Pressable key={g.id} accessibilityRole="button" accessibilityLabel={`Open ${g.name}`} onPress={()=>setSelected(g.id)} style={s.card}><Text style={s.kicker}>{g.conferenceName}{g.past?' · COMPLETED':''}</Text><View style={s.line}><Text style={[s.subtitle,{flex:1}]}>{g.name}</Text><Ionicons name="arrow-forward" color="#b9dfce" size={20}/></View><Text style={s.copy}>{g.count} members{g.muted?' · muted':''}</Text><Text style={s.meta}>{g.past?'Your messages, resources and notes are still here. You can keep chatting.':'Common Ground · messages · optional session coverage'}</Text></Pressable>)}
              {!data.mine.some(g=>section==='past'?g.past:!g.past)&&<Text style={s.copy}>{section==='past'?'Groups from completed conferences stay here, with their full conversation history.':'Join a suggested group or start a circle to see it here.'}</Text>}
            </>}
          </>}
          {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{busy&&<ActivityIndicator color="#b9dfce"/>}
        </ScrollView>}
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
class WorkspaceBoundary extends React.Component<{children:React.ReactNode;onClose:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<View style={s.card}><Text accessibilityRole="alert" style={s.copy}>Couldn’t open this workspace. Return to your groups and try again.</Text><Button label="Return to my groups" onPress={this.props.onClose}/></View>:this.props.children;}
}
const requestKey=()=>`${Date.now()}-${Math.random().toString(36).slice(2)}`;
function GroupWorkspace({groupId,connected,onLeave}:{groupId:Id<'conferenceGroups'>;connected:boolean;onLeave:(task:()=>Promise<unknown>)=>void}) {
  const data=useQuery(api.groups.details,{groupId}),send=useMutation(api.groups.send),leave=useMutation(api.groups.leave),mute=useMutation(api.groups.mute),cover=useMutation(api.groups.cover),share=useMutation(api.groups.shareNote),report=useMutation(api.groups.report),block=useMutation(api.groups.block);
  const messages=usePaginatedQuery(api.groups.history,{groupId,kind:'messages'},{initialNumItems:30}),notes=usePaginatedQuery(api.groups.history,{groupId,kind:'notes'},{initialNumItems:20});
  const [section,setSection]=useState<'chat'|'coverage'|'members'>('chat'),[ground,setGround]=useState(true),[body,setBody]=useState(''),[search,setSearch]=useState(''),[talkId,setTalkId]=useState(''),[note,setNote]=useState(''),[reportId,setReportId]=useState<Id<'users'>|null>(null),[reason,setReason]=useState(''),[notice,setNotice]=useState(''),[confirmLeave,setConfirmLeave]=useState(false);
  const messageKey=useRef(requestKey()),noteKey=useRef(requestKey()),{run,busy,error}=useAction(connected);
  if(!data)return <ActivityIndicator color="#b9dfce"/>;
  const canAct=connected&&!busy, selectedTalk=talks.find(t=>t.id===talkId),visibleTalks=talkId?talks.filter(t=>t.id===talkId):talks.filter(t=>!search||t.title.toLowerCase().includes(search.toLowerCase())).slice(0,30);
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingBottom:40}}>
    {!connected&&<Text style={s.error}>Offline · reconnect to send or save.</Text>}
    <Text style={s.kicker}>{data.conferenceName.toUpperCase()} · {data.count}/{data.capacity} MEMBERS</Text><Text style={s.title}>{data.name}</Text>
    <View style={s.ground}>
      <Pressable accessibilityRole="button" accessibilityLabel="Common Ground" accessibilityState={{expanded:ground}} onPress={()=>setGround(!ground)} style={s.line}><Ionicons name="git-compare-outline" size={28} color="#bfe6cc"/><View style={{flex:1}}><Text style={s.subtitle}>Common Ground</Text><Text style={s.meta}>Real overlap, person to person.</Text></View><Ionicons name={ground?'chevron-up':'chevron-down'} size={22} color="#bfe6cc"/></Pressable>
      {ground&&(['professional','casual'] as const).map(category=><View key={category} style={{marginTop:20}}><Text style={s.kicker}>{category==='professional'?'TECHNICAL / PROFESSIONAL':'CASUAL / OUTSIDE WORK'}</Text>{data.ground.filter(g=>g.category===category).map((g,i)=><View key={i} style={s.groundItem}><Text style={s.groundText}>{g.label}</Text><Text style={s.meta}>{g.memberIds.map(id=>data.people.find(p=>p.id===id)?.name).filter(Boolean).join(' · ')}</Text></View>)}{!data.ground.some(g=>g.category===category)&&<Text style={s.copy}>{category==='casual'?'No shared outside-work interests yet. Sharing these is optional.':'Shared professional interests appear when members choose to share them.'}</Text>}</View>)}
    </View>
    <View style={s.tabs}>{(['chat','coverage','members'] as const).map(key=><Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:section===key}} onPress={()=>setSection(key)} style={[s.tab,section===key&&s.tabActive]}><Text style={section===key?s.activeTab:s.meta}>{key==='chat'?'Messages':key==='coverage'?'Session coverage':'Members'}</Text></Pressable>)}</View>
    {section==='chat'?<>
      <Text style={s.copy}>A conversation you can come back to. Chat is optional and stays open after the conference.</Text>
      {messages.status==='LoadingFirstPage'?<ActivityIndicator color="#b9dfce"/>:!messages.results.length?<Text style={s.meta}>No messages yet. Your group’s conversation will appear here.</Text>:null}
      {messages.status==='CanLoadMore'&&<Button quiet label="Load earlier messages" onPress={()=>messages.loadMore(30)}/>}
      {[...messages.results].reverse().map(m=><View key={m.id} style={[s.message,m.authorId===data.me&&s.ownMessage]}><Text style={s.kicker}>{m.name}{m.demo?' · SIMULATED':''} · {new Date(m.createdAt).toLocaleString()}</Text><Text selectable style={s.messageText}>{m.body}</Text></View>)}
      {messages.status==='LoadingMore'&&<ActivityIndicator color="#b9dfce"/>}
      <TextInput accessibilityLabel="Group message" value={body} onChangeText={v=>{setBody(v);messageKey.current=requestKey();}} multiline maxLength={4000} style={s.input} placeholder="Message your group" placeholderTextColor="#748997"/>
      <Button label="Send message" disabled={!canAct||!body.trim()} onPress={()=>{const draft=body,key=messageKey.current;void run(async()=>{await send({groupId,body:draft,requestId:key});setBody(current=>current===draft?'':current);messageKey.current=requestKey();});}}/>
    </>:section==='members'?<>
      <Text style={s.meta}>Sharing a group keeps you in a circle. To connect individually, use the existing private invite in Network.</Text>
      {data.people.map(p=><View key={p.id} style={s.card}><Text style={s.name}>{p.name}{p.id===data.me?' · you':''}{p.demo?' · simulated attendee':''}</Text><Text style={s.copy}>{p.headline}{p.goal?`\nGoal: ${p.goal}`:''}</Text><Tags values={p.professional.map(areaLabel)}/>{!!p.casual.length&&<><Text style={s.kicker}>OUTSIDE WORK</Text><Tags values={p.casual}/></>}{p.id!==data.me&&<View style={s.line}><Button quiet label={`Report ${p.name}`} onPress={()=>{setReportId(p.id as Id<'users'>);setNotice('');}}/><Button quiet label={`Block ${p.name}`} disabled={!canAct} onPress={()=>void run(async()=>{await block({groupId,blockedId:p.id as Id<'users'>});setNotice('Blocked in Groups. Their profile, messages and notes are hidden in your groups. Future group suggestions exclude each other.');})}/></View>}</View>)}
      <Text style={s.meta}>Only members who share their profile are listed. Blocking hides group content in both directions; it does not change existing direct connections.</Text>
      {reportId&&<View style={s.card}><Text style={s.subtitle}>Report a concern</Text><TextInput accessibilityLabel="Report reason" value={reason} onChangeText={setReason} multiline maxLength={1000} placeholder="Describe what happened" placeholderTextColor="#748997" style={s.input}/><Button label="Submit report" disabled={!canAct||!reason.trim()} onPress={()=>void run(async()=>{await report({groupId,reportedId:reportId,reason});setReportId(null);setReason('');setNotice('Report recorded. For an immediate boundary, block this member or leave the group.');})}/></View>}
      <Button quiet label={data.muted?'Unmute group':'Mute group'} disabled={!canAct} onPress={()=>void run(()=>mute({groupId,muted:!data.muted}))}/>
      <Text style={s.meta}>Mute saves your notification preference. Group push notifications are not enabled in this version.</Text>
      <Button quiet label="Leave group" onPress={()=>setConfirmLeave(!confirmLeave)}/>
      {confirmLeave&&<View style={s.card}><Text style={s.copy}>Leaving removes your access to this workspace. Messages and notes remain for the group. You can rejoin if space is available.</Text><Button label="Confirm leave group" disabled={!canAct} onPress={()=>onLeave(()=>leave({groupId}))}/></View>}
    </>:<>
      <Text style={s.subtitle}>Divide the sessions. Share the learning.</Text><Text style={s.copy}>Attend what interests you. Volunteering to cover a session is optional, and all shared takeaways stay here.</Text>
      <TextInput accessibilityLabel="Search official sessions" value={search} onChangeText={v=>{setSearch(v);setTalkId('');}} style={s.input} placeholder="Search the official program" placeholderTextColor="#748997"/>
      {!!talkId&&<Button quiet label="Browse all sessions" onPress={()=>setTalkId('')}/>}
      {visibleTalks.map(t=>{const attendees=data.coverage.filter(c=>c.talkId===t.id),mine=attendees.find(c=>c.userId===data.me);return <View key={t.id} style={[s.card,talkId===t.id&&s.selected]}><Pressable accessibilityRole="button" accessibilityLabel={`Select ${t.title}`} onPress={()=>setTalkId(t.id)}><Text style={s.kicker}>{t.day} · {t.time}–{t.end}</Text><Text style={s.name}>{t.title}</Text></Pressable><Text style={s.meta}>{attendees.length?attendees.map(a=>`${a.name}${a.covering?' · covering':' · attending'}`).join('\n'):'No plans shared yet'}</Text><View style={s.line}><Button quiet label={mine?'Remove my plan':'I’ll attend'} disabled={!canAct} onPress={()=>void run(()=>cover({groupId,talkId:t.id,plan:mine?'none':'attend'}))}/><Button quiet label={mine?.covering?'Covering ✓':'Volunteer to cover'} disabled={!canAct||mine?.covering} onPress={()=>void run(()=>cover({groupId,talkId:t.id,plan:'cover'}))}/></View><Button quiet label="Share takeaways for this session" onPress={()=>setTalkId(t.id)}/></View>;})}
      {visibleTalks.length===30&&<Text style={s.meta}>Showing the first 30 sessions. Search to narrow the official program.</Text>}
      {selectedTalk&&<View style={s.ground}><Text style={s.kicker}>SHARE WITH THIS GROUP</Text><Text style={s.name}>{selectedTalk.title}</Text><TextInput accessibilityLabel="Session takeaways or resource links" multiline value={note} onChangeText={v=>{setNote(v);noteKey.current=requestKey();}} maxLength={8000} style={s.input} placeholder="Notes, takeaways, or a useful link" placeholderTextColor="#748997"/><Button label="Share takeaways" disabled={!canAct||!note.trim()} onPress={()=>{const draft=note,key=noteKey.current;void run(async()=>{await share({groupId,talkId,body:draft,requestId:key});setNote(current=>current===draft?'':current);noteKey.current=requestKey();setNotice('Takeaways shared with your group.');});}}/>
        {data.savedNotes.filter(n=>n.talkId===talkId).map(n=><View key={n.id}><Text style={s.copy}>{n.preview}</Text><Button quiet label={`Share reviewed notes: ${n.title}`} disabled={!canAct} onPress={()=>void run(async()=>{await share({groupId,talkId,body:n.preview,captureId:n.id,requestId:`capture-${n.id}-${n.revision}`});setNotice('Reviewed notes shared. Your private capture is unchanged.');})}/></View>)}
      </View>}
      <Text style={[s.subtitle,{marginTop:20}]}>Shared knowledge</Text>{notes.status==='LoadingFirstPage'&&<ActivityIndicator color="#b9dfce"/>}{!notes.results.length&&<Text style={s.copy}>Shared notes and resource links will stay here beyond the conference.</Text>}
      {[...notes.results].reverse().map(n=><View style={s.card} key={n.id}><Text style={s.kicker}>{n.name}{n.demo?' · SIMULATED':''} · {new Date(n.createdAt).toLocaleString()}</Text><Text style={s.name}>{talks.find(t=>t.id===n.talkId)?.title}</Text><Text selectable style={s.copy}>{n.body}</Text></View>)}
      {notes.status==='CanLoadMore'&&<Button quiet label="Load earlier notes" onPress={()=>notes.loadMore(20)}/>}
    </>}
    {!!notice&&<Text accessibilityRole="alert" style={s.copy}>{notice}</Text>}{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{busy&&<ActivityIndicator color="#b9dfce"/>}
  </ScrollView>;
}
const s=StyleSheet.create({
  page:{flex:1,backgroundColor:'#0e1720',paddingHorizontal:22},header:{flexDirection:'row',alignItems:'center',gap:16,marginBottom:20},headerTitle:{flex:1,fontSize:17,fontWeight:'500',color:'#e4ece8'},launcher:{padding:20,borderRadius:26,borderWidth:1,borderColor:'#345149',backgroundColor:'#152a2a',marginVertical:20},groupIcon:{height:49,width:49,borderRadius:25,backgroundColor:'#b9dfce15',alignItems:'center',justifyContent:'center'},line:{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},title:{fontSize:34,lineHeight:39,letterSpacing:-1.1,color:'#e6eced',marginTop:10},subtitle:{fontSize:21,letterSpacing:-.5,color:'#e5eeea',fontWeight:'500'},name:{fontSize:15,lineHeight:23,fontWeight:'500',color:'#e5eeea'},kicker:{fontSize:9,lineHeight:15,letterSpacing:1.2,color:'#95b0ad',marginBottom:6},copy:{fontSize:13,lineHeight:22,color:'#a8bac3',marginVertical:10},meta:{fontSize:11,lineHeight:18,color:'#8fa4ad'},card:{padding:20,borderRadius:24,backgroundColor:'#14222b',borderWidth:1,borderColor:'#ffffff0e',marginVertical:10},ground:{padding:22,borderRadius:26,borderWidth:1,borderColor:'#609b7a66',backgroundColor:'#19332d',marginVertical:20},groundItem:{paddingVertical:10,borderBottomWidth:1,borderColor:'#b9dfce15'},groundText:{fontSize:14,lineHeight:22,color:'#dceee2'},tabs:{flexDirection:'row',gap:6,marginVertical:16},tab:{flex:1,paddingVertical:12,paddingHorizontal:4,borderRadius:18,alignItems:'center',justifyContent:'center'},tabActive:{backgroundColor:'#28473f'},activeTab:{fontSize:11,fontWeight:'600',color:'#d0eadd'},tags:{flexDirection:'row',flexWrap:'wrap',gap:7,marginVertical:10},chip:{paddingVertical:7,paddingHorizontal:11,borderRadius:13,backgroundColor:'#b4dcc213',maxWidth:'100%'},chipText:{fontSize:11,lineHeight:18,color:'#c2d9cc'},button:{backgroundColor:'#bfdfcf',borderRadius:22,paddingVertical:14,paddingHorizontal:17,alignItems:'center',marginVertical:8},quiet:{backgroundColor:'#b9dfce08'},buttonText:{fontSize:13,fontWeight:'600',color:'#14211e'},link:{color:'#b6deca',fontSize:12,lineHeight:18},input:{backgroundColor:'#08121a',borderWidth:1,borderColor:'#b9dfce25',padding:15,borderRadius:18,color:'#e1eee7',fontSize:14,lineHeight:22,marginVertical:12},size:{padding:10,borderRadius:14},message:{padding:16,backgroundColor:'#172934',borderRadius:20,marginVertical:6,marginRight:20},ownMessage:{backgroundColor:'#1c3831',marginRight:0,marginLeft:20},messageText:{fontSize:14,lineHeight:22,color:'#e0eae6'},error:{fontSize:12,lineHeight:20,color:'#efb7a8',marginVertical:12},selected:{borderColor:'#b9dfce66'}
});
