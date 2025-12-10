/**
 * Database Error Class
 *
 * Custom error type for database operations with operation context.
 */

export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DatabaseError";
  }

  static notConnected(operation: string): DatabaseError {
    return new DatabaseError(
      "Database not connected. Call connect() first.",
      operation,
    );
  }

  static operationFailed(
    operation: string,
    details: string,
    cause?: unknown,
  ): DatabaseError {
    return new DatabaseError(
      `${operation} failed: ${details}`,
      operation,
      cause,
    );
  }
}
