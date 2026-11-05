const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const BONUS_EXPONENT = 1.6; // how much extra many correct answers are worth
const ATTEMPT_FLOOR = 0.05;  // a replay never gives less than x% of the base score
const ATTEMPT_RATE = 0.13;   // higher = penalty bites faster. EG. with RATE = 0.13, 20 pre attempts rewards ~34% of the score.

// Map Tier (game level) to required User Level
const TIER_REQUIREMENTS = {
  1: 1,   // Tier 1 -> Player Lvl 1
  2: 10,  // Tier 2 -> Player Lvl 10
  3: 20,  // Tier 3 -> Player Lvl 20
  4: 25   // Tier 4 -> Player Lvl 25
};
// Score multiplier per Tier (game level). Tier 1 = no bonus.
const TIER_MULTIPLIERS = {
  1: 1.0,
  2: 1.5,
  3: 2.0,
  4: 2.5,
  5: 3.3   // prepared, there is no Tier 5 yet
};

const NO_LEADERBOARD_TOPICS = ["gma"];
const QUESTION_WEIGHTS = { normal: 1, elite: 5 };
// at the top of the file, next to TIER_MULTIPLIERS
const QUESTIONS_PER_GAME = 10;
const BANK_SIZES = {          // how many questions exist per topic+level
  "science-l1": 41,
  "science-l2": 2,
  // add one line per game as you import banks
};

const eliteCache = new Map(); // gameId -> { t, ids }
const ELITE_CACHE_MS = 5 * 60 * 1000;

async function getEliteIds(gameId, topic, level) {
  const hit = eliteCache.get(gameId);
  if (hit && Date.now() - hit.t < ELITE_CACHE_MS) return hit.ids;
  const snap = await db.collection("questions")
    .where("topic", "==", topic)
    .where("level", "==", level)
    .where("tag", "==", "elite")
    .get();
  const ids = new Set(snap.docs.map((d) => d.id));
  eliteCache.set(gameId, { t: Date.now(), ids });
  return ids;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function pickQuestionIds(gameId, topic, level) {
  const size = BANK_SIZES[gameId];
  if (!size) return null;     // game without a bank (e.g. the 20 static GMA questions)
  const allIds = Array.from({ length: size }, (_, i) => `${gameId}-q${String(i + 1).padStart(3, "0")}`);
  const eliteSet = await getEliteIds(gameId, topic, level);
  const elites = shuffle(allIds.filter((id) => eliteSet.has(id)));
  const normals = shuffle(allIds.filter((id) => !eliteSet.has(id)));

  if (normals.length === 0) return elites.slice(0, QUESTIONS_PER_GAME); // edge case: bank has no normal questions

  // 1 or 2 elites (fewer only if the bank has fewer)
  const eliteCount = Math.min(1 + Math.floor(Math.random() * 2), elites.length);
  const normalCount = Math.min(QUESTIONS_PER_GAME - eliteCount, normals.length);
  const total = normalCount + eliteCount;

  // Elites go in random slots, but never slot 0: the first card is always normal
  const slots = shuffle(Array.from({ length: total - 1 }, (_, i) => i + 1)).slice(0, eliteCount);
  const result = [];
  for (let i = 0; i < total; i++) {
    result.push(slots.includes(i) ? elites.pop() : normals.pop());
  }
  return result;
}

function tierMultiplier(tier) {
  if (TIER_MULTIPLIERS[tier]) return TIER_MULTIPLIERS[tier];
  // Tier above the table: use the highest defined one. Below 1 or unknown: no bonus.
  const maxTier = Math.max(...Object.keys(TIER_MULTIPLIERS).map(Number));
  return tier > maxTier ? TIER_MULTIPLIERS[maxTier] : 1.0;
}

initializeApp();
const db = getFirestore();

function validateUsernameServer(rawName) {
  const errors = [];
  const letterCount = (rawName.match(/[a-zA-ZåäöÅÄÖ]/g) || []).length;
  if (rawName.length < 1 || letterCount < 1) errors.push("Minimum 1 letter");
  if (rawName.length > 14) errors.push("Maximum 14 characters");
  if (/ {2,}/.test(rawName)) errors.push("Only single spaces between words");
  const invalidCharRegex = /[^a-zA-Z0-9åäöÅÄÖ\-_. ]/;
  const repeatedSeparatorRegex = /([_.-])\1/;
  if (invalidCharRegex.test(rawName)) errors.push("Oops, invalid character");
  if (repeatedSeparatorRegex.test(rawName)) {
    errors.push("Oops, don't repeat ., _, or - in a row");
  }
  return errors;
}

async function isUsernameTaken(rawName, uid) {
  const snap = await db.collection("users").where("username", "==", rawName).get();
  return snap.docs.some(d => d.id !== uid);
}

// ── SCORING FORMULAS ──────────────────────────────────────────────
function calcFinalScore(correctAnswers, weightedCorrect, seconds, previousAttempts, totalQuestions, tier) {
  if (correctAnswers === 0) return 0;
  const base = ((weightedCorrect * 1000) / (seconds / 2)) * ((correctAnswers / totalQuestions) ** BONUS_EXPONENT);
  // previousAttempts starts at 0 for a first-ever attempt.
  // attemptDivisor must never go below 1, or the "penalty" would boost the score.
   const attemptMultiplier = ATTEMPT_FLOOR + (1 - ATTEMPT_FLOOR) / (1 + previousAttempts * ATTEMPT_RATE);
  const penalized = base * attemptMultiplier;

  const finalRaw = penalized * tierMultiplier(tier); // penalty first, tier bonus last
  const rounded = Math.ceil(finalRaw);

  return Math.max(rounded, 1);
}

function calcUnlimitedScore(correctAnswers, weightedCorrect, seconds, totalQuestions, tier) {
  if (correctAnswers === 0) return 0;
  const raw = ((weightedCorrect * 1000) / (seconds / 2)) * ((correctAnswers / totalQuestions) ** BONUS_EXPONENT) * tierMultiplier(tier);
  return Math.max(Math.ceil(raw), 1);
}

// Cumulative threshold: level N requires sum of 512*1 + 512*2 + ... + 512*(N-1).
// Keep the copies in fs-import/recalc-levels.js and seed-bots.js in sync.
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
    progress: xpIntoLevel / xpForNext // 0 to just under 1
  };
}

// keep old callers working
function calcLevel(totalScore) {
  return calcLevelInfo(totalScore).level;
}

// ──────────────────────────── LEADERBOARD HELPER ────────────────────────────────────
const TOP_N = 100;

function leaderboardTime(entry) {
  return Number.isFinite(entry.timeSecs) ? entry.timeSecs : Infinity;
}

function compareLeaderboardEntries(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  const timeDifference = leaderboardTime(a) - leaderboardTime(b);
  if (timeDifference) return timeDifference;
  const aUid = String(a.uid || "");
  const bUid = String(b.uid || "");
  return aUid < bUid ? -1 : aUid > bUid ? 1 : 0;
}

async function updateTopList(boardId, uid, info, score, timeSecs) {
  const ref = db.collection("lbTop").doc(boardId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let entries = snap.exists ? (snap.data().entries || []) : [];
    const idx = entries.findIndex((e) => e.uid === uid);
    const newEntry = { uid, ...info, score, timeSecs };
    if (idx >= 0) {
      if (compareLeaderboardEntries(newEntry, entries[idx]) >= 0) return;
      entries[idx] = newEntry;
    } else {
      if (entries.length >= TOP_N &&
          compareLeaderboardEntries(newEntry, entries[entries.length - 1]) >= 0) return;
      entries.push(newEntry);
    }
    entries.sort(compareLeaderboardEntries);
    tx.set(ref, { entries: entries.slice(0, TOP_N), updatedAt: new Date() });
  });
}
  
async function renameInBoards(uid, oldName, newName) {
  // lbTop: patch this user's entry in every list they appear in
  const snap = await db.collection("lbTop").get();
  for (const doc of snap.docs) {
    if (!(doc.data().entries || []).some((e) => e.uid === uid)) continue;
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const list = (fresh.data().entries || []).map((e) =>
        e.uid === uid ? { ...e, username: newName } : e
      );
      tx.update(doc.ref, { entries: list });
    });
  }
  // leaderboards: only touch boards where this user is the cached top
  const lbSnap = await db.collection("leaderboards")
    .where("topUsername", "==", oldName).get();
  await Promise.all(lbSnap.docs.map((d) => d.ref.update({ topUsername: newName })));
}

// ────────── CREATE PROFILE (first-time only) ──────────────────────────────
exports.completeProfile = onCall(async (request) => {
  console.log("completeProfile started");
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const uid = request.auth.uid;
  console.log("uid:", uid);
    const { username, profilePicUrl } = request.data;

  if (typeof username !== "string" || typeof profilePicUrl !== "string" || !profilePicUrl) {
    throw new HttpsError("invalid-argument", "Missing username or profile picture.");
  }
  const PIC_REGEX = /^https:\/\/cdn\.prod\.website-files\.com\/693d8d6b18be20357a9cf397\/[A-Za-z0-9_.-]+\.webp$/;
  if (!PIC_REGEX.test(profilePicUrl)) {
    throw new HttpsError("invalid-argument", "Invalid profile picture.");
  }
  const rawName = username.trim();
  const errors = validateUsernameServer(rawName);
  if (errors.length) throw new HttpsError("invalid-argument", errors.join(", "));

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (userSnap.exists && userSnap.data().username) {
    throw new HttpsError("already-exists", "Profile already created.");
  }

  if (await isUsernameTaken(rawName, uid)) {
    throw new HttpsError("already-exists", "Sorry, username in use");
  }

  console.log("About to write to Firestore");
  await userRef.set({
    username: rawName,
    profilePicUrl,
    level: 1,
    totalScore: 0,
    rank: 0,
    hasChangedUsername: false,
    updatedAt: new Date(),
  }, { merge: true });
  console.log("Firestore write complete");

  return { success: true, username: rawName };
});

// ── CHANGE USERNAME (one-time) ─────────────────────────────────────
exports.changeUsername = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const uid = request.auth.uid;
  const { username } = request.data;

  if (typeof username !== "string") {
    throw new HttpsError("invalid-argument", "Missing username.");
  }

  const rawName = username.trim();
  const errors = validateUsernameServer(rawName);
  if (errors.length) throw new HttpsError("invalid-argument", errors.join(", "));

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("failed-precondition", "Profile does not exist yet.");
  if (userSnap.data().hasChangedUsername) {
    throw new HttpsError("permission-denied", "Username already changed once.");
  }

  if (await isUsernameTaken(rawName, uid)) {
    throw new HttpsError("already-exists", "Sorry, username in use");
  }

  const oldName = userSnap.data().username;
  await userRef.set({
    username: rawName,
    hasChangedUsername: true,
    updatedAt: new Date(),
  }, { merge: true });

    try {
    await renameInBoards(uid, oldName, rawName);
  } catch (e) {
    console.error("renameInBoards failed", e); // don't fail the rename itself
  }
  return { success: true, username: rawName };
});

// GET GAME INFO
exports.getGameInfo = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const { topic, level } = request.data;
  if (typeof topic !== "string" || !topic) {
    throw new HttpsError("invalid-argument", "Missing topic.");
  }
  if (typeof level !== "number" || level < 1) {
    throw new HttpsError("invalid-argument", "Missing or invalid level.");
  }

  const gameId = `${topic}-l${level}`;
  const lbSnap = await db.collection("leaderboards").doc(gameId).get();
  const lbHighscore = lbSnap.exists ? lbSnap.data().topScore || 0 : 0;

  return { lbHighscore };
});

// ── START GAME SESSION (transactional + idempotent + level gated) ─────
exports.startGame = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;
  const { topic, level } = request.data; // 'level' here refers to the Tier (1, 2, 3, 4)

  if (typeof topic !== "string" || !topic) {
    throw new HttpsError("invalid-argument", "Missing topic.");
  }
  if (typeof level !== "number" || level < 1) {
    throw new HttpsError("invalid-argument", "Missing or invalid level.");
  }

  // 🔒 SERVER-SIDE SECURITY CHECK
  const userSnap = await db.collection("users").doc(uid).get();
  const playerLevel = userSnap.exists ? (userSnap.data().level || 1) : 1;
  const requiredLevel = TIER_REQUIREMENTS[level] || 1;

  if (playerLevel < requiredLevel) {
    throw new HttpsError(
      "permission-denied",
      `Progress to level ${requiredLevel} to play this tier!`
    );
  }

  const gameId = `${topic}-l${level}`;
  let questionIds = await pickQuestionIds(gameId, topic, level);   // null if no bank
  let questions = null;
  if (questionIds) {
    const snaps = await db.getAll(...questionIds.map((id) => db.collection("questions").doc(id)));
    questions = snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }));
    if (questions.length < questionIds.length) {
      console.warn("missing question docs for", gameId, questionIds.filter((id) => !questions.some((q) => q.id === id)));
    }
    if (questions.length === 0) {
      throw new HttpsError("failed-precondition", "No questions found for this game.");
    }
    questionIds = questions.map((q) => q.id);   // session only lists ids that exist
  }
  const sessionId = db.collection("_").doc().id; // random id for this session
  const sessionRef = db.collection("users").doc(uid).collection("activeSessions").doc(sessionId);
  const attemptRef = db.collection("users").doc(uid).collection("attempts").doc(gameId);
  const userRef = db.collection("users").doc(uid);

  // Run a transaction so we both create the session and increment the attemptCount exactly once
  await db.runTransaction(async (tx) => {
    const sSnap = await tx.get(sessionRef);
    const uSnap = await tx.get(userRef);
    if (!sSnap.exists) {
      tx.set(sessionRef, {
        gameId,
        topic,
        level,
        startedAt: new Date(),
        attemptCounted: true,
        ...(questionIds ? { questionIds } : {})
      });
      tx.set(attemptRef, {
        topic,
        level,
        attemptCount: admin.firestore.FieldValue.increment(1),
        updatedAt: new Date()
      }, { merge: true });
      const counts = (uSnap.exists && uSnap.data().topicCounts) || {};
      const newCount = (counts[topic] || 0) + 1;
      const currentFav = uSnap.exists ? uSnap.data().favTopic : null;
      const favCount = currentFav ? (counts[currentFav] || 0) : 0;
      const update = { topicCounts: { [topic]: newCount } };
      if (topic !== currentFav && newCount > favCount) update.favTopic = topic;
      tx.set(userRef, update, { merge: true });
    } else {
      const data = sSnap.data();
      const alreadyCounted = !!data.attemptCounted;
      if (!alreadyCounted) {
        tx.update(sessionRef, { attemptCounted: true });
        tx.set(attemptRef, {
          attemptCount: admin.firestore.FieldValue.increment(1),
          updatedAt: new Date()
        }, { merge: true });
      }
    }
  });
  return questions ? { sessionId, questions } : { sessionId };
});

// ── GRADE GAME — works for any topic+level ──────────────────────────
exports.gradeGame = onCall(async (request) => {
  // 1. Require authentication — never trust an anonymous caller
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in to submit a game.");
  }
  const uid = request.auth.uid;
  const { topic, level, answers, sessionId, clientTimeSecs } = request.data;
  if (typeof topic !== "string" || !topic) {
    throw new HttpsError("invalid-argument", "Missing topic.");
  }
  if (typeof level !== "number" || level < 1) {
    throw new HttpsError("invalid-argument", "Missing or invalid level.");
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new HttpsError("invalid-argument", "Missing or empty answers array.");
  }
  if (typeof sessionId !== "string" || !sessionId) {
    throw new HttpsError("invalid-argument", "Missing sessionId.");
  }

  // Look up the real start time from the server-created session
    const sessionRef = db.collection("users").doc(uid).collection("activeSessions").doc(sessionId);
    // Claim the session atomically: only one request can read it AND delete it
    const sessionSnap = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    if (snap.exists) tx.delete(sessionRef);
    return snap;
  });
  if (!sessionSnap.exists) {
    throw new HttpsError("failed-precondition", "No active session found. Please restart the game.");
  }
  const sessionData = sessionSnap.data();
  if (sessionData.topic !== topic || sessionData.level !== level) {
    throw new HttpsError("failed-precondition", "Session does not match this game.");
  }
  const allowedIds = sessionData.questionIds;
  if (Array.isArray(allowedIds)) {
    const sentIds = answers.map((a) => a.questionId);
    if (sentIds.length !== allowedIds.length ||
        new Set(sentIds).size !== sentIds.length ||
        !sentIds.every((id) => allowedIds.includes(id))) {
      throw new HttpsError("invalid-argument", "Answers do not match this game.");
    }
  }
  const totalQuestions = Array.isArray(allowedIds) ? allowedIds.length : answers.length;


    // ── TIMER SYNC & SECURITY GATE ────────────────────────────────────
  const startedAt = sessionData.startedAt.toDate();
  const rawServerSecs = Math.max((Date.now() - startedAt.getTime()) / 1000, 0.001);

  // Use client visual time if valid; fallback to server time if omitted
  const claimedTime = (typeof clientTimeSecs === "number" && clientTimeSecs > 0)
    ? clientTimeSecs
    : rawServerSecs;

  // Security Gate:
  // 1. Client can never claim MORE time than raw server duration.
  // 2. Minimum 1.0 second floor prevents division-by-zero explosions.
  // 3. Client can't claim much less time than the server saw (INTRO_ALLOWANCE), or less than MIN_SECS_PER_ANSWER per answered question.
const INTRO_ALLOWANCE = 15; // seconds, covers page load and intro
let verifiedTimeSecs = Math.min(claimedTime, rawServerSecs);
console.log("time gap:", rawServerSecs - claimedTime);
if (rawServerSecs - claimedTime > INTRO_ALLOWANCE) console.warn("allowance hit:", rawServerSecs - claimedTime);
const minPlausible = Math.max(rawServerSecs - INTRO_ALLOWANCE, 1.0);
verifiedTimeSecs = Math.max(verifiedTimeSecs, minPlausible);
verifiedTimeSecs = Math.max(verifiedTimeSecs, 1.0);
const answeredCount = answers.filter((a) => typeof a.choice === "number").length;
const MIN_SECS_PER_ANSWER = 1.5; // tune this to your fastest honest answers
verifiedTimeSecs = Math.max(verifiedTimeSecs, answeredCount * MIN_SECS_PER_ANSWER);

  // Build the MM:SS string directly from verified visual time
  const totalSecondsInt = Math.floor(verifiedTimeSecs);
  const timeStr = `${String(Math.floor(totalSecondsInt / 60)).padStart(2, "0")}:${String(totalSecondsInt % 60).padStart(2, "0")}`;
  const gameId = `${topic}-l${level}`;

  // 2. Look up question docs and answer keys for server-side grading
  const questionIds = answers.map((a) => a.questionId);
  if (new Set(questionIds).size !== questionIds.length) {
    throw new HttpsError("invalid-argument", "Duplicate questions.");
  }
  const questionRefs = questionIds.map((id) => db.collection("questions").doc(id));
  const questionSnaps = await db.getAll(...questionRefs);
  const keySnaps = await db.getAll(
    ...questionIds.map((id) => db.collection("answerKeys").doc(id))
  );

    let correctCount = 0;
    let weightedCorrect = 0;
    questionSnaps.forEach((snap, i) => {
    if (!snap.exists || !keySnaps[i].exists) return;
    const key = keySnaps[i].data();
    if (answers[i].choice === key.correctChoice) {
      correctCount++;
      weightedCorrect += QUESTION_WEIGHTS[snap.data().tag] || 1;
    }
  });

  // 3. Read attempts doc
  const attemptRef = db.collection("users").doc(uid).collection("attempts").doc(gameId);
  const attemptSnap = await attemptRef.get();
  const attemptCountStored = attemptSnap.exists ? (attemptSnap.data().attemptCount || 0) : 0;
  
  
  const previousAttempts = Math.max(attemptCountStored - 1, 0);

  // Scores now use verifiedTimeSecs
  const finalScore = calcFinalScore(correctCount, weightedCorrect, verifiedTimeSecs, previousAttempts, totalQuestions, level);
  const unlimitedScore = calcUnlimitedScore(correctCount, weightedCorrect, verifiedTimeSecs, totalQuestions, level);

  const newAttemptCount = attemptCountStored || 1;
  const previousBest = attemptSnap.exists ? attemptSnap.data().bestScore || 0 : 0;
  const newBest = Math.max(previousBest, finalScore);
  const previousBestUnlim = attemptSnap.exists ? attemptSnap.data().bestScoreUnlim || 0 : 0;
  const newBestUnlim = Math.max(previousBestUnlim, unlimitedScore);
  const previousBestTimeSecs = attemptSnap.exists &&
    Number.isFinite(attemptSnap.data().bestScoreTimeSecs)
    ? attemptSnap.data().bestScoreTimeSecs
    : null;
  const previousBestUnlimTimeSecs = attemptSnap.exists &&
    Number.isFinite(attemptSnap.data().bestScoreUnlimTimeSecs)
    ? attemptSnap.data().bestScoreUnlimTimeSecs
    : null;
  const scoreBestChanged = finalScore > previousBest ||
    (finalScore > 0 && finalScore === previousBest &&
      verifiedTimeSecs < (previousBestTimeSecs ?? Infinity));
  const unlimitedBestChanged = unlimitedScore > previousBestUnlim ||
    (unlimitedScore > 0 && unlimitedScore === previousBestUnlim &&
      verifiedTimeSecs < (previousBestUnlimTimeSecs ?? Infinity));
  const bestScoreTimeSecs = scoreBestChanged ? verifiedTimeSecs : previousBestTimeSecs;
  const bestScoreUnlimTimeSecs = unlimitedBestChanged
    ? verifiedTimeSecs
    : previousBestUnlimTimeSecs;

  // 4. Write back updated attempt doc
  await attemptRef.set({
    topic,
    level,
    attemptCount: newAttemptCount,
    bestScore: newBest,
    bestScoreTimeSecs,
    bestScoreUnlim: newBestUnlim,
    bestScoreUnlimTimeSecs,
    updatedAt: new Date()
  }, { merge: true });

  // 5. Read + update user's global totals
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const previousTotalScore = userSnap.exists ? userSnap.data().totalScore || 0 : 0;
  const oldLevel = calcLevel(previousTotalScore);

  const newTotalScore = previousTotalScore + finalScore;
  const newInfo = calcLevelInfo(newTotalScore);
  const newLevel = calcLevel(newTotalScore);

  await userRef.set(
    { totalScore: newTotalScore, level: newLevel, levelProgress: newInfo.progress, updatedAt: new Date() },
    { merge: true },
     );

     const onLeaderboard = !NO_LEADERBOARD_TOPICS.includes(topic);
  // 6. Keep cached top score updated
  if (onLeaderboard) {
    const lbRef = db.collection("leaderboards").doc(gameId);
  await db.runTransaction(async (tx) => {
    const lbSnap = await tx.get(lbRef);
    const currentTop = lbSnap.exists ? lbSnap.data().topScore || 0 : 0;
    const username = userSnap.exists ? userSnap.data().username : null;
    if (newBest > currentTop) {
      tx.set(lbRef, { topScore: newBest, topUsername: username, updatedAt: new Date() }, { merge: true });
    }
   });

  const info = {
  username: userSnap.exists ? userSnap.data().username : null,
  level: newLevel,
  profilePicUrl: userSnap.exists ? userSnap.data().profilePicUrl || null : null,
  favTopic: userSnap.exists ? userSnap.data().favTopic || null : null 
  };
  if (scoreBestChanged) {
    await updateTopList(`score-${gameId}`, uid, info, newBest, bestScoreTimeSecs);
  }
  if (unlimitedBestChanged) {
    await updateTopList(`unlim-${gameId}`, uid, info, newBestUnlim, bestScoreUnlimTimeSecs);
  }
  }



  // 7. Compute live LEVEL leaderboard position
  let leaderboardPosition = null;
  if (onLeaderboard) {
    const boardSnap = db.collection("lbTop").doc(`score-${gameId}`).get();
    const boardData = await boardSnap;
    const boardEntries = boardData.exists
      ? (boardData.data().entries || []).filter((entry) => entry.score > 0)
        .slice().sort(compareLeaderboardEntries)
      : [];
    const boardIndex = boardEntries.findIndex((entry) => entry.uid === uid);
    if (boardIndex >= 0) {
      leaderboardPosition = boardIndex + 1;
    } else {
      const attempts = db.collectionGroup("attempts")
        .where("topic", "==", topic)
        .where("level", "==", level);
      const [betterSnap, tiedSnap] = await Promise.all([
        attempts.where("bestScore", ">", newBest).count().get(),
        attempts.where("bestScore", "==", newBest).get(),
      ]);
      const betterHumanCount = tiedSnap.docs.filter((doc) => {
        const data = doc.data();
        const otherUid = doc.ref.parent.parent.id;
        return compareLeaderboardEntries(
          { uid, score: newBest, timeSecs: bestScoreTimeSecs },
          { uid: otherUid, score: newBest, timeSecs: data.bestScoreTimeSecs }
        ) > 0;
      }).length;
      const betterBotCount = boardEntries.filter((entry) =>
        typeof entry.uid === "string" &&
        entry.uid.startsWith("bot_") &&
        compareLeaderboardEntries(entry, {
          uid,
          score: newBest,
          timeSecs: bestScoreTimeSecs,
        }) < 0
      ).length;
      leaderboardPosition =
        betterSnap.data().count + betterHumanCount + betterBotCount + 1;
    }
  }
  // Save game state for the review page
  await db.collection("users").doc(uid).collection("lastGame").doc("current").set({
    topic,
    level,
    gameId,
    questionIds,
    picks: answers.map((a) => (typeof a.choice === "number" ? a.choice : null)),
    timeStr,
    finalScore,
    createdAt: new Date(),
    reviewPaid: false,
  });

  // Clean up session
  await sessionRef.delete();

  // 8. Return data for score page
  return {
    topic,
    correctCount,
    totalQuestions,
    finalScore,
    unlimitedScore,
    attemptCount: newAttemptCount,
    leaderboardPosition,
    timeStr,
    oldLevel,
    newLevel,
    levelsGained: newLevel - oldLevel,
    levelProgress: newInfo.progress,
    tier: level,
    tierMultiplier: tierMultiplier(level),
  };
});

//  ── SCHEDULED: RECOMPUTE GLOBAL RANKS ───────────────────────────────
exports.recomputeRanks = onSchedule("every 15 minutes", async () => {
  const usersSnap = await db.collection("users")
    .orderBy("totalScore", "desc")
    .get();

  let batch = db.batch();
  let ops = 0;
  for (let i = 0; i < usersSnap.docs.length; i++) {
    batch.update(usersSnap.docs[i].ref, { rank: i + 1 });
    ops++;
    if (ops === 450) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();

  const top = usersSnap.docs.slice(0, 100).map((d) => ({ 
    uid: d.id, 
    username: d.data().username, 
    score: d.data().totalScore || 0,
    level: d.data().level || 1,
    profilePicUrl: d.data().profilePicUrl || null,
    favTopic: d.data().favTopic || null
  }));
  await db.collection("lbTop").doc("total").set({ entries: top, updatedAt: new Date() });
});

exports.refreshTopLists = onSchedule("every 15 minutes", async () => {
  const snap = await db.collection("lbTop").get();
  const boards = snap.docs.filter((d) => d.id !== "total");

  // collect every uid that appears in any topic list
  const uids = new Set();
  boards.forEach((b) => (b.data().entries || []).forEach((e) => uids.add(e.uid)));

  // load the current user docs
  const userMap = new Map();
  const uidList = [...uids];
  for (let i = 0; i < uidList.length; i += 300) {
    const refs = uidList.slice(i, i + 300).map((id) => db.collection("users").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s) => { if (s.exists) userMap.set(s.id, s.data()); });
  }

  // patch each board in a transaction, so a game finishing at the same moment isn't overwritten
  for (const b of boards) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(b.ref);
      const entries = (fresh.data().entries || []).map((e) => {
        const u = userMap.get(e.uid);
        if (!u) return e;
        return {
          ...e,
          username: u.username,
          level: u.level || 1,
          profilePicUrl: u.profilePicUrl || null,
          favTopic: u.favTopic || null,
        };
      });
      const before = JSON.stringify(fresh.data().entries || []);
      if (before === JSON.stringify(entries)) return;
      tx.update(b.ref, { entries });
    });
  }
});

// ── SCHEDULED: CLEAN UP ABANDONED SESSIONS ──────────────────────────
exports.cleanupAbandonedSessions = onSchedule("every 30 minutes", async () => {
  // Rensa allt som är äldre än 30 minuter
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  
  try {
    const staleSnap = await db
      .collectionGroup("activeSessions")
      .where("startedAt", "<", cutoff)
      .get();

    console.log(`Hittade ${staleSnap.size} gamla sessioner att radera.`);

    if (staleSnap.empty) return;

    let batch = db.batch();
    let ops = 0;

    for (const doc of staleSnap.docs) {
      batch.delete(doc.ref);
      ops++;

      if (ops === 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
    }

    console.log("Städning slutförd.");
  } catch (err) {
    console.error("Fel vid städning av sessioner:", err);
  }
});

// ── GET REVIEW (answer key for the last finished game) ─────────────
exports.getReview = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;

  const ref = db.collection("users").doc(uid).collection("lastGame").doc("current");
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "No finished game to review.");
  }
  const g = snap.data();

  // The review must be paid for first (payForReview sets reviewPaid)
  if (g.reviewPaid !== true) {
    throw new HttpsError("failed-precondition", "Review not unlocked. Pay for the review first.");
  }

  const qSnaps = await db.getAll(
    ...g.questionIds.map((id) => db.collection("questions").doc(id))
  );
  const keySnaps = await db.getAll(
    ...g.questionIds.map((id) => db.collection("answerKeys").doc(id))
  );

  const questions = qSnaps.map((s, i) => {
    const d = s.exists ? s.data() : {};
    return {
      id: s.id,
      text: d.text || "",
      alternatives: d.alternatives || {},
      tag: d.tag || null,
      correct: keySnaps[i].exists ? keySnaps[i].data().correctChoice : null,
      picked: g.picks[i] ?? null,
    };
  });

  return { topic: g.topic, level: g.level, timeStr: g.timeStr, questions };
});

// ── PAY FOR REVIEW (cost = 15% of the last game's Final Score) ─────
const REVIEW_COST_PERCENT = 15;

exports.payForReview = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;
  const userRef = db.collection("users").doc(uid);
  const gameRef = userRef.collection("lastGame").doc("current");

  // One transaction: the check and the charge happen together, so two clicks or tabs can't both pay
  return db.runTransaction(async (tx) => {
    const [userSnap, gameSnap] = await tx.getAll(userRef, gameRef);
    if (!gameSnap.exists) {
      throw new HttpsError("failed-precondition", "No finished game to review.");
    }
    const game = gameSnap.data();

    // Already paid for this game: no second charge
    if (game.reviewPaid === true) {
      return { alreadyPaid: true, cost: game.reviewCost || 0 };
    }
    if (typeof game.finalScore !== "number") {
      throw new HttpsError("failed-precondition", "No score saved for this game.");
    }

    const totalScore = userSnap.exists ? userSnap.data().totalScore || 0 : 0;
    // Whole-number maths first, so 100 points gives exactly 15 (no floating point surprises)
    const wanted = Math.ceil((game.finalScore * REVIEW_COST_PERCENT) / 100);
    // Clamp: xpIntoLevel = points above the start of the current level, so a level is never lost
    const headroom = calcLevelInfo(totalScore).xpIntoLevel;
    const cost = Math.min(wanted, headroom);

    const newTotal = totalScore - cost;
    tx.set(userRef, {
      totalScore: newTotal,
      levelProgress: calcLevelInfo(newTotal).progress,
      updatedAt: new Date(),
    }, { merge: true });
    tx.update(gameRef, { reviewPaid: true, reviewCost: cost, reviewPaidAt: new Date() });

    return { alreadyPaid: false, cost };
  });
});

// ── GET LEADERBOARDS (one cached top-100 list) ─────────────────────────
exports.getLeaderboards = onCall(async (request) => {
  const myUid = request.auth ? request.auth.uid : null;
  const { boardId } = request.data;
  const validId = typeof boardId === "string" &&
    (boardId === "total" || /^(score|unlim)-[a-z0-9&-]+-l\d+$/.test(boardId));
  if (!validId) {
    throw new HttpsError("invalid-argument", "Invalid boardId.");
  }

  const snap = await db.collection("lbTop").doc(boardId).get();
  if (!snap.exists) return { entries: [], updatedAt: null };

  const data = snap.data();
  const boardEntries = (data.entries || []).slice();
  if (boardId !== "total") boardEntries.sort(compareLeaderboardEntries);
  const entries = boardEntries.map(({ uid, ...rest }) => ({
    ...rest,
    isMe: myUid !== null && uid === myUid,
  }));
    let me = null;
  if (myUid && !entries.some((e) => e.isMe)) {
    const uid = myUid;
    const userSnap = await db.collection("users").doc(uid).get();
    if (userSnap.exists) {
      const u = userSnap.data();
      let score = 0;
      let timeSecs;
      if (boardId === "total") {
        score = u.totalScore || 0;
      } else {
        const m = boardId.match(/^(score|unlim)-(.+)-l(\d+)$/);
        const att = await db.collection("users").doc(uid)
          .collection("attempts").doc(`${m[2]}-l${m[3]}`).get();
        if (att.exists) {
          const a = att.data();
          score = (m[1] === "score" ? a.bestScore : a.bestScoreUnlim) || 0;
          timeSecs = m[1] === "score"
            ? a.bestScoreTimeSecs
            : a.bestScoreUnlimTimeSecs;
        }
      }
      if (score > 0) {
        me = {
          username: u.username,
          profilePicUrl: u.profilePicUrl,
          level: u.level,
          favTopic: u.favTopic,
          score,
          ...(Number.isFinite(timeSecs) ? { timeSecs } : {}),
        };
      }
    }
  }
  return { entries, me, updatedAt: data.updatedAt ? data.updatedAt.toMillis() : null };
});