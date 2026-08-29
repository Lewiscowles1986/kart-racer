// Verifies the WebRTC manual-SDP handshake + message exchange between two
// pages (no signalling server; LAN host candidates). Listeners attach BEFORE
// the handshake completes so no message can be missed.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const host = await ctx.newPage();
const guest = await ctx.newPage();
await host.goto('http://localhost:5174/?debug', { waitUntil: 'networkidle' });
await guest.goto('http://localhost:5174/?debug', { waitUntil: 'networkidle' });

// 1. host: create offer; listener attached in the same context
const { offerCode, hostGotP } = await host.evaluate(async () => {
  const { WebRtcTransport } = await import('/src/net/webrtc.ts');
  const { transport, offerCode, finish } = await WebRtcTransport.hostOffer({ id: 'host', room: 'wb3' });
  window.__recv = [];
  transport.onMessage((m, from) => window.__recv.push(m.t + '@' + from));
  window.__finish = finish;
  window.__openP = new Promise((r) => { transport.onOpen = () => r('OPEN'); setTimeout(() => r('no-open'), 8000); });
  return { offerCode };
});
console.log('offer code bytes:', offerCode.length);

// 2. guest: paste offer -> answer code; listener LIVE before answer reaches host
const { answerCode, guestGotP } = await guest.evaluate(async (code) => {
  const { WebRtcTransport } = await import('/src/net/webrtc.ts');
  const { transport, answerCode } = await WebRtcTransport.guestAnswer({ id: 'guest', room: 'wb3' }, code);
  window.__wt = transport;
  window.__recv = [];
  transport.onMessage((m, from) => window.__recv.push(m.t + '@' + from));
  window.__openP = new Promise((r) => { transport.onOpen = () => r('OPEN'); setTimeout(() => r('no-open'), 8000); });
  // send as soon as the channel opens (queue is flushed by the transport)
  transport.onOpen = () => { transport.send({ t: 'GUEST-HELLO', reliable: true, payload: 1 }); window.__openResolved || (window.__openResolved = true, window.__openRes('OPEN')); };
  window.__openRes = (v) => {};
  window.__openP = new Promise((r) => { window.__openRes = r; setTimeout(() => r('no-open'), 8000); });
  transport.onOpen = () => { transport.send({ t: 'GUEST-HELLO', reliable: true, payload: 1 }); window.__openRes('OPEN'); };
  return { answerCode };
}, offerCode);
console.log('answer code bytes:', answerCode.length);

// 3. host finishes; message exchange happens automatically
const hostOpen = await host.evaluate(async (code) => {
  await window.__finish(code);
  return await window.__openP;
}, answerCode);
const guestGot = await guest.evaluate(() => window.__openP);
await host.waitForTimeout(1500);
const hostRecv = await host.evaluate(() => window.__recv.join(','));
const guestRecv = await guest.evaluate(() => window.__recv.join(','));
console.log('host open:', hostOpen, '| guest open:', await guest.evaluate(() => window.__openP));
console.log('host received:', hostRecv || '(none)');
console.log('guest received:', guestGot || '(none)');
const ok = (hostOpen === 'OPEN') && hostRecv.includes('GUEST-HELLO');
console.log(ok ? 'WEBRTC-OK' : 'WEBRTC-FAIL');
await browser.close();
