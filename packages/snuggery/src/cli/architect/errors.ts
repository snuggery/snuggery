/**
 * @fileoverview
 *
 * This file contains different error types used throughout the SnuggeryArchitectHost.
 */

import type {ErrorWithMeta} from 'clipanion';

import {AbstractError} from '../../utils/error';

export class UnknownBuilderError
  extends AbstractError
  implements ErrorWithMeta
{
  public clipanion = {type: 'none'} as const;
}

export class UnknownConfigurationError
  extends AbstractError
  implements ErrorWithMeta
{
  public clipanion = {type: 'none'} as const;
}

export class InvalidBuilderSpecifiedError
  extends AbstractError
  implements ErrorWithMeta
{
  public clipanion = {type: 'none'} as const;
}

export class InvalidBuilderError
  extends AbstractError
  implements ErrorWithMeta
{
  public clipanion = {type: 'none'} as const;
}

export class UnknownTargetError extends AbstractError implements ErrorWithMeta {
  public clipanion = {type: 'none'} as const;
}
