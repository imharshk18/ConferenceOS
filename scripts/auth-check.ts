/** Tests two independent anonymous identities without logging their tokens. */
import {config} from 'dotenv';
import {writeFile} from 'node:fs/promises';
import {ConvexHttpClient} from 'convex/browser';
import {api} from '../convex/_generated/api';
import {talks,people} from '../packages/core/data';
config({path:'.env.local',quiet:true});
async function main(){
 const url=process.env.CONVEX_URL;if(!url)throw new Error('CONVEX_URL missing');
 const a=new ConvexHttpClient(url),b=new ConvexHttpClient(url),guest=new ConvexHttpClient(url);
 const checks={anonymousSignIn:false,persistence:false,bookmarkToggle:false,connections:false,isolatedIdentities:false,unauthorizedWriteRejected:false};
 const signA=await a.action(api.auth.signIn,{provider:'anonymous'});
 const signB=await b.action(api.auth.signIn,{provider:'anonymous'});
 if(!signA.tokens?.token||!signB.tokens?.token)throw new Error('Auth did not return tokens');
 a.setAuth(signA.tokens.token);b.setAuth(signB.tokens.token);checks.anonymousSignIn=true;
 const otherBefore=await b.query(api.preferences.mine,{});
 await a.mutation(api.preferences.setInterests,{topicIds:['opensource']});
 const talkId=talks[0]?.id,personId=people[0]?.id;if(!talkId||!personId)throw new Error('Seed catalog is empty');
 const saved=await a.mutation(api.preferences.toggleBookmark,{talkId});
 const met=await a.mutation(api.preferences.markMet,{personId});
 const stored=await a.query(api.preferences.mine,{});
 checks.persistence=stored.topicIds.length===1&&stored.topicIds[0]==='opensource'&&stored.bookmarks.includes(talkId);
 checks.connections=met&&stored.met.includes(personId);
 const savedAgain=await a.mutation(api.preferences.toggleBookmark,{talkId});
 const after=await a.query(api.preferences.mine,{});checks.bookmarkToggle=saved&&!savedAgain&&!after.bookmarks.includes(talkId);
 const other=await b.query(api.preferences.mine,{});checks.isolatedIdentities=JSON.stringify(other)===JSON.stringify(otherBefore);
 try{await guest.mutation(api.preferences.toggleBookmark,{talkId});}catch{checks.unauthorizedWriteRejected=true;}
 await a.action(api.auth.signOut,{});await b.action(api.auth.signOut,{});
 await writeFile('auth-verification.json',JSON.stringify({...checks,checkedAt:new Date().toISOString()},null,2));
 for(const [key,pass] of Object.entries(checks))console.log(`${pass?'PASS':'FAIL'} ${key}`);
 if(Object.values(checks).some(pass=>!pass))process.exitCode=1;
}
main().catch(()=>{console.error('FAIL Authentication check; no tokens or secret values logged');process.exitCode=1;});
