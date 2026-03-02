import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ConstraintViolationException } from './constraint-violation.exception';

@Catch(ConstraintViolationException)
export class ConstraintViolationFilter implements ExceptionFilter {
  catch(exception: ConstraintViolationException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const payload = exception.getResponse();

    response.status(HttpStatus.BAD_REQUEST).json(payload);
  }
}
