import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const sourcemap = true;

async function buildExtension() {
  const context = await esbuild.context({
    bundle: true,
    entryPoints: ['src/extension.ts'],
    external: ['vscode'],
    format: 'cjs',
    outfile: 'dist/extension.js',
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
