import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiException } from '../errors/api.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof ApiException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // ValidationPipe / malformed JSON → VALIDATION_ERROR
      if (status === HttpStatus.BAD_REQUEST) {
        const message = this.extractValidationMessage(body);
        response.status(status).json({
          error: {
            code: 'VALIDATION_ERROR',
            message,
          },
        });
        return;
      }

      // Unexpected Nest HTTP exceptions — keep internals private
      this.logger.error(
        `Unhandled HttpException (${status})`,
        exception instanceof Error ? exception.stack : undefined,
      );
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        },
      });
      return;
    }

    // Express body-parser / Nest may surface malformed JSON as SyntaxError.
    if (
      exception instanceof SyntaxError ||
      (exception instanceof Error &&
        /Unexpected token|JSON/i.test(exception.message))
    ) {
      response.status(HttpStatus.BAD_REQUEST).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body must be valid JSON.',
        },
      });
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
  }

  private extractValidationMessage(body: string | object): string {
    if (typeof body === 'string' && body.trim()) {
      return body;
    }

    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;

      if (Array.isArray(record.message) && record.message.length > 0) {
        return record.message.map(String).join('; ');
      }

      if (typeof record.message === 'string' && record.message.trim()) {
        return record.message;
      }
    }

    return 'Request validation failed.';
  }
}
