import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
// Run against a served Expo web export (default http://127.0.0.1:8083).
// This creates two isolated test identities and exercises the deployed backend.
await mkdir('work', {recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const opts={viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'};
const ca=await browser.newContext(opts),cb=await browser.newContext(opts);
const a=await ca.newPage(),b=await cb.newPage();
const errors=[],checks=[];
const base=process.env.MOBILE_TEST_URL || 'http://127.0.0.1:8083';
for(const p of [a,b]){p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(40000);}
async function profile(p,name){await p.goto(base);await p.getByRole('tab',{name:'Network',exact:true}).click();await p.getByLabel('YOUR NAME',{exact:true}).fill(name);await p.getByLabel('WHAT YOU DO',{exact:true}).fill('Building thoughtful AI tools');await p.getByLabel('WHAT BRINGS YOU HERE',{exact:true}).fill('Meet collaborators working on AI agents');await p.getByRole('checkbox',{name:'Session interest AI & agents',exact:true}).click();await p.getByRole('checkbox',{name:'Network area AI & agents',exact:true}).click();await p.getByRole('button',{name:'Save my profile',exact:true}).click();await p.getByText(name,{exact:true}).waitFor();await p.getByRole('button',{name:'More connection options',exact:true}).click();}
try{
 await profile(a,'Avery UI Check');await profile(b,'Jordan UI Check');checks.push('Independent phone profiles saved');
 await a.getByRole('button',{name:'Create my invite code',exact:true}).click();
 const invite=a.getByText(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);await invite.waitFor();const code=(await invite.innerText()).trim();
 await b.getByLabel('Connection invite code',{exact:true}).fill(code);await b.getByLabel('Send connection request',{exact:true}).click();
 await b.getByText('Waiting for their approval',{exact:true}).waitFor();await b.getByRole('tab',{name:'Orbit',exact:true}).click();await b.getByText('Personal',{exact:true}).click();
 await a.getByRole('button',{name:'Accept',exact:true}).click();
 await b.getByRole('button',{name:'Explore context Avery UI Check',exact:true}).waitFor({timeout:90000});assert.equal(await b.getByTestId('private-context-graph').locator('path').count(),3);await b.screenshot({path:'work/mobile-new-connection.png'});checks.push('Newly accepted peer appears in private context with only returned relationships');await b.getByRole('tab',{name:'Network',exact:true}).click();
 await b.getByText('Avery UI Check',{exact:true}).waitFor();checks.push('Invite request and mutual connection accepted');
 await a.getByRole('button',{name:'Open connection with Jordan UI Check',exact:true}).click();await a.getByLabel('CONVERSATION NOTE',{exact:true}).fill('We discussed AI agents and agreed to reconnect about building useful developer tools.');await a.getByRole('checkbox',{name:'Context topic AI & agents',exact:true}).click();
 await a.getByRole('button',{name:'Save & request their approval',exact:true}).click();await a.getByText('WAITING FOR THEIR APPROVAL',{exact:true}).waitFor();
 await b.getByRole('button',{name:'Open connection with Avery UI Check',exact:true}).click();await b.getByRole('button',{name:'Approve note',exact:true}).click();await b.getByText('BOTH APPROVED',{exact:true}).waitFor();checks.push('Reviewed note approved by both phones');
 await b.screenshot({path:'work/mobile-network-approved.png'});
 await a.getByRole('button',{name:'Demo controls',exact:true}).click();
 await a.getByLabel('DEMO POST',{exact:true}).fill('Looking for collaborators on an AI agent developer tools project. Let’s build something useful.');await a.getByRole('button',{name:'Publish simulated update',exact:true}).click();
 await a.getByText('Simulation · authored by you',{exact:true}).waitFor();checks.push('Simulation published and correctly labeled');
 await b.getByRole('tab',{name:'Feed',exact:true}).click();await b.getByRole('button',{name:'A thoughtful way to reach out',exact:true}).first().waitFor({timeout:90000});await b.getByText('Live FalkorDB path',{exact:true}).waitFor();await b.waitForTimeout(3300);await b.screenshot({path:'work/mobile-feed.png'});
 await b.getByRole('button',{name:'A thoughtful way to reach out',exact:true}).first().click();await b.getByText('DRAFT FOR YOU · NOT SENT',{exact:true}).waitFor();
 await b.getByRole('button',{name:'Why this connects',exact:true}).click();await b.getByText('Returned graph path',{exact:false}).waitFor();checks.push('Returned graph feed, unsent draft and proof detail render');
 const directions=await Promise.all([0,1,2,3].map(i=>b.getByTestId(`social-proof-edge-${i}`).getAttribute('aria-label')));assert.match(directions[0],/^Forward: HAS_SKILL,/);assert.match(directions[1],/^Reverse: DISCUSSED,/);assert.match(directions[2],/^Reverse: REMEMBERS,/);assert.match(directions[3],/^Forward: WROTE,/);checks.push('Proof preserves traversal order and actual directed relationships');
 await b.getByTestId('social-proof').scrollIntoViewIfNeeded();await b.screenshot({path:'work/mobile-feed-proof.png'});
 await b.getByRole('tab',{name:'Orbit',exact:true}).click();await b.getByText('Personal',{exact:true}).click();await b.getByRole('button',{name:'Explore context Avery UI Check',exact:true}).waitFor();checks.push('Accepted contact appears in personal graph');
 const globe=b.getByLabel('Interactive private context graph. Drag to rotate; tap a node to explore.',{exact:true});const before=await globe.locator('svg path').first().getAttribute('d');const box=await globe.boundingBox();await b.mouse.move(box.x+box.width/2,box.y+box.height/2);await b.mouse.down();await b.mouse.move(box.x+box.width/2+65,box.y+box.height/2+20,{steps:8});await b.mouse.up();const after=await globe.locator('svg path').first().getAttribute('d');assert.notEqual(before,after);checks.push('Dragging changes projected 3D graph geometry');
 await b.screenshot({path:'work/mobile-personal-orbit.png'});
 await b.getByRole('button',{name:'Explore context Avery UI Check',exact:true}).click();await b.getByRole('button',{name:'Open this connection',exact:true}).click();await b.getByLabel('CONVERSATION NOTE',{exact:true}).waitFor();checks.push('Personal graph detail opens selected relationship');
 await b.getByRole('button',{name:'Revoke sharing',exact:true}).click();await b.getByText('BOTH APPROVED',{exact:true}).waitFor({state:'hidden'});await b.getByRole('tab',{name:'Feed',exact:true}).click();await b.getByText('The right reason to reach out.',{exact:true}).waitFor();checks.push('Revoking shared memory removes feed card');
 assert.deepEqual(errors,[]);await writeFile('work/mobile-social-ui-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}catch(e){await a.screenshot({path:'work/mobile-social-a-failure.png'});await b.screenshot({path:'work/mobile-social-b-failure.png'});console.log(JSON.stringify({checks,errors,phoneA:(await a.locator('body').innerText()).slice(0,4500),phoneB:(await b.locator('body').innerText()).slice(0,4500)},null,2));throw e;}finally{await browser.close();}
