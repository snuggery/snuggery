import {isJsonArray, isJsonObject, json} from '@angular-devkit/core';

import {isntNull} from './varia';

export enum Type {
  String = 'string',
  Boolean = 'boolean',
  Number = 'number',
  StringArray = 'string array',
  Object = 'object',
}

export interface Option {
  name: string;

  type: Type;

  extraTypes?: Type[];

  required: boolean;

  hasDefault: boolean;

  positional?: number;

  description?: string;

  aliases: string[];

  hidden: boolean;

  format?: string;
}

export function parseSchema({
  description,
  schema = true,
}: {
  description?: string;
  schema?: json.schema.JsonSchema;
}): {options: Option[]; allowExtraOptions: boolean; description?: string} {
  if (typeof schema === 'boolean') {
    return {
      options: [],
      allowExtraOptions: schema,
    };
  }

  let {properties = {}, additionalProperties, required} = schema;

  const requiredProperties = new Set<string>();
  if (Array.isArray(required)) {
    for (const r of required) {
      if (typeof r === 'string') {
        requiredProperties.add(r);
      }
    }
  }

  if (typeof additionalProperties !== 'boolean') {
    additionalProperties = true;
  }

  if (!isJsonObject(properties)) {
    properties = {};
  }

  return {
    options: Object.entries(properties)
      .map(([name, property]) => {
        if (!isJsonObject(property)) {
          return null;
        }

        const required = requiredProperties.has(name);
        const rawTypes = json.schema.getTypesOfSchema(property);
        const types: Type[] = [];

        for (const rawType of rawTypes) {
          switch (rawType) {
            case 'string':
              types.push(Type.String);
              break;
            case 'boolean':
              types.push(Type.Boolean);
              break;
            case 'integer':
            case 'number':
              types.push(Type.Number);
              break;
            case 'array':
              // Only include arrays if they're boolean, string or number.
              if (
                isJsonObject(property.items!) &&
                property.items.type == 'string'
              ) {
                types.push(Type.StringArray);
                break;
              }

              types.push(Type.Object);
              break;
            case 'object':
              types.push(Type.Object);
              break;
          }
        }

        if (types.length === 0) {
          // Not a viable type for an option
          return null;
        }

        const type = types.shift()!;

        const hasDefault = property.default != null;

        const aliases = isJsonArray(property.aliases!)
          ? property.aliases.map(x => '' + x)
          : property.alias
          ? ['' + property.alias]
          : [];

        const $defaultIndex =
          json.isJsonObject(property.$default!) &&
          property.$default.$source == 'argv'
            ? property.$default.index
            : undefined;
        const positional: number | undefined =
          typeof $defaultIndex == 'number' ? $defaultIndex : undefined;

        const visible =
          property.visible === undefined || property.visible === true;
        const hidden =
          !!property.hidden || !!property['x-deprecated'] || !visible;

        const description =
          typeof property.description === 'string'
            ? property.description
            : undefined;

        const format =
          typeof property.format === 'string' ? property.format : undefined;

        return {
          aliases,
          extraTypes: types,
          hasDefault,
          hidden,
          name,
          required,
          type,
          positional,
          description,
          format,
        };
      })
      .filter(isntNull),
    allowExtraOptions: additionalProperties,
    description,
  };
}
