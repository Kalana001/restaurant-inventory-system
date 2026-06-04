import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || undefined;

  // Prisma Error Handling
  if (err.code) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        statusCode = 409;
        const targetFields = err.meta?.target || [];
        message = `Unique constraint failed on field(s): ${targetFields.join(', ')}`;
        break;
      case 'P2025': // Record not found
        statusCode = 404;
        message = err.meta?.cause || 'Resource not found';
        break;
      case 'P2003': // Foreign key constraint violation
        statusCode = 400;
        message = `Foreign key constraint failed on field: ${err.meta?.field_name || 'reference'}`;
        break;
      default:
        // Other Prisma errors
        if (err.message && err.message.includes('Prisma')) {
          statusCode = 400;
          message = 'Database operation failed';
        }
        break;
    }
  }

  // Log critical 500 errors
  if (statusCode === 500) {
    console.error('[ERROR HANDLER]:', err);
  }

  res.status(statusCode).json({
    status: 'error',
    message,
    errors,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
