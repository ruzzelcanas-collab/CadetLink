import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const PASSWORD_ITERATIONS = 210000;
const DEFAULT_DATABASE_URL = "https://cadetlink-d53c4-default-rtdb.asia-southeast1.firebasedatabase.app";

export function getDatabaseAdmin() {
  const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const sessionSecret = process.env.CADETLINK_SESSION_SECRET;
  if (!serviceAccountValue || !sessionSecret || sessionSecret.length < 32) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON and a 32-character CADETLINK_SESSION_SECRET are required.");
  }

  if (!getApps().length) {
    const serviceAccount = JSON.parse(serviceAccountValue);
    initializeApp({
      credential: cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || DEFAULT_DATABASE_URL
    });
  }
  return getDatabase();
}

export function json(res, status, value) {
  return res.status(status).json(value);
}

export function safeAccount(account) {
  return {
    name: account.name || "",
    cadetNumber: account.cadetNumber || "",
    category: account.category || "Normal Cadet",
    subcategory: account.subcategory || "",
    section: account.section || "",
    profilePicture: account.profilePicture || ""
  };
}

export function makeSessionToken(uid) {
  const secret = process.env.CADETLINK_SESSION_SECRET;
  const payload = encodeBase64Url(JSON.stringify({
    sub: uid,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  }));
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export async function requireAccount(req, database) {
  const authorization = req.headers.authorization || "";
  const [payload, signature, extra] = authorization.replace(/^Bearer\s+/i, "").split(".");
  if (!payload || !signature || extra) return null;

  const expected = createHmac("sha256", process.env.CADETLINK_SESSION_SECRET).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let session;
  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof session.sub !== "string" || session.exp <= Math.floor(Date.now() / 1000)) return null;

  const snapshot = await database.ref(`cadets/${session.sub}`).once("value");
  const account = snapshot.val();
  return account?.password?.hash ? { uid: session.sub, account } : null;
}

export function verifyPassword(password, credential) {
  if (typeof password !== "string" || !credential?.salt || !credential?.hash) return false;
  const iterations = Number(credential.iterations);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;
  const salt = Buffer.from(credential.salt, "base64");
  const expected = Buffer.from(credential.hash, "base64");
  if (!salt.length || expected.length !== 32) return false;
  const actual = pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
  return timingSafeEqual(actual, expected);
}

export function createPasswordRecord(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, "sha256");
  return {
    algorithm: "PBKDF2-SHA-256",
    iterations: PASSWORD_ITERATIONS,
    salt: salt.toString("base64"),
    hash: hash.toString("base64")
  };
}

export function isValidCategory(category, subcategory) {
  const subcategories = {
    CCA: ["Nurse", "Galley", "CCO/TLU"],
    CAA: ["Instructor", "KRC"]
  };
  if (["CLC", "Normal Cadet"].includes(category)) return !subcategory;
  return Object.hasOwn(subcategories, category) && subcategories[category].includes(subcategory);
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}
