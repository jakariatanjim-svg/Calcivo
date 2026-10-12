/**
 * Bundles the web app into `www/`, which is the directory Capacitor ships
 * inside the APK, and stamps it with the build metadata.
 *
 *   node scripts/build-web.mjs          production bundle (minified)
 *   node scripts/build-web.mjs --dev    development bundle (readable, sourcemap)
 *
 * Build metadata is injected through environment variables so a local run and a
 * GitHub Actions run produce the same layout:
 *
 *   BUILD_VERSION     overrides the version from version.json (CI passes the
 *                     version computed by scripts/version.mjs)
 *   BUILD_VARIANT     developer | release
 *   BUILD_COMMIT      short git sha
 *   BUILD_TIME        ISO timestamp of the build
 *   GITHUB_REPOSITORY owner/repo, used by the in-app updater
 *   OUT_DIR           output directory, `www` by default. The dev server points
 *                     it somewhere else so a development build never replaces
 *                     the production bundle that is committed and shipped.
 */

import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

import { readVersionInfo } from './version.mjs';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const outDir = path.resolve(root, process.env.OUT_DIR || 'www');
const isDev = process.argv.includes('--dev');

const STATIC_FILES = ['index.html', 'styles.css', 'manifest.webmanifest'];

/** owner/repo of the update channel: CI env first, then the git origin. */
function detectRepository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY.trim();
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    const match = remote.match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
    if (match) return `${match[1]}/${match[2]}`;
  } catch {
    /* no git remote available */
  }
  return '';
}

async function copyStatic() {
  for (const file of STATIC_FILES) {
    await cp(path.join(srcDir, file), path.join(outDir, file));
  }

  const iconsSource = path.join(srcDir, 'icons');
  const iconsTarget = path.join(outDir, 'icons');
  await mkdir(iconsTarget, { recursive: true });
  const icons = await readdir(iconsSource).catch(() => []);
  for (const icon of icons) {
    await cp(path.join(iconsSource, icon), path.join(iconsTarget, icon));
  }
}

async function writeBuildInfo(info) {
  await writeFile(path.join(outDir, 'version.json'), `${JSON.stringify(info, null, 2)}\n`);
}

function resolveBuildInfo() {
  const stored = readVersionInfo();
  const version = (process.env.BUILD_VERSION || stored.version).trim();
  return {
    name: stored.name || 'Calcivo',
    version,
    variant: (process.env.BUILD_VARIANT || 'dev').trim(),
    commit: (process.env.BUILD_COMMIT || '').trim() || 'unknown',
    builtAt: (process.env.BUILD_TIME || '').trim() || new Date().toISOString(),
    repository: detectRepository() || 'jakariatanjim-svg/test',
  };
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await build({
    entryPoints: [path.join(srcDir, 'js', 'app.js')],
    outfile: path.join(outDir, 'app.js'),
    bundle: true,
    format: 'iife',
    target: ['chrome110', 'safari16'],
    minify: !isDev,
    sourcemap: isDev ? 'inline' : false,
    legalComments: 'none',
    logLevel: 'warning',
  });

  await copyStatic();

  const info = resolveBuildInfo();
  await writeBuildInfo(info);

  console.log(
    `web build ready  ->  ${path.relative(root, outDir)}/  ` +
      `(${isDev ? 'development' : 'production'}, ${info.name} ${info.version})`,
  );
}

main().catch((error) => {
  console.error('web build failed:', error);
  process.exit(1);
});
