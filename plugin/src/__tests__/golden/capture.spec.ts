/**
 * Golden-baseline CAPTURE mode.
 *
 * Run explicitly via `pnpm run golden:capture` (plugin workspace).
 * Writes plugin/src/__tests__/golden/expected/golden.json — the committed baseline
 * representing the behavior of the current code. Only run this when the change is
 * INTENTIONAL; the golden diff is the review artifact.
 *
 * The suite is inert unless capture was explicitly requested: `testMatch` also
 * matches this file on a plain `jest` run (it sorts before `compare.spec.ts`),
 * and an ungated capture would silently overwrite the committed baseline with
 * the current code's output — the compare gate would then pass by construction.
 */
import * as fs from 'fs';
import * as path from 'path';

import { captureAll } from './harness';

const captureRequested = process.env.GOLDEN_CAPTURE === '1'
  || process.argv.some((arg) => arg.includes('golden/capture.spec'));

describe('golden capture', () => {
  it('writes the golden baseline file', async () => {
    if (!captureRequested) {
      return;
    }

    const state = await captureAll();
    const target = path.join(__dirname, 'expected', 'golden.json');

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

    // Deliberate assertion: the captured state must contain every fixture.
    expect(Object.keys(state))
      .toHaveLength(6);
  });
});
