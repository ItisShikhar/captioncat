import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const require = createRequire(import.meta.url);
const { CAPTION_PRESET_NAMES } = require(path.join(repositoryRoot, 'build', 'index.js'));

const LANGUAGE_ALIASES = new Map([
  ['en', 'en'],
  ['eng', 'en'],
  ['english', 'en'],
  ['hi', 'hi'],
  ['hin', 'hi'],
  ['hindi', 'hi'],
  ['ja', 'ja'],
  ['jpn', 'ja'],
  ['japanese', 'ja'],
]);

const ASPECT_RATIO_ALIASES = new Map([
  ['16:9', '16:9'],
  ['9:16', '9:16'],
  ['1:1', '1:1'],
  ['4:3', '4:3'],
]);

const RESOLUTION_ALIASES = new Map([
  ['sd', '360p'],
  ['360p', '360p'],
  ['720p', '720p'],
  ['hd', '1080p'],
  ['1080p', '1080p'],
]);

const ALL_LANGUAGES = ['en', 'hi', 'ja'];
const ALL_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3'];
const ALL_RESOLUTIONS = ['360p', '720p', '1080p'];
const OUTPUT_ALIASES = new Map([
  ['video', 'video'],
  ['png', 'png'],
  ['png-sequence', 'png'],
  ['ass', 'ass'],
  ['srt', 'srt'],
  ['json', 'json'],
]);
const ALL_OUTPUTS = ['video', 'png', 'ass', 'srt', 'json'];

function printUsage(errorMessage) {
  if (errorMessage) {
    console.error(`test-sample: ${errorMessage}`);
  }

  console.error(
    'Usage: npm run test-sample -- <presets> <languages> <aspect-ratios> <resolutions> <outputs> [--cleanup|--keep-output]',
  );
  console.error('Use comma-separated values or all for each selector.');
  console.error('Outputs: video, png, ass, srt, json.');
  console.error('Example: npm run test-sample -- ig-typewriter,5o en,hindi 1:1 hd,sd video,png');
  process.exit(1);
}

function parseSelection(rawValue, label, aliases, allValues) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    printUsage(`${label} cannot be empty.`);
  }

  const values = rawValue.split(',').map((value) => value.trim().toLowerCase());
  if (values.some((value) => value === '')) {
    printUsage(`${label} contains an empty value.`);
  }

  if (values.includes('all')) {
    if (values.length !== 1) {
      printUsage(`${label} cannot combine all with specific values.`);
    }
    return [...allValues];
  }

  const normalizedValues = [];
  for (const value of values) {
    const normalizedValue = aliases.get(value);
    if (!normalizedValue) {
      const validValues = [...aliases.keys()].sort().join(', ');
      printUsage(`Unknown ${label} "${value}". Valid values: ${validValues}, all.`);
    }
    if (!normalizedValues.includes(normalizedValue)) {
      normalizedValues.push(normalizedValue);
    }
  }

  return normalizedValues;
}

function parseArguments(argumentsList) {
  let cleanup = true;
  let cleanupOption;
  const selectorArguments = [];
  for (const argument of argumentsList) {
    if (argument === '--cleanup' || argument === '--no-cleanup' || argument === '--keep-output') {
      if (cleanupOption && cleanupOption !== argument) {
        printUsage('Use only one cleanup option: --cleanup, --keep-output, or --no-cleanup.');
      }
      cleanupOption = argument;
      cleanup = argument === '--cleanup';
      continue;
    }
    selectorArguments.push(argument);
  }

  if (selectorArguments.length !== 5) {
    printUsage('Expected five selectors and an optional cleanup option.');
  }

  const presetAliases = new Map(CAPTION_PRESET_NAMES.map((presetName) => [presetName.toLowerCase(), presetName]));
  return {
    cleanup,
    presets: parseSelection(selectorArguments[0], 'preset selector', presetAliases, CAPTION_PRESET_NAMES),
    languages: parseSelection(selectorArguments[1], 'language selector', LANGUAGE_ALIASES, ALL_LANGUAGES),
    aspectRatios: parseSelection(selectorArguments[2], 'aspect-ratio selector', ASPECT_RATIO_ALIASES, ALL_ASPECT_RATIOS),
    resolutions: parseSelection(selectorArguments[3], 'resolution selector', RESOLUTION_ALIASES, ALL_RESOLUTIONS),
    outputs: parseSelection(selectorArguments[4], 'output selector', OUTPUT_ALIASES, ALL_OUTPUTS),
  };
}

const npmCleanupOption =
  process.env.npm_config_keep_output === 'true'
    ? '--keep-output'
    : process.env.npm_config_cleanup === 'true'
      ? '--cleanup'
      : undefined;
const sampleTestConfig = parseArguments([
  ...process.argv.slice(2),
  ...(npmCleanupOption ? [npmCleanupOption] : []),
]);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const buildProcess = spawnSync(npmCommand, ['run', 'build'], {
  cwd: repositoryRoot,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});
if (buildProcess.error) {
  throw buildProcess.error;
}
if (buildProcess.status !== 0) {
  process.exitCode = buildProcess.status ?? 1;
  process.exit();
}

console.log(`Presets: ${sampleTestConfig.presets.join(', ')}`);
console.log(`Languages: ${sampleTestConfig.languages.join(', ')}`);
console.log(`Aspect ratios: ${sampleTestConfig.aspectRatios.join(', ')}`);
console.log(`Resolutions: ${sampleTestConfig.resolutions.join(', ')}`);
console.log(`Outputs: ${sampleTestConfig.outputs.join(', ')}`);

const testProcess = spawnSync(
  process.execPath,
  [
    'scripts/run-test.mjs',
    '--skip-build',
    '--test-name-pattern',
    '^parameterized sample render:',
    'tests/sample-render.test.js',
    sampleTestConfig.cleanup ? '--cleanup' : '--keep-output',
  ],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      SAMPLE_TEST_CONFIG: JSON.stringify(sampleTestConfig),
    },
    stdio: 'inherit',
  },
);

if (testProcess.error) {
  throw testProcess.error;
}

if (testProcess.status === null) {
  console.error('test-sample: the test process did not return an exit code.');
  process.exitCode = 1;
} else {
  process.exitCode = testProcess.status;
}
