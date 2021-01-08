// Best keep this in sync with clipanion, to ensure a
// similar look for our own usage prints and clipanion's

export interface Format {
  bold(str: string): string;
  error(str: string): string;
  code(str: string): string;
}

export const richFormat: Format = {
  bold: str => `\x1b[1m${str}\x1b[22m`,
  error: str => `\x1b[31m\x1b[1m${str}\x1b[22m\x1b[39m`,
  code: str => `\x1b[36m${str}\x1b[39m`,
};

export const textFormat: Format = {
  bold: str => str,
  error: str => str,
  code: str => str,
};

export function formatMarkdownish(
  text: string,
  {
    format,
    paragraphs,
    indentation = 0,
  }: {format: Format; paragraphs: boolean; indentation?: number},
): string {
  // Enforce \n as newline character
  text = text.replace(/\r\n?/g, `\n`);

  // Remove the indentation, since it got messed up with the JS indentation
  text = text.replace(/^[\t ]+|[\t ]+$/gm, ``);

  // Remove surrounding newlines, since they got added for JS formatting
  text = text.replace(/^\n+|\n+$/g, ``);

  // List items always end with at least two newlines (in order to not be collapsed)
  text = text.replace(/^-([^\n]*?)\n+/gm, `-$1\n\n`);

  // Single newlines are removed; larger than that are collapsed into one
  text = text.replace(/\n(\n)?\n*/g, `$1`);

  if (paragraphs) {
    text = text
      .split(/\n/)
      .map(paragraph => {
        // Does the paragraph starts with a list?
        const bulletMatch = paragraph.match(/^[*-][\t ]+(.*)/);

        if (!bulletMatch)
          // No, cut the paragraphs into segments of 80 characters
          return paragraph
            .match(new RegExp(`(.{1,${80 - indentation}})(?: |$)`, 'g'))!
            .join(`\n`);

        // Yes, cut the paragraphs into segments of 78 characters (to account for the prefix)
        return bulletMatch[1]!
          .match(new RegExp(`(.{1,${78 - indentation}})(?: |$)`, 'g'))!
          .map((line, index) => {
            return (index === 0 ? `- ` : `  `) + line;
          })
          .join(`\n`);
      })
      .join(`\n\n`);
  }

  // Highlight the code segments
  text = text.replace(/(`+)((?:.|[\n])*?)\1/g, (_, $1, $2) => {
    return format.code($1 + $2 + $1);
  });

  return text ? `${text}\n` : ``;
}
