import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

export const config = {
  port: Number(process.env.PORT || 4000),
  // Port 27018 avoids a common conflict with a standalone MongoDB Windows service on 27017.
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/udyamflow?replicaSet=rs0',
  jwtSecret: process.env.JWT_SECRET || 'udyamflow-local-development-secret-change-before-deploy',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // Local development convenience: the API starts a local MongoDB daemon if needed.
  // Set this to false when MongoDB is supplied by a service or another machine.
  autoStartMongo: process.env.AUTO_START_MONGO
    ? process.env.AUTO_START_MONGO.toLowerCase() === 'true'
    : process.env.NODE_ENV !== 'production',
};
