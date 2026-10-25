import React,{useEffect,useRef,useState} from 'react';
import {AppState,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import {AudioModule,RecordingPresets,setAudioModeAsync,useAudioRecorder,useAudioRecorderState} from 'expo-audio';
import {useAuthToken} from '@convex-dev/auth/react';
import {useMutation,useQuery} from 'convex/react';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {api} from '../../convex/_generated/api';
import type {Id} from '../../convex/_generated/dataModel';
import type {CaptureTarget} from './CaptureStudio';
import {RecorderVisual} from './RecorderVisual';
import {FormationVisual} from './FormationVisual';
import {NetworkOrbit} from './NetworkExperience';
import {uploadMime} from '../../packages/core/uploadMedia';
import {friendlyError} from './friendlyError';
import {useReducedMotion} from './useReducedMotion';
const site=(process.env.EXPO_PUBLIC_CONVEX_URL||'https://resilient-llama-452.convex.cloud').replace(/\.convex\.cloud$/,'.convex.site');

export function ConversationFlow({target,connected,onClose,renderReview}:{target:CaptureTarget;connected:boolean;onClose:()=>void;renderReview:(id:Id<'captures'>)=>React.ReactNode}){
 const token=useAuthToken(),inset=useSafeAreaInsets(),{width}=useWindowDimensions(),reduced=useReducedMotion();
 const social=useQuery(api.social.mine,{}),captures=useQuery(api.captures.mine,{}),network=useQuery(api.network.mine,{});
 const connect=useMutation(api.demo.connect),create=useMutation(api.captures.create),analyze=useMutation(api.captures.analyze);
 const [step,setStep]=useState<'record'|'connect'|'saving'>('record'),[consent,setConsent]=useState(false),[recording,setRecording]=useState(false),[audio,setAudio]=useState(''),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState('');
 const [id,setId]=useState<Id<'captures'>>(),[chosen,setChosen]=useState(target.connectionId);
 const recorder=useAudioRecorder({...RecordingPresets.HIGH_QUALITY,numberOfChannels:1,bitRate:64000}),state=useAudioRecorderState(recorder,250);
 const mounted=useRef(true),isRecording=useRef(false),stopping=useRef(false),fileUri=useRef(''),captureId=useRef<Id<'captures'>|undefined>(undefined),uploadComplete=useRef(false),request=useRef<AbortController|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const capture=captures?.find(c=>c.id===id),people=social?.connections.filter(p=>p.status==='accepted')??[];
 const saved=capture?.status==='approved';
 const graphUpdated=!!(saved&&capture.memoryId&&network?.status==='ready'&&network.graph.nodes.some(n=>n.id===`memory:${capture.memoryId}`));
 async function stop(){
  if(!isRecording.current||stopping.current)return;stopping.current=true;if(timer.current)clearTimeout(timer.current);
  try{await recorder.stop();const uri=recorder.uri;if(!uri)throw new Error('Recording unavailable');fileUri.current=uri;if(mounted.current){setAudio(uri);setStep('connect');}}
  catch{if(mounted.current)setError('Couldn’t keep that recording. Please try again.');}
  finally{isRecording.current=false;stopping.current=false;if(mounted.current)setRecording(false);void setAudioModeAsync({allowsRecording:false,allowsBackgroundRecording:false,shouldPlayInBackground:false}).catch(()=>{});}
 }
 useEffect(()=>{mounted.current=true;const sub=AppState.addEventListener('change',s=>{if(s!=='active'&&isRecording.current)void stop();});return()=>{mounted.current=false;sub.remove();if(timer.current)clearTimeout(timer.current);request.current?.abort();if(isRecording.current)void recorder.stop().catch(()=>{});void setAudioModeAsync({allowsRecording:false,allowsBackgroundRecording:false,shouldPlayInBackground:false}).catch(()=>{});};},[recorder]);
 useEffect(()=>{if(!state.isRecording&&state.durationMillis>0&&isRecording.current&&!stopping.current&&recorder.uri){isRecording.current=false;fileUri.current=recorder.uri;setAudio(recorder.uri);setRecording(false);setStep('connect');if(timer.current)clearTimeout(timer.current);void setAudioModeAsync({allowsRecording:false,shouldPlayInBackground:false,allowsBackgroundRecording:false}).catch(()=>{});}},[state.isRecording,state.durationMillis,recorder]);
 async function start(){if(!consent||busy)return;setBusy(true);setError('');try{const permission=await AudioModule.requestRecordingPermissionsAsync();if(!permission.granted)throw new Error('Allow microphone access to record this conversation.');await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,allowsBackgroundRecording:false,shouldPlayInBackground:false});await recorder.prepareToRecordAsync();if(!mounted.current||AppState.currentState!=='active')return;isRecording.current=true;setRecording(true);recorder.record({forDuration:90});timer.current=setTimeout(()=>void stop(),90_000);}catch(e){setError(friendlyError(e,'Couldn’t start recording.'));}finally{if(mounted.current)setBusy(false);}}
 async function save(connectionId:Id<'connections'>,demo:boolean){
  if(!connected||!token||busy||!consent||!fileUri.current)return;
  setBusy(true);setError('');setStep('saving');setProgress('Keeping this moment.');
  const controller=new AbortController();request.current=controller;const timeout=setTimeout(()=>controller.abort(),60_000);
  try{
   const blob=await(await fetch(fileUri.current)).blob();const mime=uploadMime('audio',Platform.OS==='web'?'audio/webm':'audio/mp4',blob.type);
   if(!blob.size||blob.size>8*1024*1024)throw new Error('Use a recording under 8 MB.');
   let next=captureId.current;
   if(!next){next=await create({kind:'conversation',title:target.title,notes:'',connectionId,consentConfirmed:true,autoSaveDemo:demo});captureId.current=next;setId(next);}
   if(!uploadComplete.current){
    const response=await fetch(`${site}/capture-upload?captureId=${encodeURIComponent(next)}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':mime,'X-Upload-Key':`${next}-audio`},body:blob,signal:controller.signal});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'Upload interrupted. Your recording is still here; retry when connected.');}
    uploadComplete.current=true;
   }
   setProgress('Finding the things worth remembering.');
   await analyze({captureId:next,revision:capture?.revision??1});
  }catch(e){if(mounted.current)setError(friendlyError(e,'Couldn’t save yet. Your recording is still here.'));}
  finally{clearTimeout(timeout);request.current=null;if(mounted.current)setBusy(false);}
 }
 async function tap(){if(busy||!connected)return;setError('');if(code.trim()!=='123456'){setError('Use 123456 for the simulated tap, or choose an existing connection.');return;}
  setBusy(true);let linked:Id<'connections'>|undefined;try{linked=(await connect({code:'123456'})).connectionId;setChosen(linked);}catch(e){setError(friendlyError(e,'Couldn’t connect.'));}finally{setBusy(false);}if(linked){ // Defer to next turn so the submission guard observes the cleared busy flag.
    pending.current=linked;
  }
 }
 const pending=useRef<Id<'connections'>|undefined>(undefined);
 useEffect(()=>{if(!busy&&pending.current){const next=pending.current;pending.current=undefined;void save(next,true);}},[busy,chosen]);
 const title=step==='record'?'Be here. Keep the good parts.':step==='connect'?'Good conversation?\nMake it a connection.':graphUpdated?'A new thread\nin your world.':saved?'Your context is saved.':'Your world,\ngetting a little bigger.';
 return <Modal animationType={reduced?'none':'fade'} onRequestClose={()=>{if(!busy){void stop();onClose();}}}><LinearGradient colors={step==='connect'?['#0b171b','#102d2d','#0b101a']:['#0b101a','#151728','#0b1720']} style={[s.page,{paddingTop:inset.top+14,paddingBottom:inset.bottom+15}]}>
  <View style={s.top}><Text style={s.brand}>conferenceos / {step==='record'?'listen':step==='connect'?'connect':'remember'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close conversation" disabled={busy} onPress={()=>{void stop();onClose();}}><Ionicons name="close" size={25} color="#c8ccd8"/></Pressable></View>
  <ScrollView contentContainerStyle={{paddingBottom:20}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
   <Text style={s.title}>{title}</Text>
   {step==='record'?<>
    <RecorderVisual recording={recording} recorded={!!audio} elapsed={state.durationMillis}/>
    {!recording&&<Pressable accessibilityRole="checkbox" accessibilityLabel="Everyone agrees to recording and processing" accessibilityState={{checked:consent}} aria-checked={consent} style={s.consent} onPress={()=>setConsent(!consent)}><Ionicons name={consent?'checkbox':'square-outline'} size={23} color="#b7dfce"/><Text style={s.copy}>Everyone agrees to recording and private processing.</Text></Pressable>}
    <Button label={recording?'Finish conversation':'Start recording'} icon={recording?'stop':'mic-outline'} disabled={!consent||busy} onPress={()=>void(recording?stop():start())}/>
    <Text style={s.note}>Up to 90 seconds · microphone stops when you leave.</Text>
   </>:step==='connect'?<>
    <View style={s.phones}><View style={[s.phone,{transform:[{rotate:'-14deg'}]}]}><Ionicons name="person" size={35} color="#a8d4c6"/></View><View style={[s.phone,{transform:[{rotate:'14deg'}],marginLeft:-12}]}><Ionicons name="add" size={38} color="#e8bfa8"/></View><View style={s.touch}><Ionicons name="radio-outline" size={32} color="#d8f2dc"/></View></View>
    <Text style={s.copy}>Connect, and we’ll keep the context with the person—not just in your camera roll.</Text>
    <TextInput accessibilityLabel="Conversation connection code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="123456" placeholderTextColor="#637b7e" style={s.code}/>
    <Button label="Connect & save" icon="radio-outline" disabled={busy||!connected||code.trim()!=='123456'} onPress={()=>void tap()}/>
    <Text style={s.note}>Demo tap · connects to Alex, a simulated attendee. Context saves automatically and is labeled as extracted, not human-reviewed.</Text>
    {people.length>0&&<><Text style={s.kicker}>OR SOMEONE YOU KNOW</Text>{people.map(p=><Pressable accessibilityRole="button" accessibilityLabel={`Save conversation with ${p.name}`} key={p.id} disabled={busy||!connected} style={s.person} onPress={()=>{setChosen(p.id);void save(p.id,p.demo);}}><View style={[s.initial,{backgroundColor:p.color+'24'}]}><Text style={{color:p.color}}>{p.name[0]}</Text></View><Text style={s.personName}>{p.name}</Text><Ionicons name="arrow-forward" color="#a9c2be" size={18}/></Pressable>)}<Text style={s.note}>Real connections still review shared memories.</Text></>}
    <Pressable accessibilityRole="button" onPress={onClose} style={s.skip}><Text style={s.skipText}>Skip this conversation</Text></Pressable>
   </>:<>
    {graphUpdated?<NetworkOrbit authenticated connected={connected} width={width-44} onPerson={()=>{}}/>:<FormationVisual size={Math.min(width-60,330)} phase="connecting"/>}
    <Text accessibilityLiveRegion="polite" style={s.copy}>{graphUpdated?'The conversation and its context are now part of your personal network.':saved?'Your recording and context are saved. The network view is updating.':capture?.status==='processing'?'Listening, finding context, and connecting the dots.':progress}</Text>
    {saved&&<Text style={s.note}>Demo connection · automatically extracted context. No other attendee’s review is claimed.</Text>}
    {capture?.status==='review'&&renderReview(capture.id)}
    {!!(error||capture?.error)&&<><Text accessibilityRole="alert" style={s.error}>{error||capture?.error}</Text><Button label="Try saving again" disabled={busy||!connected||!chosen} icon="refresh-outline" onPress={()=>chosen&&void save(chosen,people.find(p=>p.id===chosen)?.demo??true)}/></>}
    {saved&&<Button label="Back to my conference" icon="arrow-forward" onPress={onClose}/>}
   </>}
   {!!error&&step!=='saving'&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </ScrollView>
 </LinearGradient></Modal>;
}
function Button({label,icon,onPress,disabled=false}:{label:string;icon:React.ComponentProps<typeof Ionicons>['name'];onPress:()=>void;disabled?:boolean}){return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={({pressed})=>[s.button,{opacity:disabled?.35:pressed?.75:1}]}><Text style={s.buttonText}>{label}</Text><Ionicons name={icon} size={20} color="#14231e"/></Pressable>}
const s=StyleSheet.create({page:{flex:1,paddingHorizontal:24},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:12},brand:{fontSize:12,letterSpacing:.4,color:'#9ba9b3'},title:{fontSize:35,lineHeight:40,fontWeight:'400',letterSpacing:-1.5,color:'#f0f0ed',marginTop:27,marginBottom:24},copy:{color:'#a7b6be',fontSize:14,lineHeight:23,flexShrink:1},consent:{flexDirection:'row',alignItems:'center',gap:12,marginVertical:20},button:{borderRadius:30,backgroundColor:'#c6ecce',padding:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:20},buttonText:{fontSize:15,fontWeight:'600',color:'#14231e'},note:{fontSize:10,lineHeight:17,color:'#7d949b',marginTop:15},phones:{height:215,flexDirection:'row',alignItems:'center',justifyContent:'center'},phone:{width:94,height:157,borderRadius:24,borderWidth:1,borderColor:'#ffffff25',backgroundColor:'#163336',alignItems:'center',justifyContent:'center'},touch:{position:'absolute',top:86,width:54,height:54,borderRadius:27,alignItems:'center',justifyContent:'center',backgroundColor:'#436f6444'},code:{color:'#d9efdf',fontSize:29,letterSpacing:12,textAlign:'center',paddingVertical:18,borderBottomWidth:1,borderColor:'#ffffff20',marginTop:20},kicker:{fontSize:9,letterSpacing:2,color:'#92aaa6',marginTop:30,marginBottom:10},person:{paddingVertical:12,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderColor:'#ffffff0d'},initial:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},personName:{fontSize:14,color:'#e5e9ec',flex:1},skip:{padding:22,alignItems:'center'},skipText:{fontSize:12,color:'#8b9fa8'},error:{fontSize:13,lineHeight:20,color:'#ffbfae',marginTop:16}});
