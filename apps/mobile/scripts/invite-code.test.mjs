import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationPayload, parseInvitationPayload } from '../inviteCode.ts';
import { friendlyError } from '../friendlyError.ts';
test('round-trips the exact invitation payload',()=>{assert.equal(invitationPayload('ABCD2345'),'conferenceos://connect?code=ABCD2345');assert.equal(parseInvitationPayload(invitationPayload('ABCD2345')),'ABCD2345');});
test('rejects arbitrary links, extra fields, ambiguous or oversized QR input',()=>{for(const value of ['https://example.com/?code=ABCD2345','conferenceos://connect?code=ABCD2345&redirect=https://example.com','conferenceos://connect?code=ABCD2345#x','conferenceos://connect/?code=ABCD2345','conferenceos://connect?code=abcd2345','conferenceos://connect?code=ABCD0123','ABCD2345','conferenceos://connect?code='+ 'A'.repeat(1000)])assert.equal(parseInvitationPayload(value),null);});
test('generator rejects malformed invitation codes',()=>{assert.throws(()=>invitationPayload('not-code'));assert.throws(()=>invitationPayload('ABCD2345\n'));});
test('Expo Go and web links are accepted only for the locally supplied runtime base',()=>{
 for(const base of ['exp://192.168.1.5:8081/--/connect','exps://demo.exp.direct/--/connect','http://localhost:8085/']) {
  const url=invitationPayload('ABCD2345',base);assert.equal(parseInvitationPayload(url,base),'ABCD2345');assert.equal(parseInvitationPayload(url+'#x',base),null);assert.equal(parseInvitationPayload(url+'&redirect=https://example.com',base),null);
 }
 assert.equal(parseInvitationPayload('exp://evil.example/--/connect?code=ABCD2345','exp://192.168.1.5:8081/--/connect'),null);
 assert.throws(()=>invitationPayload('ABCD2345','javascript://bad'));
});
test('shows actionable validation errors without developer traces',()=>{
  assert.equal(friendlyError(new Error('[CONVEX M(captures:create)] Server Error\nUncaught Error: Wait a moment before creating another capture\n at handler (...)'),'Try again'),'Wait a moment before creating another capture');
  assert.equal(friendlyError(new Error('[CONVEX M(x)] Server Error'),'Try again'),'Try again');
  assert.equal(friendlyError(new Error('Choose a photo under 4 MB.'),'Try again'),'Choose a photo under 4 MB.');
});
