import { Db, MongoClient } from "mongodb";
import mongoose from "mongoose";

const DB_NAME = "hiring_with_ai";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

interface MongoCache {
  client: MongoClient | null;
  db: Db | null;
  promise: Promise<Db> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
  // eslint-disable-next-line no-var
  var mongoCache: MongoCache | undefined;
}

const cached: MongooseCache = globalThis.mongooseCache ?? { conn: null, promise: null };
globalThis.mongooseCache = cached;

const mongoCached: MongoCache = globalThis.mongoCache ?? {
  client: null,
  db: null,
  promise: null,
};
globalThis.mongoCache = mongoCached;

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  return uri;
}

export async function getDb(): Promise<Db> {
  if (mongoCached.db) return mongoCached.db;

  if (!mongoCached.promise) {
    const uri = getMongoUri();
    mongoCached.client = new MongoClient(uri);
    mongoCached.promise = mongoCached.client
      .connect()
      .then((client) => client.db(DB_NAME))
      .catch((err) => {
        mongoCached.client = null;
        mongoCached.promise = null;
        throw err;
      });
  }

  mongoCached.db = await mongoCached.promise;
  return mongoCached.db;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(getMongoUri(), { dbName: DB_NAME })
      .then((m) => m)
      .catch((err) => {
        cached.promise = null; // allow retry on next request
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
