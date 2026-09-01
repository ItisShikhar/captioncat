import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const testOutputDirectory = path.join(repositoryRoot, 'tests', 'sample-outputs');

function printUsage(errorMessage) {
  if (errorMessage) {
    console.error(`run-test: ${errorMessage}`);
  }

  console.error(
    'Usage: node scripts/run-test.mjs [node test arguments] [--cleanup|--keep-output] [--skip-build]',
  );
  process.exit(1);
}

function parseArguments(argumentsList) {
  let cleanup = true;
  let build = true;
  let cleanupOption;
  const testArguments = [];

  for (const argument of argumentsList) {
    if (argument === '--skip-build') {
      build = false;
      continue;
    }
    if (argument === '--cleanup' || argument === '--no-cleanup' || argument === '--keep-output') {
      if (cleanupOption && cleanupOption !== argument) {
        printUsage('Use only one cleanup option: --cleanup, --keep-output, or --no-cleanup.');
      }
      cleanupOption = argument;
      cleanup = argument === '--cleanup';
      continue;
    }
    testArguments.push(argument);
  }

  if (testArguments.length === 0) {
    printUsage('A test file or test runner argument is required.');
  }

  return { build, cleanup, testArguments };
}

const npmCleanupOption =
  process.env.npm_config_keep_output === 'true'
    ? '--keep-output'
    : process.env.npm_config_cleanup === 'true'
      ? '--cleanup'
      : undefined;
const { build, cleanup, testArguments } = parseArguments([
  ...process.argv.slice(2),
  ...(npmCleanupOption ? [npmCleanupOption] : []),
]);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const buildProcess = build
  ? spawnSync(npmCommand, ['run', 'build'], {
      cwd: repositoryRoot,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    })
  : { error: undefined, status: 0 };
const testProcess =
  buildProcess.status === 0
    ? spawnSync(process.execPath, ['--test', ...testArguments], {
        cwd: repositoryRoot,
        stdio: 'inherit',
      })
    : buildProcess;

if (testProcess.error) {
  console.error(`run-test: ${testProcess.error.message}`);
}

let cleanupError;
if (cleanup) {
  try {
    await rm(testOutputDirectory, { recursive: true, force: true });
    console.log(`[test-cleanup] Removed ${testOutputDirectory}`);
  } catch (error) {
    cleanupError = error;
    console.error(`[test-cleanup] Could not remove ${testOutputDirectory}: ${error.message}`);
  }
} else {
  console.log(`[test-cleanup] Preserved ${testOutputDirectory}`);
}

if (testProcess.status === null) {
  console.error('run-test: the test process did not return an exit code.');
  process.exitCode = 1;
} else {
  process.exitCode = cleanupError ? 1 : testProcess.status;
}
