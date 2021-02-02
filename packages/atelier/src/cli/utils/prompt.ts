import type {json} from '@angular-devkit/core';
import prompts from 'prompts';

function extractChoices({
  items,
}: json.schema.PromptDefinition): prompts.Choice[] | undefined {
  return items?.map(item => {
    return typeof item == 'string'
      ? {title: item, value: item}
      : {
          title: item.label,
          value: item.value as string,
        };
  });
}

export function createPromptProvider(): json.schema.PromptProvider {
  return definitions => {
    return prompts(
      definitions.map(definition => {
        const question: prompts.PromptObject = {
          name: definition.id,
          type: 'text',

          message: definition.message,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initial: definition.default as any,
        };

        const validator = definition.validator;
        if (validator != null) {
          question.validate = input => validator(input);
        }

        switch (definition.type) {
          // Three types generated by Angular based on the schema, if no type is
          // provided to x-prompt:

          case 'confirmation':
            question.type = 'confirm';
            break;
          case 'list':
            question.type = definition.multiselect ? 'multiselect' : 'select';
            question.choices = extractChoices(definition);
            question.initial = question.choices?.findIndex(
              ({value}) => value === question.initial,
            );
            break;
          case 'input':
            if (
              definition.propertyTypes.size === 1 &&
              (definition.propertyTypes.has('number') ||
                definition.propertyTypes.has('integer'))
            ) {
              question.type = 'number';
            } else {
              question.type = 'text';
            }
            break;

          // Other types can be provided via the x-prompt value in the schema,
          // we'll support any that prompts supports, and fall back to text
          // in all other cases

          case 'number':
          case 'integer':
            question.type = 'number';
            break;

          case 'select':
          case 'multiselect':
          case 'autocomplete':
            question.type = definition.type;
            question.choices = extractChoices(definition);
            break;

          case 'text':
          case 'password':
          case 'invisible':
          case 'confirm':
          case 'toggle':
          case 'date':
            question.type = definition.type;
            break;

          default:
            question.type = 'text';
        }

        return question;
      }),
    );
  };
}