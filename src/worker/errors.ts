export class UserInputError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string, cause?: unknown) {
    super(userMessage, { cause });
    this.name = "UserInputError";
    this.userMessage = userMessage;
  }
}

export function isUserInputError(error: unknown): error is UserInputError {
  return error instanceof UserInputError;
}
