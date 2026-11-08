"use strict";

// node delete-all-human-users.js          preview the reset
// node delete-all-human-users.js --yes     permanently delete non-bot users and Auth accounts
const path = require("path");
const admin = require("firebase-admin");
const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const invalidArgs = args.filter((arg) => !["--yes", "--dry-run"].includes(arg));

if (invalidArgs.length) {
  console.error("Usage: node delete-all-human-users.js [--yes] [--dry-run]");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();

function isBot(uid, data) {
  return uid.startsWith("bot_") || (data && data.isBot === true);
}

async function listAuthUsers() {
  const users = [];
  let pageToken;

  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

async function planReset() {
  const [usersSnap, userRefs, authUsers, boardsSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("users").listDocuments(),
    listAuthUsers(),
    db.collection("lbTop").get(),
  ]);
  const userDocs = new Map(usersSnap.docs.map((doc) => [doc.id, doc]));
  const targetUids = new Set();
  const botUids = new Set();
  let firestoreUserCount = 0;
  let firestorePathCount = 0;

  for (const doc of usersSnap.docs) {
    if (isBot(doc.id, doc.data())) {
      botUids.add(doc.id);
      continue;
    }
    targetUids.add(doc.id);
    firestoreUserCount++;
  }

  for (const userRef of userRefs) {
    const userDoc = userDocs.get(userRef.id);
    if (isBot(userRef.id, userDoc && userDoc.data())) {
      botUids.add(userRef.id);
      continue;
    }
    targetUids.add(userRef.id);
    firestorePathCount++;
  }

  for (const user of authUsers) {
    const userDoc = userDocs.get(user.uid);
    if (!isBot(user.uid, userDoc && userDoc.data())) targetUids.add(user.uid);
  }

  const changedBoards = [];
  for (const board of boardsSnap.docs) {
    const entries = board.get("entries");
    if (!Array.isArray(entries)) {
      throw new Error(`Invalid entries field in lbTop/${board.id}`);
    }
    for (const entry of entries) {
      if (!entry || typeof entry.uid !== "string") {
        throw new Error(`Invalid leaderboard entry in lbTop/${board.id}`);
      }
    }
    if (entries.some((entry) => !isBot(entry.uid, userDocs.get(entry.uid)?.data()))) {
      changedBoards.push(board);
    }
  }

  return {
    authUsers: authUsers.filter((user) => targetUids.has(user.uid)),
    boards: changedBoards,
    botUids,
    firestoreUserCount,
    firestorePathCount,
    targetUids,
  };
}

async function removeNonBotLeaderboardEntries(boards, botUids) {
  const changedBoardIds = new Set();

  for (const board of boards) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(board.ref);
      if (!fresh.exists) return;
      const entries = fresh.get("entries");
      if (!Array.isArray(entries)) {
        throw new Error(`Invalid entries field in lbTop/${board.id}`);
      }
      for (const entry of entries) {
        if (!entry || typeof entry.uid !== "string") {
          throw new Error(`Invalid leaderboard entry in lbTop/${board.id}`);
        }
      }
      const kept = entries.filter((entry) =>
        botUids.has(entry.uid) || entry.uid.startsWith("bot_")
      );
      if (kept.length !== entries.length) {
        if (kept.length) {
          tx.update(board.ref, { entries: kept, updatedAt: new Date() });
        } else {
          tx.delete(board.ref);
        }
        changedBoardIds.add(board.id);
      }
    });
  }

  return [...changedBoardIds];
}

async function updateGameHighscores(boardIds) {
  for (const boardId of boardIds) {
    if (!boardId.startsWith("score-")) continue;
    const gameId = boardId.slice("score-".length);
    const board = await db.collection("lbTop").doc(boardId).get();
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
    } else {
      await db.collection("leaderboards").doc(gameId).delete();
    }
  }
}

async function deleteFirestoreUsers(targetUids) {
  let processed = 0;
  for (const uid of targetUids) {
    const userRef = db.collection("users").doc(uid);
    await db.recursiveDelete(userRef);
    processed++;
    console.log(`Cleaned Firestore user path ${uid} (${processed}/${targetUids.size})`);
  }
  return processed;
}

async function deleteAuthUsers(users) {
  let deleted = 0;

  for (let i = 0; i < users.length; i += 1000) {
    const batch = users.slice(i, i + 1000);
    const result = await auth.deleteUsers(batch.map((user) => user.uid));
    const failures = result.errors.filter((failure) =>
      failure.error.code !== "auth/user-not-found"
    );
    if (failures.length) {
      const details = failures.map((failure) =>
        `${batch[failure.index].uid}: ${failure.error.message}`
      ).join("\n");
      throw new Error(`Some Authentication accounts could not be deleted:\n${details}`);
    }
    deleted += batch.length - result.errors.length;
  }

  return deleted;
}

async function rebuildBotRanks() {
  const users = await db.collection("users").orderBy("totalScore", "desc").get();
  const bots = users.docs.filter((doc) => isBot(doc.id, doc.data()));
  let batch = db.batch();
  let writes = 0;

  for (let i = 0; i < bots.length; i++) {
    batch.update(bots[i].ref, { rank: i + 1 });
    writes++;
    if (writes === 450) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  }
  if (writes) await batch.commit();

  const entries = bots.slice(0, 100).map((doc) => ({
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
  const plan = await planReset();
  const projectId = serviceAccount.project_id || process.env.GOOGLE_CLOUD_PROJECT || "(unknown)";

  console.log(`Project: ${projectId}`);
  console.log(`Non-bot Firestore user documents: ${plan.firestoreUserCount}`);
  console.log(`Non-bot Firestore user paths (including orphaned subcollections): ${plan.firestorePathCount}`);
  console.log(`Non-bot UIDs to delete (including Auth-only accounts): ${plan.targetUids.size}`);
  console.log(`Matching Authentication accounts: ${plan.authUsers.length}`);
  console.log(`Leaderboard documents to clean: ${plan.boards.length}`);
  console.log(`Target UIDs: ${[...plan.targetUids].sort().join(", ") || "(none)"}`);
  console.log("Bot user documents and entries, questions, and answer keys will be preserved.");

  if (!confirmed || args.includes("--dry-run")) {
    console.log("\nDry run only. Re-run with --yes to permanently reset non-bot users.");
    return;
  }

  console.log("\nRemoving non-bot leaderboard entries...");
  const changedBoardIds = await removeNonBotLeaderboardEntries(plan.boards, plan.botUids);
  console.log("Deleting Firestore user documents and subcollections...");
  const firestoreDeleted = await deleteFirestoreUsers(plan.targetUids);
  console.log("Updating game highscore summaries...");
  await updateGameHighscores(changedBoardIds);
  console.log("Deleting Authentication accounts...");
  const authDeleted = await deleteAuthUsers(plan.authUsers);
  console.log("Rebuilding bot ranks and the total-score leaderboard...");
  await rebuildBotRanks();

  console.log(`Reset complete: deleted ${firestoreDeleted} Firestore user trees and ${authDeleted} Authentication accounts.`);
  console.log(`Cleaned ${changedBoardIds.length} leaderboard documents and rebuilt bot ranks.`);
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exitCode = 1;
});
