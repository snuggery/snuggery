/**
 * @fileoverview
 *
 * This file contains different error types used throughout the SnuggeryArchitectHost.
 */

import type {ErrorWithMeta} from 'clipanion';

export class UnknownBuilderError extends Error implements ErrorWithMeta {
  public clipanion = {type: 'none'} as const;

  constructor(message: string) {
    super(message);
    this.name = 'UnknownBuilderError';
  }
}

export class UnknownConfigurationError extends Error implements ErrorWithMeta {
  public clipanion = {type: 'none'} as const;

  constructor(message: string) {
    super(message);
    this.name = 'UnknownConfigurationError';
  }
}

export class InvalidBuilderSpecifiedError
  extends Error
  implements ErrorWithMeta {
  public clipanion = {type: 'none'} as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidBuilderSpecifiedError';
  }
}

export class InvalidBuilderError extends Error implements ErrorWithMeta {
  public clipanion = {type: 'none'} as const;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidBuilderError';
  }
}

export class UnknownTargetError extends Error implements ErrorWithMeta {
  public clipanion = {type: 'none'} as const;

  constructor(message: string) {
    super(message);
    this.name = 'UnknownTargetError';
  }
}
