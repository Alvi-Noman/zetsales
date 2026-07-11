import esbuild from 'esbuild';
import { cpSync, mkdirSync, existsSync, rmSync } from 'fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

if (existsSync(outdir)) rmSync(outdir, { recursive: true });
mkdirSync(outdir, { recursive: true });

cpSync('manifest.json', `${outdir}/manifest.json`);
cpSync('src/options/index.html', `${outdir}/options.html`);
cpSync('icons', `${outdir}/icons`, { recursive: true });

const common = { bundle: true, sourcemap: true, target: 'chrome110', logLevel: 'info' };

// Content scripts and the options page load as classic (non-module) scripts, so they're bundled
// as IIFEs. The background service worker is declared "type": "module" in the manifest, so it can
// be bundled as ESM.
const iifeOptions = {
  ...common,
  entryPoints: { content: 'src/content/index.ts', options: 'src/options/index.ts' },
  outdir,
  format: 'iife',
};
const esmOptions = {
  ...common,
  entryPoints: { background: 'src/background/index.ts' },
  outdir,
  format: 'esm',
};

if (watch) {
  const [iifeCtx, esmCtx] = await Promise.all([esbuild.context(iifeOptions), esbuild.context(esmOptions)]);
  await Promise.all([iifeCtx.watch(), esmCtx.watch()]);
  console.log('Watching apps/productimporter for changes...');
} else {
  await Promise.all([esbuild.build(iifeOptions), esbuild.build(esmOptions)]);
}
