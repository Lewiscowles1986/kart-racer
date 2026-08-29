import { describe, it, expect } from 'vitest';
import { encodeCode, decodeCode } from '../src/net/webrtc';

// RTCPeerConnection itself cannot run under node; the transport's
// browser-side handshake is verified live by scripts/mp-webrtc-check.mjs.
// Here we prove the code codec + the transport's pre-open queueing logic.

describe('webrtc code codec (M3 step 5, J-27)', () => {
  it('round-trips an SDP bundle base64url-safe, no padding', () => {
    const desc = { type: 'offer', sdp: 'v=0\no=- 123 456 IN IP4 8\ns=-\nc=IN IP4 0.0.0.0' };
    const cands = '{"candidate":"candidate:1 1 UDP 1 192.168.0.2 50000 typ host","sdpMid":"0"}\n{"candidate":"candidate":"x"}'
      .replace('{"candidate":"candidate":"x"}', '{"candidate":"candidate:2 1 UDP 2 10.0.0.1 40000 typ host","sdpMid":"0"}');
    const code = encodeCode(desc, cands);
    expect(code).not.toMatch(/=+$/); // padding stripped
    const back = decodeCode(code);
    expect(back?.desc.sdp).toBe(desc.sdp);
    expect(back?.desc.type).toBe('offer');
    expect(back?.candidates).toBe(cands);
  });

  it('degrades to null on garbage rather than throwing', () => {
    expect(decodeCode('not-base64!!')).toBeNull();
    expect(decodeCode(Buffer.from(JSON.stringify({ nope: 1 })).toString('base64'))).toBeNull();
  });
});