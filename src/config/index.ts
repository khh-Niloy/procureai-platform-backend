import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root .env file
dotenv.config({ path: path.join(process.cwd(), '.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-key-12345',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key-12345',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  corsOrigins: (
    process.env.CORS_ORIGIN ||
    'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001'
  )
    .split(',')
    .map((origin) => origin.trim()),
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:3000').replace(
    /\/+$/,
    '',
  ),
  mail: {
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || 'user@example.com',
    pass: process.env.SMTP_PASS || 'password',
    from: process.env.SMTP_FROM || 'ProcureAI <no-reply@procure.ai>',
  },
  platformName: process.env.PLATFORM_NAME || 'ProcureAi',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiTimeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS || '30000', 10),
  geminiMaxRetries: parseInt(process.env.GEMINI_MAX_RETRIES || '2', 10),
  geminiMaxInputBytes: parseInt(
    process.env.GEMINI_MAX_INPUT_BYTES || '75000',
    10,
  ),
};
