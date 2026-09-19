import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const iconDirectory = join(import.meta.dirname, '..', 'assets', 'stack-icons');
const sourceFiles = (await readdir(iconDirectory)).filter((name) => name.endsWith('.svg'));

for (const sourceFile of sourceFiles) {
  const source = join(iconDirectory, sourceFile);
  const destination = join(iconDirectory, sourceFile.replace(/\.svg$/, '.png'));
  await sharp(source, { density: 384 })
    .resize(128, 128, { fit: 'contain' })
    .png()
    .toFile(destination);
  console.log(destination);
}
