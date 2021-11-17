/**
 * @fileoverview
 *
 * This file contains different error types used throughout the SnuggeryArchitectHost.
 */

import {AbstractError} from '../../utils/error';

export class UnknownBuilderError extends AbstractError {}

export class UnknownConfigurationError extends AbstractError {}

export class InvalidBuilderSpecifiedError extends AbstractError {}

export class InvalidBuilderError extends AbstractError {}

export class UnknownTargetError extends AbstractError {}
