# Vercel setup

The CCA/CAA account and dashboard APIs require Firebase Admin credentials and a
server-side session secret. In the Vercel project settings, add these environment
variables for every deployment environment you use:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the Firebase service-account JSON for the
  CadetLink project, stored as a single JSON value.
- `CADETLINK_SESSION_SECRET`: a randomly generated secret with at least 32
  characters. Keep it private; changing it invalidates existing sessions.
- `FIREBASE_DATABASE_URL`: optional; defaults to the CadetLink Realtime Database
  URL already configured in the project.

Deploy again after setting the variables. If they are missing, `/api/auth` and
`/api/portal` return a configuration error and account/dashboard operations
will not work. The root `package.json` installs `firebase-admin` for the
serverless functions.

The Firebase service account must have access to the CadetLink Realtime
Database. Keep its credentials and the session secret out of source control and
do not place them in browser code.

CCA and CAA staff registration uses the RFID registration flow. Admin is not a
public registration category: create Admin accounts manually in the Firebase
Realtime Database. The Admin page at `/admin-access.html` only accepts a name
and password.

Create each account under `cadets/{UID}`, using the uppercase hexadecimal UID
from an Admin's RFID card (8–20 characters). Use a UID that is not already
assigned to another account. Set `name`, `category` to
`"Admin"`, `subcategory` and `cadetNumber` to empty strings, and `password` to
a salted hash record. The loading screen looks up the scanned UID under
`cadets`; the `"Admin"` category identifies the account and routes it to the
Admin dashboard. The Admin sign-in page uses the account name and password.

To generate the password fields locally, open `/admin-access.html`, open the
browser developer console, and run the following command. Enter the password
when prompted, then copy the output's `password` object into the account in
Firebase. Do not store a plaintext password in the database.

```js
const password = prompt("Admin password");
if (password === null || password.length < 8 || password.length > 200) {
  throw new Error("Use a password between 8 and 200 characters.");
}
const salt = CadetLinkAuth.bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
const hash = await CadetLinkAuth.derivePasswordHash(password, salt, 210000);
console.log(JSON.stringify({
  password: { algorithm: "PBKDF2-SHA-256", iterations: 210000, salt, hash }
}, null, 2));
```

For example, the resulting account fields are:

```json
{
  "name": "Admin Name",
  "cadetNumber": "",
  "category": "Admin",
  "subcategory": "",
  "password": {
    "algorithm": "PBKDF2-SHA-256",
    "iterations": 210000,
    "salt": "<generated salt>",
    "hash": "<generated hash>"
  }
}
```

Keep the UID as the Firebase child key rather than adding it to the password
record. Do not enable public database writes for this manual provisioning
process.

The Admin dashboard's Cadet Management actions and account activity are served
through `/api/admin` and require a valid Admin session. The account list omits
password hashes. Deactivated accounts cannot sign in, and protected API
requests reject their sessions. Infirmary access in the Admin dashboard and
portal API is limited to the patient count; patient records remain available
only to authorized clinical staff. Sign-in activity is retained in
`system/loginActivity` (the latest 100). Failed attempts are recorded only
when the submitted identity matches an account. Entries begin accumulating
after this version is deployed.
