// Recalculates level + levelProgress for every user from totalScore.
// Run locally only (VS Code terminal), never in Webflow or in browser JS.
//   node recalc-levels.js
//
// IMPORTANT: levelCost below must be identical to levelCost in functions/index.js.

const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ── COPY of the curve from functions/index.js: keep this in sync. ──
function levelCost(level) {
  return level * 512;
}

function calcLevelInfo(totalScore) {
  let level = 1;
  let cumulativeThreshold = 0;
  while (totalScore >= cumulativeThreshold + levelCost(level)) {
    cumulativeThreshold += levelCost(level);
    level++;
  }
  const xpIntoLevel = totalScore - cumulativeThreshold;
  const xpForNext = levelCost(level);
  return {
    level,
    xpIntoLevel,
    xpForNext,
    progress: xpIntoLevel / xpForNext,
  };
}

async function main() {
  const snap = await db.collection("users").get();
  console.log(`Found ${snap.size} users...`);

  let batch = db.batch();
  let n = 0;
  for (const userDoc of snap.docs) {
    const totalScore = userDoc.data().totalScore || 0;
    const info = calcLevelInfo(totalScore);
    batch.set(
      userDoc.ref,
      { level: info.level, levelProgress: info.progress },
      { merge: true }
    );
    if (++n % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  console.log(`Done. Updated ${n} users.`);
}

main().catch((err) => {
  console.error("Recalc failed:", err.message);
  process.exit(1);
});