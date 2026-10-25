import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
// Chromium synthetic device; never opens the computer's real microphone/camera.
await mkdir('work',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const context=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],reducedMotion:'reduce'});
const page=await context.newPage(),errors=[],checks=[];
page.setDefaultTimeout(45000); page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  window.captureTestTracks=[];
  const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async (...args)=>{const stream=await original(...args);window.captureTestTracks.push(...stream.getTracks());return stream;};
});
async function openCapture(){
  await page.getByRole('tab',{name:'Discover',exact:true}).click();
  await page.getByRole('button',{name:/^Open session /}).first().click();
  await page.getByRole('button',{name:'Capture this session',exact:true}).click();
  await page.getByRole('checkbox',{name:'Confirm capture and AI processing consent',exact:true}).click();
}
try {
  await page.goto(process.env.MOBILE_TEST_URL || 'http://127.0.0.1:8084');
  await openCapture();
  await page.getByRole('button',{name:'Record up to 90 seconds',exact:true}).click();
  await page.getByText('● Recording now · stops at 90 seconds or when you leave this screen',{exact:true}).waitFor();
  await page.waitForTimeout(1500);
  await page.getByRole('button',{name:/^Stop recording/}).click();
  await page.getByText('Audio attached · not uploaded yet',{exact:true}).waitFor();
  assert.ok((await page.evaluate(()=>window.captureTestTracks.map(t=>t.readyState))).every(v=>v==='ended'));
  checks.push('Real browser MediaRecorder with synthetic microphone saves an attachment and releases all tracks on stop');
  const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64');
  for(let i=0;i<3;i++){
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose photo',exact:true}).click();
    await (await chooser).setFiles({name:`capture-test-${i}.png`,mimeType:'image/png',buffer:pixel});
    await page.getByRole('button',{name:`Remove photo ${i+1}`,exact:true}).waitFor();
  }
  assert.equal(await page.getByRole('button',{name:'Choose photo',exact:true}).isEnabled(),false);
  await page.getByRole('button',{name:'Remove photo 3',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Choose photo',exact:true}).isEnabled(),true);
  checks.push('Photo picker attaches images, caps at three and restores capacity after removal');
  await page.getByLabel('Capture notes',{exact:true}).fill('Synthetic media UI verification. This is a test capture, not a real conference recording.');
  const uploads=[];page.on('response',r=>{if(r.url().includes('/capture-upload?'))uploads.push({status:r.status(),contentType:r.request().headers()['content-type']});});
  await page.getByRole('button',{name:'Create a draft for my review',exact:true}).click();
  await page.getByLabel('Review capture summary',{exact:true}).waitFor({timeout:200000});
  assert.equal(uploads.length,3);assert.ok(uploads.every(r=>r.status===200));
  assert.ok(uploads.some(r=>r.contentType.startsWith('audio/')));
  checks.push('Authenticated UI uploads one synthetic audio clip and two PNGs with actual MIME types, then presents review');
  await page.getByRole('button',{name:'Remove this capture',exact:true}).click();
  await page.getByRole('button',{name:'Confirm remove capture & raw media',exact:true}).click();
  await openCapture();
  await page.getByRole('button',{name:'Record up to 90 seconds',exact:true}).click();
  await page.getByText('● Recording now · stops at 90 seconds or when you leave this screen',{exact:true}).waitFor();
  await page.waitForTimeout(500);await page.getByRole('button',{name:'Close capture',exact:true}).click();
  await page.getByRole('button',{name:'Close capture',exact:true}).waitFor({state:'hidden'});
  assert.ok((await page.evaluate(()=>window.captureTestTracks.map(t=>t.readyState))).every(v=>v==='ended'));
  checks.push('Closing active capture stops recording and releases every microphone track');
  assert.deepEqual(errors,[]);
  const result={checkedAt:new Date().toISOString(),checks,uploads,errors,limitations:['Synthetic Chromium device only; physical iOS/Android Expo Go microphone/camera still needs device verification','90-second bound enforced by SDK duration and app timer; full 90-second wall-clock recording not run']};
  await writeFile('work/mobile-media-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(e){await page.screenshot({path:'work/phase4-media-failure.png'});console.log(JSON.stringify({checks,errors,body:(await page.locator('body').innerText()).slice(-12000)},null,2));throw e;}finally{await browser.close();}
