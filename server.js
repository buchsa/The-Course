import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const tsEntry = path.join(rootDir, 'server.ts');

async function boot() {
  if (process.features?.typescript) {
    await import(pathToFileURL(tsEntry).href);
    return;
  }

  const { build } = await import('esbuild');
  const cacheDir = path.join(rootDir, 'node_modules', '.cache');
  let outFile = path.join(cacheDir, 'the-course-server.mjs');
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch {
    outFile = path.join(os.tmpdir(), 'the-course-server.mjs');
  }

  await build({
    entryPoints: [tsEntry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: outFile,
  });

  await import(pathToFileURL(outFile).href);
}

boot().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
