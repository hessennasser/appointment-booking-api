import { HttpException, HttpStatus } from '@nestjs/common';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'SLOT_NOT_FOUND'
  | 'SLOT_UNAVAILABLE'
  | 'BOOKING_NOT_FOUND'
  | 'INTERNAL_ERROR';

export class ApiException extends HttpException {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    status: HttpStatus,
  ) {
    super({ error: { code, message } }, status);
  }
}

export function validationError(message: string): ApiException {
  return new ApiException('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST);
}

export function slotNotFound(): ApiException {
  return new ApiException(
    'SLOT_NOT_FOUND',
    'No slot exists with the given id.',
    HttpStatus.NOT_FOUND,
  );
}

export function slotUnavailable(): ApiException {
  return new ApiException(
    'SLOT_UNAVAILABLE',
    'This slot already has an active booking.',
    HttpStatus.CONFLICT,
  );
}

export function bookingNotFound(): ApiException {
  return new ApiException(
    'BOOKING_NOT_FOUND',
    'No booking exists with the given id.',
    HttpStatus.NOT_FOUND,
  );
}

export function internalError(): ApiException {
  return new ApiException(
    'INTERNAL_ERROR',
    'An unexpected error occurred.',
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
