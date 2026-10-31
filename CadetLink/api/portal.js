import { getDatabaseAdmin, json, requireAccount } from "../lib/server-auth.js";

const ROOT = "portal";
const MAX_TEXT = 500;

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { error: "Method not allowed." });
  }

  let database;
  try {
    database = getDatabaseAdmin();
  } catch (error) {
    console.error("Portal API is not configured:", error.message);
    return json(res, 503, { error: "Secure portal access is not configured yet." });
  }

  try {
    const session = await requireAccount(req, database);
    if (!session) return json(res, 401, { error: "Your session expired. Sign in again." });
    const body = req.method === "POST" ? req.body : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(res, 400, { error: "Invalid request." });
    const operation = req.method === "GET" ? req.query?.kind : body.kind;
    return await handleOperation(operation, body, session, database, res);
  } catch (error) {
    console.error("Portal operation failed:", error);
    return json(res, 500, { error: "Could not load or update this dashboard section." });
  }
}

async function handleOperation(operation, body, session, database, res) {
  switch (operation) {
    case "infirmary":
      return handleInfirmary(body, session, database, res);
    case "books":
      return handleBooks(body, session, database, res);
    case "payables":
      return handlePayables(body, session, database, res);
    case "food-concerns":
      return handleFoodConcerns(body, session, database, res);
    case "cadet-profiles":
      return handleCadetProfiles(body, session, database, res);
    default:
      return json(res, 400, { error: "Unknown dashboard section." });
  }
}

async function handleInfirmary(body, session, database, res) {
  const ref = database.ref(`${ROOT}/infirmary`);
  if (body.operation === "infirmary-upsert" || body.operation === "infirmary-delete") {
    if (!hasRole(session.account, "CCA", "Nurse")) return forbidden(res);
    if (body.operation === "infirmary-delete") {
      if (!validId(body.id)) return invalid(res);
      await ref.child(body.id).remove();
      return json(res, 200, { ok: true });
    }

    const cadetName = cleanText(body.cadetName, 100);
    const reason = cleanText(body.reason, MAX_TEXT);
    if (!cadetName || !reason) return invalid(res);
    const record = {
      cadetName,
      reason,
      updatedAt: new Date().toISOString(),
      updatedBy: session.uid
    };
    const id = validId(body.id) ? body.id : ref.push().key;
    await ref.child(id).set(record);
    return json(res, 200, { id, record });
  }

  const snapshot = await ref.once("value");
  const records = toList(snapshot.val());
  if (session.account.category === "Normal Cadet") return json(res, 200, { count: records.length });
  if (!isStaff(session.account)) return forbidden(res);
  return json(res, 200, { count: records.length, records });
}

async function handleBooks(body, session, database, res) {
  const role = session.account;
  const canManage = hasRole(role, "CAA", "Instructor");
  const canView = canManage || hasRole(role, "CAA", "KRC");
  const ref = database.ref(`${ROOT}/books`);
  if (body.operation === "book-upsert" || body.operation === "book-delete") {
    if (!canManage) return forbidden(res);
    if (body.operation === "book-delete") {
      if (!validId(body.id)) return invalid(res);
      await ref.child(body.id).remove();
      return json(res, 200, { ok: true });
    }
    const instructor = cleanText(body.instructor, 100);
    const title = cleanText(body.title, 160);
    if (!instructor || !title) return invalid(res);
    const record = { instructor, title, updatedAt: new Date().toISOString() };
    const id = validId(body.id) ? body.id : ref.push().key;
    await ref.child(id).set(record);
    return json(res, 200, { id, record });
  }
  if (!canView) return forbidden(res);
  return json(res, 200, { records: toList((await ref.once("value")).val()) });
}

async function handlePayables(body, session, database, res) {
  const role = session.account;
  const canManage = hasRole(role, "CAA", "KRC");
  const ref = database.ref(`${ROOT}/payables`);
  if (body.operation === "payable-upsert" || body.operation === "payable-delete") {
    if (!canManage) return forbidden(res);
    if (body.operation === "payable-delete") {
      if (!validId(body.id)) return invalid(res);
      await ref.child(body.id).remove();
      return json(res, 200, { ok: true });
    }
    const cadetUid = typeof body.cadetUid === "string" ? body.cadetUid : "";
    const totalAmount = Number(body.totalAmount);
    if (!validId(cadetUid) || !Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 100000000) return invalid(res);
    const cadetSnapshot = await database.ref(`cadets/${cadetUid}`).once("value");
    const cadetAccount = cadetSnapshot.val();
    if (cadetAccount?.category !== "Normal Cadet") return invalid(res);
    const record = { cadetUid, cadetName: cadetAccount.name || "", totalAmount, updatedAt: new Date().toISOString() };
    const id = validId(body.id) ? body.id : ref.push().key;
    await ref.child(id).set(record);
    return json(res, 200, { id, record });
  }

  if (role.category === "Normal Cadet" || role.category === "CLC") {
    const allRecords = toList((await ref.once("value")).val());
    const ownRecords = allRecords.filter((record) => record.cadetUid === session.uid);
    return json(res, 200, { records: ownRecords, totalAmount: ownRecords.reduce((sum, item) => sum + item.totalAmount, 0) });
  }
  if (!canManage) return forbidden(res);
  return json(res, 200, { records: toList((await ref.once("value")).val()) });
}

async function handleFoodConcerns(body, session, database, res) {
  const role = session.account;
  const canManage = hasRole(role, "CCA", "Galley");
  const ref = database.ref(`${ROOT}/foodConcerns`);
  if (body.operation === "food-submit") {
    if (role.category !== "Normal Cadet" && role.category !== "CLC") return forbidden(res);
    const concern = cleanText(body.concern, MAX_TEXT);
    if (!concern) return invalid(res);
    const record = {
      cadetUid: session.uid,
      cadetName: role.name || "",
      concern,
      submittedAt: new Date().toISOString()
    };
    const id = ref.push().key;
    await ref.child(id).set(record);
    return json(res, 201, { id, record });
  }
  if (canManage) return json(res, 200, { records: toList((await ref.once("value")).val()) });
  if (role.category === "Normal Cadet" || role.category === "CLC") {
    return json(res, 200, { records: toList((await ref.once("value")).val()).filter((item) => item.cadetUid === session.uid) });
  }
  return forbidden(res);
}

async function handleCadetProfiles(body, session, database, res) {
  if (body.operation === "profile-section-update") {
    if (session.account.category !== "CLC" || !validId(body.uid)) return forbidden(res);
    const section = typeof body.section === "string" ? body.section.trim() : null;
    if (section === null || section.length > 80) return invalid(res);
    const target = await database.ref(`cadets/${body.uid}`).once("value");
    if (target.val()?.category !== "Normal Cadet") return invalid(res);
    await database.ref(`cadets/${body.uid}/section`).set(section);
    return json(res, 200, { ok: true });
  }
  if (session.account.category !== "CLC"
    && !hasRole(session.account, "CAA", "Instructor")
    && !hasRole(session.account, "CAA", "KRC")) return forbidden(res);
  const snapshot = await database.ref("cadets").once("value");
  const accounts = snapshot.val() || {};
  const cadets = Object.entries(accounts)
    .filter(([, account]) => account?.category === "Normal Cadet")
    .map(([uid, account]) => ({
      uid,
      name: account.name || "",
      cadetNumber: account.cadetNumber || "",
      category: account.category,
      profilePicture: account.profilePicture || "",
      section: account.section || ""
    }));
  return json(res, 200, { cadets });
}

function isStaff(account) {
  return account.category === "Admin" || account.category === "CLC"
    || account.category === "CCA" || account.category === "CAA";
}

function hasRole(account, category, subcategory) {
  return account.category === category && account.subcategory === subcategory;
}

function toList(value) {
  return value && typeof value === "object"
    ? Object.entries(value).map(([id, record]) => ({ ...record, id }))
    : [];
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text && text.length <= maxLength ? text : "";
}

function validId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function invalid(res) {
  return json(res, 400, { error: "The dashboard section details are invalid." });
}

function forbidden(res) {
  return json(res, 403, { error: "Your account cannot access this dashboard section." });
}
