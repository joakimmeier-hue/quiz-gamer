/* =====================================================================
   QuizGamer – leaderboard bot seeder
   ---------------------------------------------------------------------
   node seed-bots.js --dry-run    show what would happen, writes nothing
   node seed-bots.js              create / overwrite all bots
   node seed-bots.js --remove     remove all bots (add --dry-run to preview)
   Add --yes to skip the "are you sure" question.

   Needs:  npm i firebase-admin
           avatars.txt next to this file (one profile-pic URL per line)
           credentials: GOOGLE_APPLICATION_CREDENTIALS=path\to\serviceAccountKey.json

   What a bot is:
     users/bot_001 ... bot_NNN   (isBot: true)   -> so usernames are reserved,
                                                   recomputeRanks sees them
     entries with uid "bot_..." inside lbTop/*    -> the actual leaderboard rows
   Real players' entries are never touched or pushed out by this script.
   Same SEED + same settings = exactly the same bots every run.
   ===================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const admin = require("firebase-admin");

// ───────────── SETTINGS (edit freely) ─────────────
const SEED = 20261103;               // change it to get a completely new set of bots
const POOL_SIZE = 400;               // total bots. Your names first, the rest are generated
const BOT_PREFIX = "bot_";           // uid prefix, this is how bots are recognised
const TIERS = [1, 2, 3, 4];          // add 5 when it exists
const TOTAL_RANGE = [7542, 387431];  // total score of the whole bot pool
const HIGHSCORE_RANGE = [113, 518]; // per list, Tier 1 values. Higher tiers get the tier multiplier on top
const UNLIM_FACTOR = 1.3;              // unlimited lists ≈ highscore range x this (±8 % jitter)

// The topic ids as they are written in the db (ids of your question banks / lbTop boardIds).
const TOPICS = ["science", "history", "food", "animals", "cars", "puzzle", "maze", "pattern", "music", "biology", "geo&travel", "movies", "literature", "math", "sports"];

// ───────────── COPIED FROM functions/index.js (keep in sync) ─────────────
const TOP_N = 100;

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

const PIC_REGEX = /^https:\/\/cdn\.prod\.website-files\.com\/693d8d6b18be20357a9cf397\/[A-Za-z0-9_.-]+\.webp$/;

// Cumulative threshold: level N requires sum of 128*1 + 128*2 + ... + 128*(N-1)
// The only place that defines the curve. Change this later to slow progression.
function levelCost(level) {
  return level * 128;
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

// ───────────── YOUR NAMES (invalid ones are skipped automatically) ─────────────
const USER_NAMES = `Tailgunner, David_S, Ceasar77, Master Chief, Tarzan, Khana, Heiphaistos, Esoteric_Joe, Nephilim4, AdhdTomas, Silversnoken, Illuminati, Neo, Skeletor, Joseph, Potter Harry, Abraham, Achilles, Cleopatra, Vader-saber, Genghis Khan, mini_matrix, Netrunner, Exfiller, Aphrodite, Hyperion, Einstein-3000, Baal, Tv-800, Annis, Zee, Lilly, Jonah, Philippa, Sara Daria, Camelo, tittyhunter14, wewerehere, Skywalker1, Hannibal, Venus_99, Snattarn, brainstorm2000, Typhoon_me, Carolus craus, xxx_Zero_xxx, 007xena, Eyafjättlu1998, Mombasa, Blade, Anna, Zoe, Saharaisnow, Tony, Anastasia, zebramania, valhallkommer, VanDamme, Hauser, stickySteve, MrPoeAllan, Dr. Freeman, Alyx, missan, cleo, star69, Fight Club, Tylor Dyrden7, Max, GollumLives, the mummy, Heracles, Dracula, oMaley, mcLovin64, Xelda, Mimmi, PeterPan, Grabber1, bravo6, S7eve., Robert, Nova, Gandalf_Reaper, Anubis, Shinigami, Sun-Samurai, dosTo3vSky, CatwomanZ, zomBie, 10KBC, Elsa, Miza, Archimedes, Hypatia, Socrates5, DiogenesS, Ryu, Elvisp, Vegaman, slimeboy, BIGslim, IndyAnna37, CaptCobra, Capt_Fishy, Capt-Crysis, Stootzmon, Moony, Dr3lior, DrSpaz, DrEvil, KnowledgeWiz, Cruiser-1, EnigmaJoe, LuckyJack, _V_, LaraK, Jockeboi, Cybersinger, anUpd8, Bot-Sam, Bamboshi9, humanRobot, humanComputer, Sara Lambda, Uruk, Nic-98, 2K, Paemon, Blair Witch Z, B_the_Knight, Neon-King, The fat cat, Asmodius, Cato, skillyboy, aKiRa, Alex-not-great, Ryuk41, Slaggy, Georgia, Rosetta, Nicky_PG, Sticky Nicky, Julia78, ADD-Sam, Mr Morrhår, V, L, Ronin_Jack, HatoriHanzo, Dr. Slime, Dark-Messiah, RayZor, Razor-88, kINg, Penguin, Uruk-Hai, Fox, sSsankE, Snake, Silva, Arasaka, Drifter, oldSchool, lilD, Joker, Fakeru, Slider, Watari, 2BaGod49t, Antonio1, PemBok, Pat, Z, Aizawa, 2u3sDaY, Black Holer, emc2, PlayerNrOne, Obi One, Psycho, Zigma, Zeta R, Bruce_Sane, General45, Smith, Playa17, Solo, Sane, SaintNr1, corruptFile, Noregrets, Undertaker66, HopperZ, Lil-John, Reclaimer-17, Sam_Walker, Kito, Kira, Knut, Khan, John Silver, Cpt Vain, Sonja, Original_sin, Esotericman, Vesuvius, Quintus, Macro, Abomination, Heretic1, TaRe9, dontH8, Dino, Black-Jesus, BlackMamba, LazerBoi, Mara, Emma27, Pekka600, gummies, Ra, Iris, Caesar, Odin88, BamboshiHunter, hope_less, Osiris, Isa, Mona, ToplessJoe, Bot_nr1, Xerxes, aBot99, K2, Turok, Luigi, ZeldaP, Ikaros, Einstein2.0, Bowser, Snorlax, Boboon64, Bobban, Pumpkin5, Ghost88, Sam, Rose, Mr White, Smoke, Fox21, Jax, Nala, cAs3, Casper24, Mr Slim, JackJack, Uggla, 24se7en, 0mal8y, Siegfried, Chimera, Blade21, Åle, Rex, 321go, Mrs Fox, Cat77, bLade_run3r, Iamerror, Chris99, Ako, Pi, Hank1, B, bOb, Mario, Pikatchu2, Einstein_2.0, Obese-Ann, Shinobi, ApexJoe, Zig, Fanny, Lil-eric, Sai_tomi, Java, Rama, Santi1, Ober-Hara, Cpt-Carlsson, Drexler5, Motoko, Mats, Phil_17, Pena.SS, B.ill.biZ, Mr.inSane, Lara_Soft, SmiLLa_33, Koochee, LaMa-S, Kuro, Sara_95, Kami_san, bad.patch.1, 99.pure, hOly-sMokE, Animalbones, IcanFly, Jumanji69, Seventh-Son, Alex_88, mAx_tecH-3, Mini_Max, 6ee_M33, Er.hu, Man_2.0, imyrSensei, Bambi7, bOss_lE7el, Conan, KIM, monkey2man, Firstinspace, Nero, Dante_X, Q.2, 2B, laZer-titZ, Kol, officer_K, Cane, Mrs. Nasty, Ms Diva89, Ms. Dolores, nr.1oNe, bAd-Brea7H, cyb3r_Roy, Lee, Chun Lee, Lee-Pow, eLon_tuSk, El, 47 Ronin, Tokugawa-2000, Gunnar, Nr. One` 

  .split(",").map((s) => s.trim()).filter(Boolean)
  .filter((name) => validateUsernameServer(name).length === 0);

// building blocks for the generated names
const WORDS_A = ["Shadow", "Night", "Iron", "Frost", "Pixel", "Rogue", "Storm", "Lucky", "Cyber", "Neon",
  "Turbo", "Ninja", "Viking", "Raven", "Ember", "Crimson", "Silent", "Atomic", "Mystic", "Rusty",
  "Sneaky", "Cosmic", "Toxic", "Wild", "Golden", "Dark", "Swift", "Brainy", "Quiz", "Trivia", "Mega", "Lazy"];
const WORDS_B = ["Wolf", "Hunter", "Wizard", "Knight", "Slayer", "Mage", "Fox", "Ghost", "Rider", "Smith",
  "Baker", "Gamer", "Boi", "Queen", "King", "Owl", "Falcon", "Bear", "Pilot", "Nerd", "Guru", "Master",
  "Ranger", "Viper", "Tiger", "Dragon", "Pirate", "Monk", "Sage", "Brain", "Panda", "Ace"];

// ───────────── seeded random (same SEED = same bots) ─────────────
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const rint = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const isBotUid = (uid) => typeof uid === "string" && uid.startsWith(BOT_PREFIX);
const fmt = (n) => n.toLocaleString("en-US");
const args = new Set(process.argv.slice(2));

// ───────────── names ─────────────
function genName() {
  const a = pick(WORDS_A), b = pick(WORDS_B);
  const n = pick([1, 2, 2, 4]); // one, two or four digits
  const d = n === 1 ? String(rint(1, 9)) : n === 2 ? String(rint(10, 99)) : String(rint(1970, 2012));
  const sep = pick(["", "-", "_"]);
  const name = pick([
    () => a + b, () => a + "_" + b, () => a + "-" + b, () => a + " " + b,
    () => a + b + d, () => a + sep + d, () => b + sep + d, () => a + b.toLowerCase(),
  ])();
  return rand() < 0.15 ? name.toLowerCase() : name;
}

function buildNames(takenByRealUsers) {
  const seen = new Set(takenByRealUsers);
  const names = [], skipped = [];
  for (const n of USER_NAMES) {
    const key = n.toLowerCase();
    if (validateUsernameServer(n).length || seen.has(key)) { skipped.push(n); continue; }
    seen.add(key); names.push(n);
  }
  for (let guard = 0; names.length < POOL_SIZE && guard < 50000; guard++) {
    const n = genName(), key = n.toLowerCase();
    if (seen.has(key) || validateUsernameServer(n).length) continue;
    seen.add(key); names.push(n);
  }
  return { names, skipped };
}

async function loadAvatars() {
  const file = path.join(__dirname, "avatars.txt");

  // node seed-bots.js --avatars-from https://quizgamer.se/<page with the avatar picker>
  // reads the page's HTML, takes every <img class="profile-pic-option">, saves them to avatars.txt
  const i = process.argv.indexOf("--avatars-from");
  if (i > -1) {
    const pageUrl = process.argv[i + 1];
    if (!pageUrl || pageUrl.startsWith("--")) die("--avatars-from needs a page URL after it.");
    const res = await fetch(pageUrl);
    if (!res.ok) die(`Could not fetch ${pageUrl} (HTTP ${res.status}).`);
    const html = await res.text();
    const found = (html.match(/<img\b[^>]*>/gi) || [])
      .filter((tag) => tag.includes("profile-pic-option"))
      .map((tag) => (tag.match(/\bsrc="([^"]+)"/i) || [])[1])
      .filter((u) => u && PIC_REGEX.test(u));
    const fetched = [...new Set(found)];
    if (!fetched.length) die("No profile-pic-option images with a valid .webp URL in that page's HTML. Is it the page that contains the avatar picker? Otherwise paste the URLs into avatars.txt by hand.");
    fs.writeFileSync(file, fetched.join("\n"));
    console.log(`Saved ${fetched.length} avatar URLs to avatars.txt`);
  }

  if (!fs.existsSync(file)) die("avatars.txt not found next to seed-bots.js. Use --avatars-from <page url>, or paste one URL per line.");
  const urls = [...new Set(fs.readFileSync(file, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
  const bad = urls.filter((u) => !PIC_REGEX.test(u));
  if (bad.length) die("These avatar URLs would be rejected by completeProfile's PIC_REGEX:\n  " + bad.join("\n  "));
  if (!urls.length) die("avatars.txt is empty.");
  return urls;
}

function die(msg) { console.error("\n✖ " + msg + "\n"); process.exit(1); }

// ───────────── bots ─────────────
function makeTopicCounts(fav, total) {
  // fav topic must be the one with the most games (that is how fav topic is defined)
  const games = Math.max(4, Math.round(total / rint(250, 600)));
  const favShare = Math.max(2, Math.round(games * (0.4 + rand() * 0.3)));
  const counts = { [fav]: favShare };
  let left = games - favShare;
  for (const t of shuffle(TOPICS.filter((x) => x !== fav)).slice(0, rint(1, 3))) {
    const n = Math.min(left, rint(1, Math.max(1, favShare - 1)));
    if (n > 0) { counts[t] = n; left -= n; }
  }
  counts[fav] += left;
  return counts;
}

function makeBots(names, avatars) {
  const [lo, hi] = TOTAL_RANGE;
  // log-uniform: lots of small players, a few whales (like a real leaderboard)
  const totals = names.map(() => Math.round(lo * Math.pow(hi / lo, rand()))).sort((a, b) => b - a);
  totals[0] = hi; totals[totals.length - 1] = lo;
  const order = shuffle(names.map((_, i) => i)); // which bot gets which total
  return names.map((username, i) => {
    const total = totals[order[i]];
    const info = calcLevelInfo(total);
    const favTopic = pick(TOPICS);
    return {
      uid: BOT_PREFIX + String(i + 1).padStart(3, "0"),
      username,
      profilePicUrl: pick(avatars),
      favTopic,
      totalScore: total,
      level: info.level,
      levelProgress: info.progress,
      skill: 1 - order[i] / (names.length - 1), // 1 = best bot, 0 = weakest
      topicCounts: makeTopicCounts(favTopic, total),
    };
  });
}

const toEntry = (b, score) => ({
  uid: b.uid, username: b.username, profilePicUrl: b.profilePicUrl,
  favTopic: b.favTopic, level: b.level, score,
});

// one highscore / unlimited list for a topic + tier
function buildBoard(bots, topic, tier, unlimited) {
  // 1. who is on the list: bots that are high enough level for this tier first,
  //    bots whose fav topic matches the list are a bit more likely to be on it
  const need = TIER_REQUIREMENTS[tier];
  const key = (b) => rand() + (b.favTopic === topic ? 0.5 : 0);
  const eligible = bots.filter((b) => b.level >= need).map((b) => [key(b), b]).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
  const rest = bots.filter((b) => b.level < need).map((b) => [rand(), b]).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
  const chosen = eligible.concat(rest).slice(0, TOP_N);

  // 2. their scores: skill drives most of it, a bit of luck, and the curve bunches
  //    most bots at the low end while only a few elite-question runs reach the top
  const raw = chosen.map((b) => Math.min(1, b.skill * 0.65 + rand() * 0.35) ** 2.2);
  const mn = Math.min(...raw), mx = Math.max(...raw);
  const [lo, hi] = HIGHSCORE_RANGE;
  const entries = chosen.map((b, i) => {
    let s = lo + (hi - lo) * ((raw[i] - mn) / (mx - mn || 1)); // list spans exactly lo..hi
    if (unlimited) s *= UNLIM_FACTOR * (0.92 + rand() * 0.16);
    return toEntry(b, Math.ceil(s * TIER_MULTIPLIERS[tier]));
  });
  return { entries, underLevel: chosen.filter((b) => b.level < need).length };
}

// real entries are never displaced: only the lowest bots are cut when the list is full
function mergeBoard(existingEntries, botEntries) {
  const real = (existingEntries || []).filter((e) => !isBotUid(e.uid));
  let botSlots = TOP_N - real.length;
  const out = [];
  for (const e of [...real, ...botEntries].sort((a, b) => b.score - a.score)) {
    if (isBotUid(e.uid)) { if (botSlots <= 0) continue; botSlots--; }
    out.push(e);
  }
  return out;
}

// ───────────── firestore ─────────────
admin.initializeApp();
const db = admin.firestore();

function newWriter() {
  const w = db.bulkWriter();
  w.onWriteError((err) => { console.error("  write failed:", err.documentRef.path, err.message); return false; });
  return w;
}

function confirm(q) {
  if (args.has("--yes")) return Promise.resolve(true);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q + " (y/N) ", (a) => { rl.close(); res(/^y/i.test(a)); }));
}

const line = (id, e) =>
  `  ${id.padEnd(24)} ${String(e.length).padStart(3)} rows   ${fmt(e[0].score)} … ${fmt(e[e.length - 1].score)}   (Lvl ${e[0].level} … ${e[e.length - 1].level})`;

async function seed(dry) {
  const avatars = await loadAvatars();

  // existing users: find old bots, and the names real players already own
  const usersSnap = await db.collection("users").select("username").get();
  const takenNames = new Set(), oldBotIds = [];
  usersSnap.forEach((d) => {
    if (isBotUid(d.id)) oldBotIds.push(d.id);
    else takenNames.add(String(d.get("username") || "").toLowerCase());
  });

  const { names, skipped } = buildNames(takenNames);
  const bots = makeBots(names, avatars);
  console.log(`\n${bots.length} bots (${USER_NAMES.length - skipped.length} from your list, ${bots.length - (USER_NAMES.length - skipped.length)} generated), ${avatars.length} avatars`);
  if (skipped.length) console.log("Skipped from your list (invalid / too long / taken by a real player): " + skipped.join(", "));

  const lbSnap = await db.collection("lbTop").get();
  const existing = {};
  lbSnap.forEach((d) => { existing[d.id] = d.data().entries || []; });

  // build every list
  const boards = {};
  const warnings = [];
  const totalBots = bots.slice().sort((a, b) => b.totalScore - a.totalScore).slice(0, TOP_N).map((b) => toEntry(b, b.totalScore));
  boards.total = mergeBoard(existing.total, totalBots);
  const rankOf = new Map(boards.total.map((e, i) => [e.uid, i + 1]));
  for (const topic of TOPICS) {
    for (const tier of TIERS) {
      for (const kind of ["score", "unlim"]) {
        const id = `${kind}-${topic}-l${tier}`;
        const b = buildBoard(bots, topic, tier, kind === "unlim");
        if (b.underLevel) warnings.push(`${id}: ${b.underLevel} bots are below the level this tier requires (not enough high-level bots in the pool)`);
        boards[id] = mergeBoard(existing[id], b.entries);
      }
    }
  }

  console.log(`\n${Object.keys(boards).length} lists. A few of them:`);
  for (const id of ["total", "score-science-l1", "score-science-l4", "unlim-science-l1", "unlim-science-l4"]) console.log(line(id, boards[id]));
  if (warnings.length) console.log("\nWarnings:\n  " + warnings.join("\n  "));

  const staleBots = oldBotIds.filter((id) => !bots.some((b) => b.uid === id));
  console.log(`\nWill write ${bots.length} user docs, ${Object.keys(boards).length} lbTop docs, ${TOPICS.length * TIERS.length} leaderboards docs` +
    (staleBots.length ? `, and delete ${staleBots.length} old bot users that are no longer in the pool` : "") + ".");
  if (dry) return console.log("Dry run – nothing was written.");
  if (!(await confirm("Write this to the database now?"))) return console.log("Cancelled.");

  const w = newWriter();
  const now = new Date();
  for (const b of bots) {
    w.set(db.collection("users").doc(b.uid), {
      username: b.username, profilePicUrl: b.profilePicUrl, favTopic: b.favTopic,
      level: b.level, levelProgress: b.levelProgress, totalScore: b.totalScore,
      topicCounts: b.topicCounts, rank: rankOf.get(b.uid) || 0,
      hasChangedUsername: true, isBot: true, updatedAt: now,
    });
  }
  for (const id of staleBots) w.delete(db.collection("users").doc(id));
  for (const [id, entries] of Object.entries(boards)) {
    w.set(db.collection("lbTop").doc(id), { entries, updatedAt: now });
    if (id.startsWith("score-") && entries.length) {
      w.set(db.collection("leaderboards").doc(id.slice("score-".length)),
        { topScore: entries[0].score, topUsername: entries[0].username, updatedAt: now }, { merge: true });
    }
  }
  await w.close();
  console.log("Done.");
}

async function removeBots(dry) {
  const usersSnap = await db.collection("users").select().get(); // ids only
  const botIds = usersSnap.docs.map((d) => d.id).filter(isBotUid);
  const lbSnap = await db.collection("lbTop").get();

  // plan first, write after the confirmation (BulkWriter starts sending as soon as ops are queued)
  const now = new Date();
  const ops = [];
  let emptied = 0;
  for (const d of lbSnap.docs) {
    const entries = d.data().entries || [];
    const kept = entries.filter((e) => !isBotUid(e.uid));
    if (kept.length === entries.length) continue;
    const gameId = d.id.startsWith("score-") ? d.id.slice("score-".length) : null;
    if (kept.length === 0) {
      emptied++;
      ops.push((w) => { w.delete(d.ref); if (gameId) w.delete(db.collection("leaderboards").doc(gameId)); });
    } else {
      ops.push((w) => {
        w.set(d.ref, { entries: kept, updatedAt: now });
        if (gameId) w.set(db.collection("leaderboards").doc(gameId),
          { topScore: kept[0].score, topUsername: kept[0].username, updatedAt: now }, { merge: true });
      });
    }
  }
  console.log(`\nRemoving ${botIds.length} bot users; cleaning ${ops.length} lbTop lists (${emptied} of them end up empty and are deleted, with their leaderboards doc).`);
  if (dry) return console.log("Dry run – nothing was removed.");
  if (!(await confirm("Remove all bots now?"))) return console.log("Cancelled.");

  const w = newWriter();
  ops.forEach((op) => op(w));
  for (const id of botIds) w.delete(db.collection("users").doc(id));
  await w.close();
  console.log("Done.");
}

(async () => {
  console.log("Project:", admin.app().options.projectId || process.env.GOOGLE_CLOUD_PROJECT || "(taken from your credentials)");
  if (process.env.FIRESTORE_EMULATOR_HOST) console.log("Using emulator:", process.env.FIRESTORE_EMULATOR_HOST);
  const dry = args.has("--dry-run");
  if (args.has("--remove")) await removeBots(dry); else await seed(dry);
})().catch((e) => { console.error(e); process.exit(1); });