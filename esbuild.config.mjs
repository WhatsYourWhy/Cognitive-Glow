import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const context = await esbuild.context({
  entryPoints: ['plugin/main.ts'],
  bundle: true,
  format: 'cjs',
  target: 'es2018',
  outfile: 'plugin/main.js',
  sourcemap: watch,
  external: ['obsidian']
});

if (watch) {
  await context.watch();
  console.log('Watching for changes...');
} else {
  await context.rebuild();
  await context.dispose();
}
