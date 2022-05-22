/**
 * @typedef {object} Logger
 * @property {(message: string) => void} debug
 * @property {(message: string) => void} info
 * @property {(message: string) => void} warn
 * @property {(message: string) => void} error
 */

/** @type {Logger} */
export const defaultLogger = console;
