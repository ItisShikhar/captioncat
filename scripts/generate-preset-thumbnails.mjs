import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWordTimestamps, renderPresetFrames } from './render-preset-frame.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const presetDirectory = path.join(projectRoot, 'assets', 'json', 'caption-style-presets');
const outputDirectory = path.join(projectRoot, 'docs', 'images', 'preset-thumbs');
const thumbnailResolutionScale = 1.5;
const thumbnailFrame = 12;
const multiRowThumbnailFrame = thumbnailFrame;
const thumbnailWidth = Math.round(360 * thumbnailResolutionScale);
const thumbnailHeight = Math.round(360 * thumbnailResolutionScale);
const thumbnailFps = 6;
const thumbnailContentPadding = 24;
const thumbnailContentPaddingByPreset = {
  'karaoke-1': 48,
};
const thumbnailContentAlphaThresholdByPreset = {
  'apple-music': 1,
};
const thumbnailRowStyleSourceByPreset = {
  'apple-music': {
    past: 'next',
    previous: 'next',
  },
};
const thumbnailRowBlurRadiusByPreset = {
  'apple-music': 3,
};
const defaultThumbnailWordPresentation = 'past-page';
const thumbnailWordDurationSeconds = 0.65;
const thumbnailWordPresentationByPreset = {
  'apple-music': 'active-word',
  'avatar-dialogue': 'active-word',
  banger: 'active-word',
  chic: 'active-word',
  coco: 'active-word',
  gamerboy: 'active-word',
  'go-viral': 'active-word',
  'golden-ticket': 'active-word',
  'ig-classic-sticker-2': 'active-word',
  'ig-classic-sticker': 'active-word',
  'ig-demure': 'active-word',
  'ig-sticker': 'active-word',
  'karaoke-1': 'active-word',
  poppy: 'active-word',
  presentation: 'active-word',
  punch: 'active-word',
  'slide-with-me': 'active-word',
  snapchat: 'active-word',
  'sour-gummy': 'active-word',
  'twitch-classic': 'active-word',
};
const thumbnailActiveWordNumberByPreset = {
  'apple-music': 4,
};
const fullPageThumbnailStateWindow = {
  previousWords: { mode: 'all' },
  currentWords: { mode: 'all' },
  nextWords: { mode: 'all' },
  previousRows: { mode: 'all' },
  currentRows: { mode: 'all' },
  nextRows: { mode: 'all' },
};
const thumbnailText = 'This is a preset preview.';
const multiRowThumbnailTexts = {
  2: 'This is a\npreset caption preview.',
  3: 'This is a preset\ncaption preview for\nmultiline layouts.',
  4: 'This is a\npreset caption\npreview for\nmultiline layouts.',
};
const thumbnailTextByPreset = {
  'apple-music': 'This is\na\npreset preview.',
  'love-story': 'This is a preset\npreview.',
};
const thumbnailRowsByPreset = {
  'chrome-heartbreaker': 3,
  'love-story': 2,
  'take-your-chance': 4,
};
const thumbnailRowsPerPageByPreset = {
  'love-story': 2,
};
const thumbnailStateWindowOverridesByPreset = {
  'apple-music': {
    previousRows: { mode: 'fixedCount', count: 1 },
    currentRows: { mode: 'fixedCount', count: 1 },
  },
  'karaoke-1': {
    currentRows: { mode: 'fixedCount', count: 1 },
  },
};
const thumbnailSourceBreakModeByPreset = {
  'apple-music': 'always',
  'chrome-heartbreaker': 'always',
  'take-your-chance': 'always',
};

function activeWordThumbnailFrame(text, currentWordNumber) {
  const wordCount = createWordTimestamps(text, 'en').words.length;
  const framesPerWord = Math.max(2, Math.ceil(thumbnailWordDurationSeconds * thumbnailFps));
  const wordNumber = currentWordNumber ?? wordCount;
  if (!Number.isInteger(wordNumber) || wordNumber < 1 || wordNumber > wordCount) {
    throw new Error(`Thumbnail current word must be between 1 and ${wordCount}, received ${wordNumber}.`);
  }
  return wordNumber * framesPerWord;
}

function thumbnailStateWindowFor(presetId, wordPresentation, presetStateWindow) {
  if (wordPresentation === 'past-page') return fullPageThumbnailStateWindow;
  if (wordPresentation !== 'active-word') return undefined;

  const presetOverride = thumbnailStateWindowOverridesByPreset[presetId];
  return {
    ...presetStateWindow,
    previousWords: { mode: 'all' },
    previousRows: presetOverride?.previousRows ?? { mode: 'all' },
    currentRows: presetOverride?.currentRows ?? { mode: 'all' },
  };
}

const presetFiles = (await fs.readdir(presetDirectory))
  .filter((fileName) => fileName.endsWith('.json'))
  .sort((first, second) => first.localeCompare(second));

await fs.mkdir(outputDirectory, { recursive: true });

function thumbnailCaptionLayoutForPreset(presetId, captionLayout) {
  const sourceBreakMode = thumbnailSourceBreakModeByPreset[presetId];
  const rowsPerPageCount = thumbnailRowsPerPageByPreset[presetId];
  if (!sourceBreakMode && rowsPerPageCount === undefined) return captionLayout;

  return {
    ...captionLayout,
    ...(rowsPerPageCount === undefined
      ? {}
      : {
          rowsPerPage: {
            mode: 'fixed',
            count: rowsPerPageCount,
          },
        }),
    breaking: {
      ...captionLayout.breaking,
      breakPriorities: {
        ...captionLayout.breaking.breakPriorities,
        rows: captionLayout.breaking.breakPriorities.rows.map((rule) =>
          rule.id === 'source' && sourceBreakMode ? { ...rule, mode: sourceBreakMode } : rule,
        ),
      },
    },
  };
}

function thumbnailDesignForPreset(presetId, design) {
  const rowStyleSources = thumbnailRowStyleSourceByPreset[presetId];
  if (!rowStyleSources) return design;

  let sourceRow;
  const findSourceRow = (node) => {
    if (node.entity === 'row' && node.id === `row:${rowStyleSources.previous}`) {
      sourceRow = node;
      return;
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(findSourceRow);
    }
  };
  findSourceRow(design);
  if (!sourceRow) return design;

  const applyRowStyleSources = (node) => {
    if (node.entity === 'row') {
      const rowState = node.id.split(':')[1];
      const styleSource = rowStyleSources[rowState];
      if (styleSource) {
        const { styleSource: _styleSource, ...nodeWithoutStyleSource } = node;
        return {
          ...nodeWithoutStyleSource,
          components: structuredClone(sourceRow.components ?? []),
          effects: structuredClone(
            (sourceRow.effects ?? []).map((effect) =>
              effect.effect === 'blur'
                ? {
                    ...effect,
                    id: `${effect.id}:thumbnail-${rowState}`,
                    props: {
                      ...effect.props,
                      blurRadius: {
                        ...effect.props.blurRadius,
                        value: thumbnailRowBlurRadiusByPreset[presetId],
                        transition: {
                          ...effect.props.blurRadius.transition,
                          enabled: false,
                        },
                      },
                    },
                  }
                : effect,
            ),
          ),
        };
      }
    }
    if (!Array.isArray(node.children)) return node;
    return {
      ...node,
      children: node.children.map(applyRowStyleSources),
    };
  };

  return applyRowStyleSources(design);
}

async function thumbnailSettingsForPreset(presetId) {
  const presetPath = path.join(presetDirectory, `${presetId}.json`);
  const preset = JSON.parse(await fs.readFile(presetPath, 'utf8'));
  const wordPresentation = thumbnailWordPresentationByPreset[presetId] ?? defaultThumbnailWordPresentation;
  const activeWordNumber = thumbnailActiveWordNumberByPreset[presetId];
  const captionLayout = thumbnailCaptionLayoutForPreset(presetId, preset.captionLayout);
  const rowsPerPage = captionLayout.rowsPerPage;
  const stateWindow = thumbnailStateWindowFor(presetId, wordPresentation, preset.stateWindow);
  const design = thumbnailDesignForPreset(presetId, preset.design);
  if (rowsPerPage?.mode === 'all') {
    const text = thumbnailTextByPreset[presetId] ?? multiRowThumbnailTexts[3];
    return {
      text,
      frame:
        wordPresentation === 'active-word'
          ? activeWordThumbnailFrame(text, activeWordNumber)
          : multiRowThumbnailFrame,
      rows: 3,
      rowsPerPageMode: rowsPerPage.mode,
      wordPresentation,
      captionLayout,
      stateWindow,
      design,
    };
  }
  if (rowsPerPage?.mode === 'fixed' && Number.isInteger(rowsPerPage.count) && rowsPerPage.count > 1) {
    const requestedRows = thumbnailRowsByPreset[presetId] ?? 3;
    const rows = Math.min(requestedRows, rowsPerPage.count);
    const text = thumbnailTextByPreset[presetId] ?? multiRowThumbnailTexts[rows];
    return {
      text,
      frame:
        wordPresentation === 'active-word'
          ? activeWordThumbnailFrame(text, activeWordNumber)
          : multiRowThumbnailFrame,
      rows,
      rowsPerPageMode: rowsPerPage.mode,
      wordPresentation,
      captionLayout,
      stateWindow,
      design,
    };
  }
  const text = thumbnailTextByPreset[presetId] ?? thumbnailText;
  return {
    text,
    frame:
      wordPresentation === 'active-word'
        ? activeWordThumbnailFrame(text, activeWordNumber)
        : thumbnailFrame,
    rows: 1,
    rowsPerPageMode: rowsPerPage?.mode,
    wordPresentation,
    captionLayout,
    stateWindow,
    design,
  };
}

for (const presetFile of presetFiles) {
  const presetId = path.basename(presetFile, '.json');
  const outputPath = path.join(outputDirectory, `${presetId}.png`);
  const thumbnailSettings = await thumbnailSettingsForPreset(presetId);
  const result = await renderPresetFrames({
    presetName: presetId,
    language: 'en',
    text: thumbnailSettings.text,
    frames: [thumbnailSettings.frame],
    width: thumbnailWidth,
    height: thumbnailHeight,
    fps: thumbnailFps,
    design: thumbnailSettings.design,
    captionLayout: thumbnailSettings.captionLayout,
    ...(thumbnailSettings.stateWindow === undefined ? {} : { stateWindow: thumbnailSettings.stateWindow }),
    ...(thumbnailSettings.wordPresentation === 'past-page'
      ? { previewWordState: 'past', previewWordStateLayout: 'static' }
      : {}),
    fitPageToChildren: thumbnailSettings.rowsPerPageMode !== 'fit-height',
    allowContentOverflow: true,
    disableLayoutMotion: true,
    cropToContent: true,
    contentPadding: thumbnailContentPaddingByPreset[presetId] ?? thumbnailContentPadding,
    contentAlphaThreshold: thumbnailContentAlphaThresholdByPreset[presetId] ?? 200,
    outputPathForFrame: () => outputPath,
  });
  const resolvedFrame = result.outputs[0]?.resolvedFrame ?? result.frameCount;
  const fallbackNote = result.unavailableFrames.length > 0 ? `, used frame ${resolvedFrame}` : '';
  console.log(
    `${presetId}: wrote ${path.relative(projectRoot, outputPath)} ` +
      `(${thumbnailSettings.rows} rows${fallbackNote})`,
  );
}
