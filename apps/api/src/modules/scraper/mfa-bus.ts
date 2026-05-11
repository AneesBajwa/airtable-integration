import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub for handing an MFA code from `POST /scraper/mfa` to the
 * Playwright job paused on the MFA prompt (single-process API only).
 */
class MfaBus extends EventEmitter {
  /** Resolves with the next code submitted for `sessionKey`, or rejects on timeout. */
  waitForCode(sessionKey: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const event = `mfa:${sessionKey}`;
      const timer = setTimeout(() => {
        this.off(event, handler);
        reject(new Error('MFA wait timed out'));
      }, timeoutMs);
      const handler = (code: string): void => {
        clearTimeout(timer);
        resolve(code);
      };
      this.once(event, handler);
    });
  }

  /** Returns true when a listener is currently awaiting a code. */
  submitCode(sessionKey: string, code: string): boolean {
    return this.emit(`mfa:${sessionKey}`, code);
  }
}

export const mfaBus = new MfaBus();
