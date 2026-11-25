import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { config } from './config.js';
import { connectDatabase } from './local-mongo.js';
import authRoutes from './routes/auth.js';
import masterRoutes from './routes/masters.js';
import operationRoutes from './routes/operations.js';
import inventoryRoutes from './routes/inventory.js';
import reportRoutes from './routes/reports.js';
import invoiceRoutes from './routes/invoices.js';
import dashboardRoutes from './routes/dashboard.js';
import auditRoutes from './routes/audit.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production.');
}

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.clientOrigin.split(',').map((origin) => origin.trim()) }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));
app.use('/api/auth', authRoutes);
app.use('/api/masters', masterRoutes);
app.use('/api', operationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use((_req, res) => res.status(404).json({ message: 'That API route does not exist.' }));
app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error.code === 11000) return res.status(409).json({ message: 'That record already exists.' });
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: error.message });
  }
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({ message: status >= 500 ? 'The request could not be completed. Please try again.' : error.message });
});

await connectDatabase();
const server = app.listen(config.port, () => console.log(`UdyamFlow API listening on http://localhost:${config.port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  }));
}
