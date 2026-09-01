import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';
import process from 'node:process';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gitCommand = 'git';
const npmCommand = 'npm';
const npmShell = process.platform === 'win32';

function run(command, args) {
  execFileSync(command, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: command === npmCommand && npmShell,
  });
}

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: command === npmCommand && npmShell,
  }).trim();
}

function hasRef(ref) {
  const result = spawnSync(gitCommand, ['rev-parse', '--verify', '--quiet', ref], {
    cwd: repositoryRoot,
    stdio: 'ignore',
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

function hasRemoteRef(ref) {
  const result = spawnSync(gitCommand, ['ls-remote', '--exit-code', '--refs', 'origin', ref], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 2) return false;
  throw new Error(result.stderr?.trim() || `Unable to query remote ref ${ref}.`);
}

function readPackageVersion(packageData, label) {
  if (typeof packageData.version !== 'string' || packageData.version.length === 0) {
    throw new Error(`${label} does not contain a valid version.`);
  }
  return packageData.version;
}

async function readVersionFiles() {
  const packageData = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const lockData = JSON.parse(await readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
  const packageVersion = readPackageVersion(packageData, 'package.json');
  const lockVersion = lockData.packages?.['']?.version;
  if (typeof lockVersion !== 'string') {
    throw new Error('package-lock.json does not contain a root package version.');
  }
  if (packageVersion !== lockVersion) {
    throw new Error(`package.json (${packageVersion}) and package-lock.json (${lockVersion}) do not match.`);
  }
  return { packageVersion, lockVersion };
}

async function getRequestedVersion() {
  const providedVersion = process.argv[2];
  if (process.argv.length > 3) {
    throw new Error('Provide one version only, for example: npm run release -- 1.0.3');
  }
  if (providedVersion) return providedVersion.trim();

  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (await prompt.question('Release version: ')).trim();
  } finally {
    prompt.close();
  }
}

function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid version "${version}". Use a semantic version such as 1.0.3.`);
  }
}

async function verifyPackageContents(version) {
  await rm(path.join(repositoryRoot, 'assets', 'fonts', 'downloaded'), {
    recursive: true,
    force: true,
  });

  const output = capture(npmCommand, ['pack', '--dry-run', '--json']);
  const packageResult = JSON.parse(output)[0];
  const downloadedFontFiles = packageResult.files.filter((file) =>
    file.path.replaceAll('\\', '/').startsWith('assets/fonts/downloaded/'),
  );
  if (downloadedFontFiles.length > 0) {
    throw new Error('The npm package contains the generated assets/fonts/downloaded cache.');
  }
  if (packageResult.version !== version) {
    throw new Error(`The npm package reports version ${packageResult.version}, expected ${version}.`);
  }
}

async function main() {
  const version = await getRequestedVersion();
  validateVersion(version);
  const tag = `v${version}`;

  if (capture(gitCommand, ['branch', '--show-current']) !== 'main') {
    throw new Error('Run the release command from the main branch.');
  }
  if (capture(gitCommand, ['status', '--porcelain'])) {
    throw new Error('The working tree must be clean before a release.');
  }

  run(gitCommand, ['fetch', 'origin', 'main']);
  if (capture(gitCommand, ['rev-parse', 'HEAD']) !== capture(gitCommand, ['rev-parse', 'origin/main'])) {
    throw new Error('Local main is not up to date with origin/main. Pull the latest changes first.');
  }

  const currentVersions = await readVersionFiles();
  if (currentVersions.packageVersion === version) {
    throw new Error(`The package is already at version ${version}.`);
  }
  if (hasRef(`refs/tags/${tag}`)) {
    throw new Error(`The local tag ${tag} already exists.`);
  }
  if (hasRemoteRef(`refs/tags/${tag}`)) {
    throw new Error(`The remote tag ${tag} already exists.`);
  }

  run(npmCommand, ['run', 'build']);
  run(npmCommand, ['run', 'lint']);
  run(npmCommand, ['test']);

  run(npmCommand, ['version', version, '--no-git-tag-version']);
  const updatedVersions = await readVersionFiles();
  if (updatedVersions.packageVersion !== version || updatedVersions.lockVersion !== version) {
    throw new Error(`Version update did not set both package files to ${version}.`);
  }
  await verifyPackageContents(version);

  run(gitCommand, ['add', 'package.json', 'package-lock.json']);
  run(gitCommand, ['commit', '-m', `Release ${tag}`]);
  run(gitCommand, ['push', 'origin', 'refs/heads/main:refs/heads/main']);

  run(gitCommand, ['tag', '-a', tag, '-m', `Release ${tag}`]);
  run(gitCommand, ['push', 'origin', `refs/tags/${tag}:refs/tags/${tag}`]);

  console.log(`Release ${tag} is committed, pushed, tagged, and pushed.`);
}

main().catch((error) => {
  console.error(`Release stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
