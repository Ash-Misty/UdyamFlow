import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import { config } from './config.js';

const connectionOptions = { serverSelectionTimeoutMS: 2500 };

function localMongoDetails() {
  const uri = new URL(config.mongoUri);
  const isLocal = ['127.0.0.1', 'localhost'].includes(uri.hostname);
  if (!isLocal) throw new Error('AUTO_START_MONGO only supports a local MongoDB URI. Set AUTO_START_MONGO=false for a managed MongoDB deployment.');
  return { host: uri.hostname, port: Number(uri.port || 27017) };
}

function mongoBinary() {
  if (process.env.MONGOD_BINARY) return process.env.MONGOD_BINARY;
  const windowsDefault = 'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.exe';
  return process.platform === 'win32' && existsSync(windowsDefault) ? windowsDefault : 'mongod';
}

async function waitForServer(uri, attempts = 30) {
  let latestError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1000 });
    try {
      await client.connect();
      await client.db('admin').command({ ping: 1 });
      await client.close();
      return;
    } catch (error) {
      latestError = error;
      await client.close().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw latestError || new Error('MongoDB did not start in time.');
}

async function initialiseReplicaSet(host, port) {
  const client = new MongoClient(`mongodb://${host}:${port}/admin?directConnection=true`, connectionOptions);
  try {
    await client.connect();
    const admin = client.db('admin').admin();
    try {
      await admin.command({ replSetGetStatus: 1 });
    } catch (error) {
      if (![23, 94].includes(error.code)) throw error;
      await admin.command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: `${host}:${port}` }] } });
    }
  } finally {
    await client.close();
  }
}

async function connectWithRetry(attempts = 30) {
  let latestError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await mongoose.connect(config.mongoUri, connectionOptions);
      return;
    } catch (error) {
      latestError = error;
      await mongoose.disconnect().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw latestError || new Error('MongoDB replica set did not become ready.');
}

export async function connectDatabase() {
  try {
    await mongoose.connect(config.mongoUri, connectionOptions);
    return;
  } catch (firstError) {
    await mongoose.disconnect().catch(() => {});
    if (!config.autoStartMongo) {
      throw new Error(`Could not connect to MongoDB at ${config.mongoUri}. Start MongoDB or set AUTO_START_MONGO=true for local development.`, { cause: firstError });
    }
  }

  const { host, port } = localMongoDetails();
  const dataPath = process.env.MONGOD_DATA_PATH || fileURLToPath(new URL('../../.data/mongodb', import.meta.url));
  await mkdir(dataPath, { recursive: true });
  const processHandle = spawn(mongoBinary(), [
    '--replSet', 'rs0', '--bind_ip', '127.0.0.1', '--port', String(port), '--dbpath', dataPath,
  ], { detached: true, stdio: 'ignore', windowsHide: true });
  processHandle.unref();
  processHandle.once('error', (error) => {
    console.error(`Could not start local MongoDB: ${error.message}`);
  });

  await waitForServer(`mongodb://${host}:${port}/admin?directConnection=true`);
  await initialiseReplicaSet(host, port);
  await connectWithRetry();
}
