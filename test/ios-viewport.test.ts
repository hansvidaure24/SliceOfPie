import { describe, it, expect } from 'vitest';
import { launchGap } from '../src/ios-viewport';

// iPhone 15: a 393 x 852 screen, with a 59pt status bar
const iphone = { screenW: 393, screenH: 852, innerW: 393 };

describe('how far bottom bars sit too high at launch', () => {
  it('is the status bar when iOS lays the app out one status bar short', () => {
    expect(launchGap({ ...iphone, portrait: true, fixedBottom: 793 })).toBe(59);
  });

  it('is nothing once iOS has put it right', () => {
    expect(launchGap({ ...iphone, portrait: true, fixedBottom: 852 })).toBe(0);
  });

  it('reads the screen sideways in landscape', () => {
    expect(launchGap({ ...iphone, innerW: 852, portrait: false, fixedBottom: 393 })).toBe(0);
    expect(launchGap({ ...iphone, innerW: 852, portrait: false, fixedBottom: 373 })).toBe(20);
  });

  it('leaves a window narrower than the screen alone, like iPad split view', () => {
    expect(launchGap({ screenW: 1024, screenH: 1366, innerW: 678, portrait: true, fixedBottom: 1300 })).toBe(0);
  });

  it('ignores anything bigger than a status bar', () => {
    expect(launchGap({ ...iphone, portrait: true, fixedBottom: 500 })).toBe(0);
  });
});
