import type { ApiErrorBody, ValidationDetails } from '@bookleaf/shared';
import type { ErrorRequestHandler } from 'express';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }
}

export const unauthenticated = () => new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');

export const notFound = () => new ApiError(404, 'NOT_FOUND', 'Not found.');

export const conflict = (message: string) => new ApiError(409, 'CONFLICT', message);

export const validationFailed = (details: ValidationDetails) =>
  new ApiError(400, 'VALIDATION_FAILED', 'The request is not valid.', details);

// Errors thrown by Express and body-parser carry a status and an `expose` flag.
function isClientHttpError(error: unknown): error is { status: number; message: string; type?: string } {
  if (typeof error !== 'object' || error === null) return false;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isClientHttpError(error)) {
    if (error.type === 'entity.parse.failed') {
      return new ApiError(400, 'VALIDATION_FAILED', 'The request body is not valid JSON.', { fields: [] });
    }
    return new ApiError(error.status, 'BAD_REQUEST', 'The request could not be processed.');
  }
  console.error(error);
  return new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  // The response has started, so the only option left is for Express to close the connection.
  if (res.headersSent) {
    next(error);
    return;
  }
  const { status, code, message, details } = toApiError(error);
  res.status(status).json({ error: { code, message, details } } satisfies ApiErrorBody);
};
