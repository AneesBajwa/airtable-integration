import { EventEmitter } from 'node:events';

// Hands an MFA code from `POST /scraper/mfa` to the Playwright job paused on
// the MFA prompt. Single-process API only — no cross-instance fan-out.
class MfaBus extends EventEmitter {
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

  submitCode(sessionKey: string, code: string): boolean {
    return this.emit(`mfa:${sessionKey}`, code);
  }
}

export const mfaBus = new MfaBus();
