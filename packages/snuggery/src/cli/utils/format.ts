import type {Format as _Format} from './format/index';

export {formatMarkdownish} from './format/index';

export interface Format extends _Format {
  header(str: string): string;
  error(str: string): string;
}

// cf. clipanion
const MAX_LINE_LENGTH = 80;
const richLine = Array(MAX_LINE_LENGTH).fill(`━`);
for (let t = 0; t <= 24; ++t)
  richLine[richLine.length - t] = `\x1b[38;5;${232 + t}m━`;

export const richFormat: Format = {
  header: str =>
    `\x1b[1m━━━ ${str}${
      str.length < MAX_LINE_LENGTH - 5
        ? ` ${richLine.slice(str.length + 5).join(``)}`
        : `:`
    }\x1b[0m`,
  bold: str => `\x1b[1m${str}\x1b[22m`,
  error: str => `\x1b[31m\x1b[1m${str}\x1b[22m\x1b[39m`,
  code: str => `\x1b[36m${str}\x1b[39m`,
};

export const textFormat: Format = {
  header: str => str,
  bold: str => str,
  error: str => str,
  code: str => str,
};
