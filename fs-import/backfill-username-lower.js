// Adds usernameLower to every user (humans and bots) and reports case-insensitive duplicates.
// Run locally only (VS Code terminal): node backfill-username-lower.js
// IMPORTANT: usernameKey below must be identical to usernameKey in functions/index.js.

const admin = require("firebase-admin");
const path = require("path");
const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const usernameKey = (name) => name.normalize("NFKC").toLowerCase();

async function main() {
  const snap = await db.collection("users").get();
  const seen = new Map(); // key -> first user id
  let batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    const name = d.data().username;
    if (typeof name !== "string" || !name) continue;
    const key = usernameKey(name);
    if (seen.has(key)) console.warn(`DUPLICATE: "${name}" (${d.id}) collides with ${seen.get(key)}`);
    else seen.set(key, d.id);
    batch.set(d.ref, { usernameLower: key }, { merge: true });
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`Done. Updated ${n} users.`);
}

main().catch((err) => { console.error("Backfill failed:", err.message); process.exit(1); });