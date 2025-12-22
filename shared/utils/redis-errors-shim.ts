/**
 * Redis Errors Shim
 *
 * This module provides a clean wrapper around the redis-errors package required by `iovalkey`
 * to avoid bundling issues with its conditional CommonJS requires.
 */

// AI-NOTE: This shim bypasses the problematic conditional require in redis-errors/index.js which
// checks Node.js version and dynamically requires either './lib/old' or './lib/modern'. We
// directly recreate the error classes since they're simple and small.

import { Buffer } from "node:buffer";

/**
 * Base Redis Error
 */
export class RedisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Reply Error - thrown when Redis returns an error reply
 */
export class ReplyError extends RedisError {
  command?: { name: string; args: unknown[] };

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, ReplyError.prototype);
  }
}

/**
 * Parser Error - thrown when response parsing fails
 */
export class ParserError extends RedisError {
  buffer?: Buffer;
  offset?: number;

  constructor(message: string, buffer?: Buffer, offset?: number) {
    super(message);
    this.buffer = buffer;
    this.offset = offset;
    Object.setPrototypeOf(this, ParserError.prototype);
  }
}

/**
 * Abort Error - thrown when a command is aborted
 */
export class AbortError extends RedisError {
  command?: { name: string; args: unknown[] };

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, AbortError.prototype);
  }
}

// Default export for CommonJS compatibility
export default {
  RedisError,
  ReplyError,
  ParserError,
  AbortError,
};
