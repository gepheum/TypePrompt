/**
 * If this error is thrown during the execution of the compiler, the message will be
 * printed to stderr before exiting. The stack trace will not be printed.
 */
export class ExitError extends Error {
  static wrap(error: Error): ExitError {
    if (error instanceof ExitError) {
      return error;
    }
    return new ExitError(error.message);
  }
}
