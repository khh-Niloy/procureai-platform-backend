export const mailConfig = {
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  user: process.env.SMTP_USER || 'user@example.com',
  pass: process.env.SMTP_PASS || 'password',
  from: process.env.SMTP_FROM || 'ProcureAI <no-reply@procure.ai>',
};
