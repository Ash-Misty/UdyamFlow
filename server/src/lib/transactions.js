import { Counter } from '../models/index.js';

export async function inTransaction(work) {
  const session = await (await import('mongoose')).default.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function nextNumber(session, name) {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session },
  );
  return counter.seq;
}
