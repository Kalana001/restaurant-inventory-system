import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS
app.use(cors({
  origin: '*', // Allow all origins for development, refine in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use(morgan('dev'));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'success',
    message: 'Restaurant Inventory System API is healthy',
    timestamp: new Date().toISOString()
  });
});

import apiRouter from './routes';

// Mounting APIs
app.use('/api/v1', apiRouter);

import { errorHandler } from './middlewares/errorHandler';

// Centralized error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`[server]: API Server is running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

export default app;
