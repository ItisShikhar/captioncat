import { cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(repositoryRoot, 'assets/svg/shapes');
const outputDirectory = path.join(repositoryRoot, 'build/caption-engine/entity-system/image-assets');

await cp(sourceDirectory, outputDirectory, { recursive: true });
