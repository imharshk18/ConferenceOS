import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
export const webhook=httpAction(async(ctx,request)=>{
  // Reject oversized notifications before JSON parsing. Never log raw bodies or callback capabilities.
  if(Number(request.headers.get('content-length')??0)>150_000)return new Response(null,{status:413});
  const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400});
  let size=0,text='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>150_000){await reader.cancel();return new Response(null,{status:413});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
  const token=new URL(request.url).searchParams.get('token');
  if(!token||token.length!==72)return new Response(null,{status:401});
  try{
    const body=JSON.parse(text);if(typeof body.call_id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(body.call_id))return new Response(null,{status:400});
    // Optional defense-in-depth when a Bland signing secret is configured. The provider GET is always required.
    const secret=process.env.BLAND_WEBHOOK_SECRET;
    if(secret){const signature=request.headers.get('x-webhook-signature')??'';if(!/^[a-f0-9]{64}$/i.test(signature))return new Response(null,{status:401});
      const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
      const bytes=new Uint8Array(signature.match(/../g)!.map(x=>parseInt(x,16)));
      const valid=await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(text))||await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(JSON.stringify(body)));
      if(!valid)return new Response(null,{status:401});}
    await ctx.runMutation(internal.onboarding.notification,{token,callId:body.call_id});
    return new Response(null,{status:202});
  }catch{return new Response(null,{status:400});}
});
