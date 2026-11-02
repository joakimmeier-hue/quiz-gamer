// Reads question JSON files and writes each entry to Firestore, split in two:
//   questions/{id}   -> public fields only (text, alternatives, topic, level)
//   answerKeys/{id}  -> { correctChoice }  (private, only Cloud Functions can read)
//
// Run locally only (VS Code terminal), never in Webflow or in browser JS.
//   node import-script.js science-l1.json
//   node import-script.js all

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const QUESTIONS_DIR = path.join(__dirname, "questions");

async function importFile(fileName) {
  const filePath = path.join(QUESTIONS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const questions = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log(`Found ${questions.length} questions in ${fileName}...`);

  // Validate everything first, so a typo never leaves a half-imported file
  for (const q of questions) {
    if (!q.id) throw new Error(`A question in ${fileName} has no id`);
    if (![1, 2, 3, 4].includes(q.correctChoice)) {
      throw new Error(`${q.id}: correctChoice must be 1, 2, 3 or 4`);
    }
    if (!q.alternatives || !q.alternatives[q.correctChoice]) {
      throw new Error(`${q.id}: correctChoice points to an empty alternative`);
    }
    if (q.tag && !["elite"].includes(q.tag)) {
      throw new Error(`${q.id}: unknown tag "${q.tag}"`);
    }
  }

  let batch = db.batch();
  let n = 0;
  for (const q of questions) {
      const { id, correctChoice, ...publicFields } = q;   // tag stays in publicFields
      batch.set(db.collection("questions").doc(id), publicFields);
      batch.set(db.collection("answerKeys").doc(id), { correctChoice });
    if (++n % 200 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  console.log(`Done. ${n} questions + keys from "${fileName}".`);
}

async function main() {
  const arg = process.argv[2] || "science-l1.json";
  const files = arg === "all"
    ? fs.readdirSync(QUESTIONS_DIR).filter((f) => f.endsWith(".json"))
    : [arg];
  for (const f of files) await importFile(f);
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});