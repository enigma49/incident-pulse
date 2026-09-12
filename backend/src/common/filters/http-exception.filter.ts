import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: any = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = (res as any).message || res;
        error = (res as any).error || error;
      }
    } else if (exception && typeof exception === 'object' && (exception as any).name === 'CastError') {
      status = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      message = `Invalid format for field ${(exception as any).path || 'id'}`;
    } else if (exception && typeof exception === 'object' && (exception as any).name === 'ValidationError') {
      status = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      message = (exception as any).message;
    } else if (exception && typeof exception === 'object' && (exception as any).code === 11000) {
      status = HttpStatus.CONFLICT;
      error = 'Conflict';
      message = 'A resource with this key already exists';
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
      // In production, do not leak raw stack / sensitive database details
      message =
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : exception.message;
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

