import { timingSafeEqual } from "node:crypto";
import {
  createPasswordRecord,
  getDatabaseAdmin,
  isValidCategory,
  json,
  makeSessionToken,
  requireAccount,
  safeAccount,
  verifyPassword
} from "../lib/server-auth.js";

const MAX_NAME_LENGTH = 100;
const MAX_PROFILE_PICTURE_LENGTH = 120000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed." });
  }

  let database;
  try {
    database = getDatabaseAdmin();
  } catch (error) {
    console.error("Authentication API is not configured:", error.message);
    return json(res, 503, { error: "Secure account access is not configured yet." });
  }

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(res, 400, { error: "Invalid request." });
  }

  try {
    if (body.action === "lookup-card") return await lookupCard(body, database, res);
    if (body.action === "register") return await registerAccount(body, database, res);
    if (body.action === "login") return await signIn(body, database, res);
    if (body.action === "admin-login") return await signIn(body, database, res, true);
    if (body.action === "setup-admin") return await setupAdmin(body, database, res);

    const session = await requireAccount(req, database);
    if (!session) return json(res, 401, { error: "Your session expired. Sign in again." });

    if (body.action === "change-password") return await changePassword(body, session, database, res);
    if (body.action === "update-profile") return await updateProfile(body, session, database, res);
    if (body.action === "get-profile") return json(res, 200, { account: safeAccount(session.account) });
    return json(res, 400, { error: "Unknown account action." });
  } catch (error) {
    console.error("Account request failed:", error);
    return json(res, 500, { error: "Could not complete the account request." });
  }
}

async function lookupCard(body, database, res) {
  if (typeof body.uid !== "string" || !/^[A-Fa-f0-9]{8,20}$/.test(body.uid)) {
    return json(res, 400, { error: "The scanned card is invalid." });
  }
  const snapshot = await database.ref(`cadets/${body.uid.toUpperCase()}`).once("value");
  const account = snapshot.val();
  if (!account) return json(res, 200, { exists: false });
  const accountForClient = account.category === "Faculty"
    ? { ...account, category: "CAA", subcategory: "Instructor" }
    : account;
  return json(res, 200, {
    exists: true,
    needsPasswordSetup: !account.password?.hash || !account.password?.salt,
    account: safeAccount(accountForClient)
  });
}

async function registerAccount(body, database, res) {
  const { uid, name, cadetNumber, category, subcategory, password } = body;
  if (typeof uid !== "string" || !/^[A-Fa-f0-9]{8,40}$/.test(uid)
    || typeof name !== "string" || !name.trim() || name.trim().length > MAX_NAME_LENGTH
    || typeof password !== "string" || password.length < 8 || password.length > 200
    || !isValidCategory(category, subcategory)
    || (["Normal Cadet", "CLC"].includes(category) && (typeof cadetNumber !== "string" || !cadetNumber.trim()))) {
    return json(res, 400, { error: "The registration details are incomplete or invalid." });
  }

  const accountsSnapshot = await database.ref("cadets").once("value");
  const accounts = accountsSnapshot.val() || {};
  const normalizedName = name.trim().toLocaleLowerCase();
  const hasCadetNumber = ["Normal Cadet", "CLC"].includes(category);
  const duplicate = Object.entries(accounts).some(([existingUid, account]) => {
    if (existingUid === uid || !account) return false;
    return String(account.name || "").trim().toLocaleLowerCase() === normalizedName
      || (hasCadetNumber && String(account.cadetNumber || "").trim() === cadetNumber.trim());
  });
  if (duplicate) return json(res, 409, { error: "An account with those details already exists." });

  const accountRef = database.ref(`cadets/${uid}`);
  const result = await accountRef.transaction((current) => {
    if (current?.password?.hash) return;
    return {
      ...(current && typeof current === "object" ? current : {}),
      name: name.trim(),
      cadetNumber: hasCadetNumber ? cadetNumber.trim() : "",
      category,
      subcategory: subcategory || "",
      password: createPasswordRecord(password),
      registeredAt: current?.registeredAt || new Date().toISOString()
    };
  });
  if (!result.committed) return json(res, 409, { error: "This card already has an account. Sign in instead." });

  const account = result.snapshot.val();
  return json(res, 201, { uid, token: makeSessionToken(uid), account: safeAccount(account) });
}

async function signIn(body, database, res, isAdminLogin = false) {
  const { subcategory, name, cadetNumber, password } = body;
  const category = isAdminLogin ? "Admin" : body.category;
  if (!(isAdminLogin ? !subcategory : isValidCategory(category, subcategory))
    || typeof password !== "string" || password.length > 200) {
    return json(res, 400, { error: "Choose a valid account category and subcategory." });
  }

  const staffLogin = isAdminLogin || ["CCA", "CAA"].includes(category);
  const nameQuery = typeof name === "string" ? name.trim() : "";
  const numberQuery = typeof cadetNumber === "string" ? cadetNumber.trim() : "";
  if (!nameQuery || (!staffLogin && !numberQuery)) {
    return json(res, 400, { error: "Enter the required account details." });
  }

  const field = staffLogin ? "name" : "cadetNumber";
  const lookup = staffLogin ? nameQuery : numberQuery;
  const snapshot = await database.ref("cadets").orderByChild(field).equalTo(lookup).once("value");
  let match = null;
  snapshot.forEach((child) => {
    const account = child.val();
    const isLegacyInstructor = category === "CAA"
      && subcategory === "Instructor"
      && account?.category === "Faculty";
    if (!account || (account.category !== category && !isLegacyInstructor)) return;
    const nameMatches = String(account.name || "").trim().toLocaleLowerCase() === nameQuery.toLocaleLowerCase();
    const numberMatches = staffLogin || String(account.cadetNumber || "").trim() === numberQuery;
    const subcategoryMatches = isLegacyInstructor || (category !== "CCA" && category !== "CAA")
      ? true
      : account.subcategory === subcategory;
    if (nameMatches && numberMatches && subcategoryMatches && verifyPassword(password, account.password)) {
      match = { uid: child.key, account, isLegacyInstructor };
    }
  });

  if (!match) return json(res, 401, { error: "The account details or password did not match." });
  let account = match.account;
  if (match.isLegacyInstructor) {
    const migration = await database.ref(`cadets/${match.uid}`).transaction((current) => {
      if (current?.category !== "Faculty" || !verifyPassword(password, current.password)) return;
      return { ...current, category: "CAA", subcategory: "Instructor" };
    });
    account = migration.snapshot.val();
    if (!account || account.category !== "CAA" || account.subcategory !== "Instructor") {
      return json(res, 401, { error: "The account details or password did not match." });
    }
  }
  return json(res, 200, { uid: match.uid, token: makeSessionToken(match.uid), account: safeAccount(account) });
}

async function setupAdmin(body, database, res) {
  const setupSecret = process.env.ADMIN_SETUP_SECRET;
  const providedSecret = body.setupSecret;
  const uid = typeof body.uid === "string" ? body.uid.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = body.password;
  if (!setupSecret || setupSecret.length < 32) {
    return json(res, 503, { error: "Admin setup is not enabled. Configure ADMIN_SETUP_SECRET in Vercel first." });
  }
  const providedSecretBytes = typeof providedSecret === "string" ? Buffer.from(providedSecret) : Buffer.alloc(0);
  const setupSecretBytes = Buffer.from(setupSecret);
  if (providedSecretBytes.length !== setupSecretBytes.length
    || !timingSafeEqual(providedSecretBytes, setupSecretBytes)) {
    return json(res, 403, { error: "The admin setup code is incorrect." });
  }
  if (!/^[A-F0-9]{8,20}$/.test(uid)
    || !name || name.length > MAX_NAME_LENGTH
    || typeof password !== "string" || password.length < 8 || password.length > 200) {
    return json(res, 400, { error: "Enter a valid RFID card UID, a name, and a password of at least 8 characters." });
  }

  const accountsSnapshot = await database.ref("cadets").once("value");
  const accounts = accountsSnapshot.val() || {};
  if (Object.values(accounts).some((account) => account?.category === "Admin")) {
    return json(res, 409, { error: "An Admin account already exists. Use Admin sign-in instead." });
  }

  const setupRef = database.ref("system/adminSetup");
  const claim = await setupRef.transaction((current) => current ? undefined : {
    uid,
    createdAt: new Date().toISOString()
  });
  if (!claim.committed) {
    return json(res, 409, { error: "Admin setup has already been completed. Use Admin sign-in instead." });
  }

  const account = {
    name,
    cadetNumber: "",
    category: "Admin",
    subcategory: "",
    password: createPasswordRecord(password),
    registeredAt: new Date().toISOString()
  };
  let result;
  try {
    result = await database.ref(`cadets/${uid}`).transaction((current) => current ? undefined : account);
  } catch (error) {
    await setupRef.transaction((current) => current?.uid === uid ? null : undefined);
    throw error;
  }
  if (!result.committed) {
    await setupRef.transaction((current) => current?.uid === uid ? null : undefined);
    return json(res, 409, { error: "That RFID card is already linked to an account. Use a different unregistered card." });
  }

  return json(res, 201, { ok: true, uid });
}

async function changePassword(body, session, database, res) {
  if (!verifyPassword(body.currentPassword, session.account.password)
    || typeof body.newPassword !== "string" || body.newPassword.length < 8 || body.newPassword.length > 200) {
    return json(res, 400, { error: "Current password is incorrect or the new password is invalid." });
  }

  await database.ref(`cadets/${session.uid}/password`).set(createPasswordRecord(body.newPassword));
  return json(res, 200, { ok: true });
}

async function updateProfile(body, session, database, res) {
  const targetUid = typeof body.uid === "string" ? body.uid : session.uid;
  const isSelf = targetUid === session.uid;
  const canEditAnotherSection = session.account.category === "CLC";
  if (!isSelf && !canEditAnotherSection) return json(res, 403, { error: "You cannot edit this profile." });
  if (!/^[A-Fa-f0-9]{8,40}$/.test(targetUid)) return json(res, 400, { error: "The profile identifier is invalid." });

  const updates = {};
  if (Object.hasOwn(body, "section")) {
    if (typeof body.section !== "string" || body.section.length > 80) {
      return json(res, 400, { error: "Section must be 80 characters or fewer." });
    }
    updates.section = body.section.trim();
  }

  if (Object.hasOwn(body, "profilePicture")) {
    if (!isSelf || typeof body.profilePicture !== "string"
      || (body.profilePicture && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(body.profilePicture)
        || body.profilePicture.length > MAX_PROFILE_PICTURE_LENGTH))) {
      return json(res, 400, { error: "The profile picture is invalid." });
    }
    updates.profilePicture = body.profilePicture;
  }

  if (!Object.keys(updates).length) return json(res, 400, { error: "No profile changes were provided." });
  await database.ref(`cadets/${targetUid}`).update(updates);
  return json(res, 200, { account: safeAccount({ ...session.account, ...updates }) });
}
