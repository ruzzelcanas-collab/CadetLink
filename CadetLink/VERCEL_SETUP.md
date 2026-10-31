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
public registration category: Admins sign in from `/admin-access.html`.

To create the first Admin account:

1. In Vercel Project Settings → Environment Variables, add `ADMIN_SETUP_SECRET`
   for each deployment environment. Generate a unique random value of at least
   32 characters and keep it private.
2. Deploy the site so the latest Admin setup page is available.
3. Open `/admin-access.html` in Chrome or Edge over HTTPS, connect/authorize
   the RFID reader when prompted, then click **Scan Admin card** and scan an
   unregistered card. The UID is filled in automatically; it must not belong
   to another account.
4. Complete the one-time setup form with the secret, Admin name, and a
   password of at least 8 characters.
5. After setup succeeds, remove `ADMIN_SETUP_SECRET` from Vercel and redeploy.
   The database also records that setup was completed, so the endpoint cannot
   create another Admin account even if the variable is later restored.

The Admin password is stored in Firebase as a salted password hash. Existing
Admin records are preserved and can sign in through the separate Admin page.
The newly created account is stored under the RFID card UID and can also sign
in by scanning that card and entering its password.
