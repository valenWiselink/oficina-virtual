const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Extension version read from package.json at build time, inlined via esbuild `define`. */
const pkgVersion = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'),
).version;
const versionDefine = {
  'process.env.PIXEL_AGENTS_VERSION': JSON.stringify(pkgVersion),
};

/**
 * Copy assets folder to dist/assets
 */
function copyAssets() {
  const srcDir = path.join(__dirname, 'webview-ui', 'public', 'assets');
  const dstDir = path.join(__dirname, 'dist', 'assets');

  if (fs.existsSync(srcDir)) {
    // Remove existing dist/assets if present
    if (fs.existsSync(dstDir)) {
      fs.rmSync(dstDir, { recursive: true });
    }

    // Copy recursively
    fs.cpSync(srcDir, dstDir, { recursive: true });
    console.log('✓ Copied assets/ → dist/assets/');
  } else {
    console.log('ℹ️  assets/ folder not found (optional)');
  }
}

/**
 * Bundle hook scripts (TypeScript) to dist/hooks via esbuild.
 * Produces a self-contained CJS file with shebang for Claude Code to execute.
 */
function buildHooks() {
  const entry = path.join(
    __dirname,
    'server',
    'src',
    'providers',
    'hook',
    'claude',
    'hooks',
    'claude-hook.ts',
  );
  if (!fs.existsSync(entry)) return;
  require('esbuild').buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outdir: path.join(__dirname, 'dist', 'hooks'),
    banner: { js: '#!/usr/bin/env node' },
  });
  console.log('✓ Built hooks/ → dist/hooks/');
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  // The office is the standalone server (dist/cli.js) plus the hook script it
  // installs and the character sprites the webview draws.
  copyAssets();
  buildHooks();
  if (watch) {
    const ctx = await esbuild.context({ ...cliOptions(), plugins: [esbuildProblemMatcherPlugin] });
    await ctx.watch();
  } else {
    await esbuild.build(cliOptions());
  }
}

/** Bundle options for the standalone CLI entry point (the office server). */
function cliOptions() {
  return {
    entryPoints: ['server/src/cli.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    platform: 'node',
    outfile: 'dist/cli.js',
    external: [
      'fastify',
      '@fastify/websocket',
      '@fastify/static',
      '@fastify/cors',
      // Native PTY modules: they ship platform-specific .node binaries that
      // cannot be bundled, and they're OPTIONAL -- esbuild must not fail the
      // build when they're absent, and the runtime require() must be left
      // intact so its failure can be caught and degraded gracefully.
      // See server/src/terminal/ptyModule.ts.
      '@lydell/node-pty',
      'node-pty',
    ],
    define: versionDefine,
    logLevel: 'silent',
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
