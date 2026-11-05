"use strict";

// node delete-user.js <uid>            preview cleanup
// node delete-user.js <uid> --yes       permanently delete the account and its data
const path = require("path");
const admin = require("firebase-admin");
const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

const args = process.argv.slice(2);
const uid = args.find((arg) => !arg.startsWith("--"));
const confirmed = args.includes("--yes");
const invalidArgs = args.filter((arg) => arg.startsWith("--") && !["--yes", "--dry-run"].includes(arg));

if (invalidArgs.length || !uid || uid.includes("/") || uid.trim() !== uid || uid.startsWith("bot_")) {
  console.error("Usage: node delete-user.js <uid> [--yes]");
  console.error("Without --yes (or with --dry-run), the script only previews the cleanup.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const userRef = db.collection("users").doc(uid);

async function getAuthStatus() {
  try {
    const user = await admin.auth().getUser(uid);
    return `found (${user.email || "no email"})`;
  } catch (err) {
    if (err.code === "auth/user-not-found") return "not found (already deleted)";
    throw err;
  }
}

async function removeLeaderboardEntries() {
  const boards = await db.collection("lbTop").get();
  const changedBoardIds = [];

  for (const board of boards.docs) {
    const initialEntries = board.get("entries");
    if (!Array.isArray(initialEntries) || !initialEntries.some((entry) => entry.uid === uid)) {
      continue;
    }

    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(board.ref);
      if (!fresh.exists) return;
      const entries = fresh.get("entries");
      if (!Array.isArray(entries)) {
        throw new Error(`Invalid entries field in lbTop/${board.id}`);
      }
      const kept = entries.filter((entry) => entry.uid !== uid);
      if (kept.length !== entries.length) {
        tx.update(board.ref, { entries: kept, updatedAt: new Date() });
        changedBoardIds.push(board.id);
      }
    });
  }

  return changedBoardIds;
}

async function updateGameHighscores(boardIds) {
  for (const boardId of boardIds) {
    if (!boardId.startsWith("score-")) continue;
    const gameId = boardId.slice("score-".length);
    const [board, highscore] = await Promise.all([
      db.collection("lbTop").doc(boardId).get(),
      db.collection("leaderboards").doc(gameId).get(),
    ]);
    const entries = board.exists ? board.get("entries") : [];

    if (!Array.isArray(entries)) {
      throw new Error(`Invalid entries field in lbTop/${boardId}`);
    }

    if (entries.length) {
      await db.collection("leaderboards").doc(gameId).set({
        topScore: entries[0].score,
        topUsername: entries[0].username,
        updatedAt: new Date(),
      }, { merge: true });
    } else if (highscore.exists) {
      await highscore.ref.delete();
    }
  }
}

async function rebuildTotalRanks() {
  const users = await db.collection("users").orderBy("totalScore", "desc").get();
  let batch = db.batch();
  let writes = 0;

  for (let i = 0; i < users.docs.length; i++) {
    batch.update(users.docs[i].ref, { rank: i + 1 });
    writes++;
    if (writes === 450) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  }
  if (writes > 0) await batch.commit();

  const entries = users.docs.slice(0, 100).map((doc) => ({
    uid: doc.id,
    username: doc.get("username"),
    score: doc.get("totalScore") || 0,
    level: doc.get("level") || 1,
    profilePicUrl: doc.get("profilePicUrl") || null,
    favTopic: doc.get("favTopic") || null,
  }));
  await db.collection("lbTop").doc("total").set({
    entries,
    updatedAt: new Date(),
  });
}

async function main() {
  const projectId = serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || "(unknown)";
  const [authStatus, userSnap, subcollections, boardsSnap] = await Promise.all([
    getAuthStatus(),
    userRef.get(),
    userRef.listCollections(),
    db.collection("lbTop").get(),
  ]);
  const matchingBoards = boardsSnap.docs.filter((board) => {
    const entries = board.get("entries");
    return Array.isArray(entries) && entries.some((entry) => entry.uid === uid);
  });

  console.log(`Project: ${projectId}`);
  console.log(`UID: ${uid}`);
  console.log(`Authentication account: ${authStatus}`);
  console.log(`Firestore user document: ${userSnap.exists ? "found" : "not found"}`);
  console.log(`User subcollections: ${subcollections.map((collection) => collection.id).join(", ") || "none"}`);
  console.log(`Leaderboard documents containing this UID: ${matchingBoards.length}`);
  console.log(`Matching score boards: ${matchingBoards.filter((board) => board.id.startsWith("score-")).length}`);
  console.log("The total-score board and stored user ranks will be rebuilt from remaining user documents.");

  if (!confirmed || args.includes("--dry-run")) {
    console.log("\nDry run only. Re-run with --yes to permanently delete this account and its data.");
    return;
  }

  console.log("\nRemoving leaderboard entries...");
  const changedBoardIds = await removeLeaderboardEntries();
  console.log("Deleting Firestore user data...");
  await db.recursiveDelete(userRef);
  console.log("Updating game highscore summaries and total ranks...");
  await updateGameHighscores(changedBoardIds);
  await rebuildTotalRanks();

  console.log("Deleting Authentication account...");
  let authDeleted = false;
  try {
    await admin.auth().deleteUser(uid);
    authDeleted = true;
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    console.log("Authentication account was already deleted.");
  }

  console.log(`Removed UID from ${changedBoardIds.length} leaderboard documents and deleted its Firestore user data.`);
  if (authDeleted) console.log("Deleted the Firebase Authentication account.");
  console.log("Rebuilt the total-score board and user ranks.");
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exitCode = 1;
});
