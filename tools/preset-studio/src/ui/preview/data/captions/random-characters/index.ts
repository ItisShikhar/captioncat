import { defineCaptionLocale, type CaptionLocale, type CaptionStory } from '../types';
import ar from './ar.json';
import bn from './bn.json';
import el from './el.json';
import en from './en.json';
import he from './he.json';
import hi from './hi.json';
import ja from './ja.json';
import kn from './kn.json';
import ko from './ko.json';
import ru from './ru.json';
import ta from './ta.json';
import th from './th.json';
import zh from './zh.json';

interface StatePreviewLocaleFile {
  id: string;
  name: string;
  sampleText: string;
  text: string;
}

function localeFromFile(file: StatePreviewLocaleFile): CaptionLocale {
  return defineCaptionLocale(file.id, file.name, file.text);
}

export const STATE_PREVIEW_SAMPLE_TEXT = en.sampleText;

export const randomCharactersStory: CaptionStory = {
  id: 'random-characters',
  name: 'Random Characters',
  locales: [en, ar, bn, el, he, hi, ja, kn, ko, ru, ta, th, zh].map((file) =>
    localeFromFile(file as StatePreviewLocaleFile),
  ),
};
