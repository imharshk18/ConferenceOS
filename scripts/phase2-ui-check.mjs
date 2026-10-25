import {chromium} from 'playwright';
import {ConvexHttpClient} from 'convex/browser';
import {anyApi as api} from 'convex/server';
import {config} from 'dotenv';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
config({path:'.env.local',quiet:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const deskContext=await browser.newContext({viewport:{width:1440,height:1000}}),phoneContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const desktop=await deskContext.newPage(),phone=await phoneContext.newPage();const errors=[],checks={};let phoneApi,sessionId;
for(const p of [desktop,phone])p.on('pageerror',e=>errors.push(e.message));
async function setTopics(ids){await phone.getByLabel('Edit your interests',{exact:true}).click();for(const [id,label] of [['ai','AI & agents'],['opensource','Open source'],['platform','Platform engineering'],['security','Security'],['graph','Knowledge graphs'],['devex','Developer experience']]){const c=phone.getByRole('checkbox',{name:label,exact:true});if((await c.getAttribute('aria-checked')==='true')!==ids.includes(id))await c.click();}await phone.getByText('Find my connections',{exact:true}).click();await phone.getByLabel('Close details').last().waitFor({state:'hidden'});}
async function until(read,accept){for(let i=0;i<50;i++){const v=await read();if(accept(v))return v;await new Promise(r=>setTimeout(r,350));}throw new Error('State did not converge');}
try{
 await Promise.all([desktop.goto('http://localhost:5173',{waitUntil:'networkidle'}),phone.goto('http://localhost:8082')]);
 await phone.getByText('Live graph',{exact:false}).first().waitFor({timeout:45000});
 await desktop.locator('.sidebar nav').getByRole('button',{name:/The constellation/}).click();
 await desktop.getByTestId('stage-toggle').click();
 await desktop.getByTestId('pair-phone').click();
 const code=(await desktop.getByTestId('pairing-code').innerText()).trim();assert.match(code,/^\d{6}$/);
 await phone.getByRole('tab',{name:'Orbit',exact:true}).click();await phone.getByLabel('Manage desktop presentation sharing').click();
 const consent=phone.getByRole('dialog');await consent.getByLabel('Desktop pairing code').fill(code);
 await consent.getByRole('checkbox',{name:'Share AI & agents',exact:true}).click();await consent.getByRole('checkbox',{name:'Share Open source',exact:true}).click();
 await consent.getByRole('button',{name:'Share approved topics',exact:true}).click();
 await desktop.getByTestId('presentation-panel').locator('text=A path, shared live').waitFor({timeout:30000});checks.independentPhoneDesktopPaired=true;
 const token=await phone.evaluate(()=>localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('__convexAuthJWT_'))));assert.ok(token);phoneApi=new ConvexHttpClient(process.env.CONVEX_URL);phoneApi.setAuth(token);
 sessionId=(await phoneApi.query(api.presentation.mine,{})).sessionId;
 const previous=await phoneApi.query(api.preferences.mine,{});
 await phone.getByLabel('Close details').last().click();await phone.getByLabel('Close details').last().waitFor({state:'hidden'});
 await setTopics(['opensource']);
 const state=await until(()=>phoneApi.query(api.intelligence.mine,{}),s=>s.status==='ready'&&s.revision>previous.revision);
 await desktop.waitForFunction(rev=>document.querySelector('[data-testid="presentation-panel"]')?.getAttribute('data-revision')===String(rev),state.revision,{timeout:30000});
 await desktop.getByTestId('graph-explorer').waitFor({state:'visible'});
 await desktop.waitForFunction(()=>document.querySelector('[data-testid="graph-explorer"]')?.getAttribute('data-animation-complete')==='true',null,{timeout:30000});
 const graph=desktop.getByTestId('graph-explorer');const nodeIds=JSON.parse(await graph.getAttribute('data-proof-node-ids')),edgeIds=JSON.parse(await graph.getAttribute('data-proof-edge-ids'));
 const expected=state.talks.find(r=>JSON.stringify(r.proof.traversalNodeIds)===JSON.stringify(nodeIds));assert.ok(expected);assert.deepEqual(edgeIds,expected.proof.edges.map(e=>e.id));checks.mobileInterestAutomaticallyUpdatesDesktop=true;checks.desktopAnimationCompletes=true;checks.animatedNodesAndEdgesEqualReturnedProof=true;
 const trail=desktop.getByTestId('exact-proof');assert.deepEqual(JSON.parse(await trail.getAttribute('data-path-node-ids')),expected.proof.traversalNodeIds);
 for(const edge of expected.proof.edges){const el=trail.locator(`[data-edge-id="${edge.id}"]`);assert.equal(await el.getAttribute('data-source'),edge.source);assert.equal(await el.getAttribute('data-target'),edge.target);assert.equal(await el.getAttribute('data-kind'),edge.kind);}checks.explanationPreservesDirectedRelationships=true;
 const text=await desktop.locator('body').innerText();for(const name of ['Harsh Kadodwala','Abhinav Kumar','Aimen Moten','Gabby Landry','Sagar Shah','Vida Stanić'])assert.ok(!text.includes(name));assert.equal(await desktop.locator('.sidebar,.topbar,.profile-button,.interests-modal,.person-card').count(),0);checks.stageExcludesPersonalProfilesAndPrivateChrome=true;
 await desktop.screenshot({path:'phase2-desktop-preview.png',fullPage:true});await phone.screenshot({path:'phase2-mobile-preview.png'});
 await deskContext.setOffline(true);await desktop.getByText('Connection paused',{exact:true}).waitFor({timeout:30000});assert.deepEqual(JSON.parse(await graph.getAttribute('data-proof-node-ids')),[]);checks.desktopDisconnectHidesStaleProof=true;
 await deskContext.setOffline(false);await desktop.getByText('A path, shared live',{exact:true}).waitFor({timeout:30000});
 await phone.getByRole('tab',{name:'Orbit',exact:true}).click();await phone.getByLabel('Manage desktop presentation sharing').click();
 await phone.getByRole('button',{name:'Revoke presentation sharing',exact:true}).click();
 await desktop.getByText('Sharing ended',{exact:true}).waitFor({timeout:30000});assert.deepEqual(JSON.parse(await graph.getAttribute('data-proof-node-ids')),[]);checks.mobileRevocationClearsDesktopAutomatically=true;
 assert.deepEqual(errors,[]);checks.noUncaughtBrowserErrors=true;
 await writeFile('phase2-ui-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),device:'Isolated Chrome desktop + mobile viewport; physical iPhone confirmation remains manual',revision:state.revision,checks,errors},null,2));console.log(JSON.stringify(checks,null,2));
}catch(e){await desktop.screenshot({path:'work/phase2-desktop-failure.png',fullPage:true});await phone.screenshot({path:'work/phase2-phone-failure.png',fullPage:true});console.log('Checks completed',checks,'Browser exceptions',errors);throw e;}finally{if(phoneApi&&sessionId)await phoneApi.mutation(api.presentation.revoke,{sessionId}).catch(()=>{});await browser.close();}
