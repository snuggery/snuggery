import {
  isJsonArray,
  isJsonObject,
  JsonObject,
  JsonValue,
} from '@angular-devkit/core';

import {Format, formatMarkdownish} from './format';
import type {Report} from './report';

export function printSchema(
  schema: JsonObject,
  {
    supportPathFormat,
    report,
    format,
  }: {supportPathFormat: boolean; report: Report; format: Format},
): void {
  report.reportInfo(`${format.bold('Properties:')}`);
  report.reportSeparator();

  printObjectPropererties(report, format, supportPathFormat, schema, 0);
}

function printObjectPropererties(
  report: Report,
  format: Format,
  supportPathFormat: boolean,
  object: JsonObject,
  indentation: number,
) {
  const formatHelper = (s: string, paragraphs = true) =>
    formatMarkdownish(s, {format, paragraphs, indentation});

  const required = new Set(
    Array.isArray(object.required) ? object.required : [],
  );

  if (isJsonObject(object.properties!)) {
    for (const [name, prop] of Object.entries(object.properties)) {
      report.reportInfo(
        formatHelper(
          `- \`${name}\`${required.has(name) ? ' (required)' : ''}`,
          false,
        ),
      );
      indentation += 2;

      try {
        if (!isJsonObject(prop)) {
          report.reportWarning(
            formatHelper('Invalid property definition', false),
          );
          continue;
        }

        const description = getDescription(prop);
        if (description) {
          report.reportInfo(formatHelper(description));
        }

        const $default = getDefault(prop, supportPathFormat); // default is not a valid property name
        if ($default != null) {
          report.reportInfo(
            formatHelper(`Default value is ${$default}`, false),
          );
        }

        const $enum = getEnum(prop); // "const enum" and "enum" are keywords in typescript
        if ($enum != null) {
          report.reportInfo(formatHelper(`Possible values:`, false));
          for (const value of $enum) {
            report.reportInfo(
              formatHelper(`- \`${JSON.stringify(value)}\``, false),
            );
          }

          continue;
        }

        const simpleTypes = getTypesSimple(prop);
        if (simpleTypes != null) {
          printSimpleTypes(report, formatHelper, simpleTypes);
          continue;
        }

        const complexTypes = getTypesComplex(prop);

        if (complexTypes == null) {
          report.reportWarning(
            formatHelper(
              'The type of this property is too complex to print in this help block.',
            ),
          );
          continue;
        }

        if (complexTypes.isArray) {
          if (complexTypes.rest.length === 0 && complexTypes.object == null) {
            report.reportInfo(formatHelper(`Type: \`any[]\``, false));
          } else if (
            complexTypes.rest.length === 1 &&
            complexTypes.object == null
          ) {
            report.reportInfo(
              formatHelper(`Type: \`${complexTypes.rest[0]}[]\``, false),
            );
          } else if (complexTypes.rest.length > 0) {
            report.reportInfo(
              formatHelper(`Type: an array with items of type`, false),
            );
            for (const type of complexTypes.rest) {
              report.reportInfo(formatHelper(`- \`${type}\``, false));
            }
            if (complexTypes.object != null) {
              report.reportInfo(formatHelper('or an object with properties:'));
              report.reportSeparator();
            }
          } else {
            report.reportInfo(
              formatHelper(
                `Type: an array containing objects with properties:`,
              ),
            );
            report.reportSeparator();
          }

          if (complexTypes.object != null) {
            printObjectPropererties(
              report,
              format,
              supportPathFormat,
              complexTypes.object,
              indentation,
            );
          }
        } else {
          if (complexTypes.rest.length === 0 && complexTypes.object == null) {
            report.reportInfo(formatHelper(`Type: \`any\``, false));
          } else if (
            complexTypes.rest.length === 1 &&
            complexTypes.object == null
          ) {
            report.reportInfo(
              formatHelper(`Type: \`${complexTypes.rest[0]}\``, false),
            );
          } else if (complexTypes.rest.length > 0) {
            report.reportInfo(formatHelper(`Type: one of`, false));
            for (const type of complexTypes.rest) {
              report.reportInfo(formatHelper(`- \`${type}\``, false));
            }
            if (complexTypes.object != null) {
              report.reportInfo(formatHelper('or an object with properties:'));
              report.reportSeparator();
            }
          } else {
            report.reportInfo(formatHelper(`Type: an object with properties:`));
            report.reportSeparator();
          }

          if (complexTypes.object != null) {
            printObjectPropererties(
              report,
              format,
              supportPathFormat,
              complexTypes.object,
              indentation,
            );
          }
        }
      } finally {
        report.reportSeparator();
        indentation -= 2;
      }
    }
  }
}

function getDescription(property: JsonObject): string | undefined {
  if (typeof property.description === 'string') {
    return property.description;
  }

  return undefined;
}

function getDefault(
  property: JsonObject,
  supportPathFormat: boolean,
): string | undefined {
  // Add $default support here if we ever support a "smart source"

  if ('default' in property) {
    return `\`${JSON.stringify(property.default)}\``;
  }

  if (
    supportPathFormat &&
    property.type === 'string' &&
    property.format === 'path'
  ) {
    return 'the path to the active project';
  }

  return undefined;
}

function getEnum(property: JsonObject): JsonValue[] | undefined {
  if (Array.isArray(property.enum)) {
    return property.enum;
  }

  return undefined;
}

function getTypesSimple(property: JsonValue | undefined): string[] | null {
  if (!isJsonObject(property!)) {
    return [];
  }

  if (property.type === 'object') {
    return null;
  }

  if (property.type === 'array') {
    const innerType = getTypesSimple(property.items);

    if (innerType == null) {
      return null;
    }

    switch (innerType.length) {
      case 0:
        return ['any[]'];
      case 1:
        return [`${innerType[0]}[]`];
      default:
        return [`(${innerType.join(' | ')})[]`];
    }
  }

  if (typeof property.type === 'string') {
    return [property.type];
  }

  const alternatives = isJsonArray(property.oneOf!)
    ? property.oneOf
    : isJsonArray(property.anyOf!)
    ? property.anyOf
    : null;

  if (alternatives == null) {
    return [];
  }

  const types = alternatives.map(alt => getTypesSimple(alt));

  if (types.includes(null)) {
    return null;
  }

  return types.flat() as string[];
}

function printSimpleTypes(
  report: Report,
  format: (s: string) => string,
  types: string[],
) {
  switch (types.length) {
    case 0:
      report.reportWarning(
        format(
          'The type of this property is too complex to print in this help block.',
        ),
      );
      break;
    case 1:
      report.reportInfo(format(`Type: \`${types[0]}\``));
      break;
    default:
      report.reportInfo(format(`Types:`));
      for (const type of types) {
        report.reportInfo(format(`- \`${type}\``));
      }
  }
}

function getTypesComplex(
  property: JsonObject,
): {object?: JsonObject; isArray: boolean; rest: string[]} | null {
  if (property.type === 'object') {
    return {object: property, isArray: false, rest: []};
  }

  if (property.type === 'array') {
    const innerType = isJsonObject(property.items!)
      ? getTypesComplex(property.items)
      : null;

    if (innerType == null) {
      return null;
    }

    return {...innerType, isArray: true};
  }

  if (typeof property.type === 'string') {
    return {isArray: false, rest: [property.type]};
  }

  const alternatives = isJsonArray(property.oneOf!)
    ? property.oneOf
    : isJsonArray(property.anyOf!)
    ? property.anyOf
    : null;

  if (alternatives == null) {
    return null;
  }

  const types = alternatives.map(alt =>
    isJsonObject(alt) ? getTypesComplex(alt) : null,
  );

  let rest: string[] = [];
  let isArray = false;
  let object: JsonObject | undefined;

  for (const type of types) {
    if (type == null) {
      continue;
    }

    if (object == null && type.object != null) {
      object = type.object;
    }

    if (isArray !== type.isArray) {
      isArray = type.isArray;
      rest = [...type.rest];
    } else {
      rest.push(...type.rest);
    }
  }

  return {object, isArray, rest};
}
