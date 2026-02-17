import * as path from 'node:path';
import Mocha from 'mocha';
import { globSync } from 'glob';

export async function run(): Promise<void> {
  require('ts-node/register/transpile-only');

  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 10000
  });

  const testsRoot = path.resolve(__dirname, '../../../src/test/suite');
  const testFiles = globSync('**/*.test.ts', { cwd: testsRoot });

  for (const file of testFiles) {
    mocha.addFile(path.resolve(testsRoot, file));
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed.`));
        return;
      }

      resolve();
    });
  });
}
