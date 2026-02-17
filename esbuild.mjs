import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const sourcemap = true;

async function buildExtension() {
  const context = await esbuild.context({
    bundle: true,
    entryPoints: {
      extension: 'src/extension.ts',
      'test/runTest': 'src/test/runTest.ts',
      'test/suite/index': 'src/test/suite/index.ts'
    },
    external: [
      'vscode',
      '@vscode/test-electron',
      'glob',
      'mocha',
      'ts-node/register/transpile-only'
    ],
    format: 'cjs',
    outdir: 'dist',
    platform: 'node',
    sourcemap,
    target: 'node18'
  });

  if (watch) {
    await context.watch();
    return context;
  }

  await context.rebuild();
  await context.dispose();
  return undefined;
}

async function buildWebview() {
  const context = await esbuild.context({
    bundle: true,
    entryPoints: ['media/session-manager/sessionManager.ts'],
    format: 'iife',
    outfile: 'dist/webview/sessionManager.js',
    platform: 'browser',
    sourcemap,
    target: 'es2022'
  });

  if (watch) {
    await context.watch();
    return context;
  }

  await context.rebuild();
  await context.dispose();
  return undefined;
}

async function main() {
  const extensionContext = await buildExtension();
  const webviewContext = await buildWebview();

  if (watch) {
    process.stdin.resume();

    const dispose = async () => {
      await Promise.all([
        extensionContext?.dispose(),
        webviewContext?.dispose()
      ]);
      process.exit(0);
    };

    process.on('SIGINT', () => {
      void dispose();
    });

    process.on('SIGTERM', () => {
      void dispose();
    });
  }
}

void main();
