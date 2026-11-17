import {
  createPasswordRecord,
  getDatabaseAdmin,
  isValidCategory,
  json,
  requireAccount,
  safeAccount
} from "../lib/server-auth.js";

const MAX_NAME_LENGTH = 100;
const MAX_CADET_NUMBER_LENGTH = 40;
const MAX_SECTION_LENGTH = 80;
const UID_PATTERN = /^[A-Fa-f0-9]{8,40}$/;

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { error: "Method not allowed." });
  }

  let database;
  try {
    database = getDatabaseAdmin();
  } catch (error) {
    console.error("Admin API is not configured:", error.message);
    return json(res, 503, { error: "Secure account access is not configured yet." });
  }

  try {
    const session = await requireAccount(req, database);
    if (!session) return json(res, 401, { error: "Your session expired. Sign in again." });
    if (session.account.category !== "Admin") return json(res, 403, { error: "Admin access is required." });

    if (req.method === "GET") return await readAdminData(req, database, res);
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(res, 400, { error: "Invalid request." });
    }
    return await updateAdminData(body, session, database, res);
  } catch (error) {
    console.error("Admin operation failed:", error);
    return json(res, 500, { error: "Could not complete the Admin request." });
  }
}

async function readAdminData(req, database, res) {
  const kind = req.query?.kind;
  if (kind === "accounts") {
    const snapshot = await database.ref("cadets").once("value");
    const accounts = snapshot.val() || {};
    return json(res, 200, {
      accounts: Object.entries(accounts)
        .filter(([, account]) => account && typeof account === "object")
        .map(([uid, account]) => {
          const safe = safeAccount(account);
          const isLegacyInstructor = safe.category === "Faculty";
          return {
            uid,
            ...safe,
            ...(isLegacyInstructor ? { category: "CAA", subcategory: "Instructor" } : {}),
            active: account.active !== false
          };
        })
    });
  }

  if (kind === "summary") {
    const [infirmarySnapshot, reportsSnapshot] = await Promise.all([
      database.ref("portal/infirmary").once("value"),
      database.ref("devilsReports").once("value")
    ]);
    return json(res, 200, {
      infirmaryPatientCount: countRecords(infirmarySnapshot.val()),
      devilReportCount: countRecords(reportsSnapshot.val())
    });
  }

  if (kind === "activity") {
    const snapshot = await database.ref("system/loginActivity").once("value");
    const events = snapshot.val() || {};
    const activity = Object.entries(events)
      .filter(([, event]) => event && typeof event === "object")
      .map(([id, event]) => ({ id, ...event }))
      .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
      .slice(0, 100);
    return json(res, 200, { activity });
  }

  return json(res, 400, { error: "Unknown Admin data section." });
}

async function updateAdminData(body, session, database, res) {
  if (body.action === "create-account") return createAccount(body, database, res);
  if (body.action === "update-account") return updateAccount(body, session, database, res);
  if (body.action === "set-account-active") return setAccountActive(body, session, database, res);
  return json(res, 400, { error: "Unknown Admin action." });
}

async function createAccount(body, database, res) {
  const uid = normalizeUid(body.uid);
  const details = validateAccountDetails(body);
  if (!uid || !details || typeof body.password !== "string"
    || body.password.length < 8 || body.password.length > 200) {
    return json(res, 400, { error: "Enter a valid UID, account category, name, and password of 8–200 characters." });
  }

  const accounts = (await database.ref("cadets").once("value")).val() || {};
  if (hasDuplicateAccount(accounts, uid, details)) {
    return json(res, 409, { error: "An account with that name or cadet number already exists." });
  }

  const account = {
    ...details,
    password: createPasswordRecord(body.password),
    active: true,
    registeredAt: new Date().toISOString()
  };
  const result = await database.ref(`cadets/${uid}`).transaction((current) => current ? undefined : account);
  if (!result.committed) return json(res, 409, { error: "That UID is already assigned to an account." });
  return json(res, 201, { uid, account: { ...safeAccount(account), active: true } });
}

async function updateAccount(body, session, database, res) {
  const currentUid = normalizeUid(body.uid);
  const newUid = normalizeUid(body.newUid || body.uid);
  const details = validateAccountDetails(body);
  if (!currentUid || !newUid || !details) {
    return json(res, 400, { error: "Enter a valid UID, account category, and name." });
  }

  if (currentUid === session.uid) {
    return json(res, 400, { error: "You cannot change your own Admin account through Cadet Management." });
  }

  const cadetsRef = database.ref("cadets");
  let failure;
  const result = await cadetsRef.transaction((current) => {
    if (!current || !current[currentUid]) {
      failure = "missing";
      return;
    }
    const account = current[currentUid];
    if (account.category === "Admin") {
      failure = "admin";
      return;
    }
    if (hasDuplicateAccount(current, currentUid, details)) {
      failure = "duplicate-details";
      return;
    }
    if (newUid !== currentUid && current[newUid]) {
      failure = "duplicate";
      return;
    }

    const updated = { ...account, ...details };
    const next = { ...current };
    if (newUid !== currentUid) delete next[currentUid];
    next[newUid] = updated;
    return next;
  });

  if (!result.committed) {
    if (failure === "missing") return json(res, 404, { error: "The account was not found." });
    if (failure === "admin") return json(res, 403, { error: "Admin accounts cannot be edited here." });
    if (failure === "duplicate") return json(res, 409, { error: "That UID is already assigned to an account." });
    if (failure === "duplicate-details") return json(res, 409, { error: "An account with that name or cadet number already exists." });
    return json(res, 409, { error: "The account could not be updated. Reload the list and try again." });
  }

  const account = result.snapshot.val()[newUid];
  return json(res, 200, { uid: newUid, account: { ...safeAccount(account), active: account.active !== false } });
}

async function setAccountActive(body, session, database, res) {
  const uid = normalizeUid(body.uid);
  if (!uid || typeof body.active !== "boolean") {
    return json(res, 400, { error: "Choose an account and a valid active status." });
  }
  if (uid === session.uid) return json(res, 400, { error: "You cannot deactivate your own Admin account." });

  const accountRef = database.ref(`cadets/${uid}`);
  const result = await accountRef.transaction((current) => {
    if (!current || current.category === "Admin") return;
    return { ...current, active: body.active };
  });
  if (!result.committed) {
    const current = (await accountRef.once("value")).val();
    if (!current) return json(res, 404, { error: "The account was not found." });
    if (current.category === "Admin") return json(res, 403, { error: "Admin accounts cannot be deactivated here." });
    return json(res, 409, { error: "The account status could not be changed. Try again." });
  }
  return json(res, 200, { uid, active: body.active });
}

function validateAccountDetails(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category = body.category;
  const subcategory = typeof body.subcategory === "string" ? body.subcategory : "";
  const cadetNumber = typeof body.cadetNumber === "string" ? body.cadetNumber.trim() : "";
  const section = typeof body.section === "string" ? body.section.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH
    || !isValidCategory(category, subcategory)
    || cadetNumber.length > MAX_CADET_NUMBER_LENGTH
    || section.length > MAX_SECTION_LENGTH
    || (["Normal Cadet", "CLC"].includes(category) && !cadetNumber)) return null;
  return { name, cadetNumber, category, subcategory, section };
}

function normalizeUid(uid) {
  return typeof uid === "string" && UID_PATTERN.test(uid.trim())
    ? uid.trim().toUpperCase()
    : "";
}

function hasDuplicateAccount(accounts, ignoredUid, details) {
  const normalizedName = details.name.toLocaleLowerCase();
  const hasCadetNumber = ["Normal Cadet", "CLC"].includes(details.category);
  return Object.entries(accounts).some(([uid, account]) => {
    if (uid === ignoredUid || !account) return false;
    return String(account.name || "").trim().toLocaleLowerCase() === normalizedName
      || (hasCadetNumber && String(account.cadetNumber || "").trim() === details.cadetNumber);
  });
}

function countRecords(value) {
  return value && typeof value === "object" ? Object.keys(value).length : 0;
}
