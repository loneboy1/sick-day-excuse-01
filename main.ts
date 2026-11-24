// Sick-day excuse writer for "The Funniest Sick-Day Excuse" (make.fun).
// Writes a single excuse line to $MAKEFUN_OUTPUT_DIR/entry.txt.
// Deterministic: no clock, no randomness, no network, no unordered iteration.
// Node 22, zero dependencies, erasable TypeScript only.
//
// The judge (a comedy editor) weighs, most important first:
//   1. a reason to call in sick that a boss might half believe and a
//      coworker would laugh at;
//   2. a fresh idea rather than a worn excuse about a fever, a dog or a
//      dead grandmother;
//   3. lands on one read, with the twist or the funniest word arriving
//      near the end;
//   4. sounds like a real person typing a message, not a joke built for
//      a contest;
//   5. wastes no words: every part of the line is doing work.
// The scorer below mirrors that brief in the same order. Each candidate
// carries its rubric sub-scores (believable /20, fresh /20, twist /20,
// human voice /15, tight /15), scored by hand against the brief; the
// program adds the length bonus (+3 at 110 chars or fewer, +1 at 140 or
// fewer) and picks the winner by deterministic argmax: highest score,
// then shortest, then lexicographic.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------- candidates
// Every line is one sentence of at most 200 characters, written for this
// entry. The strongest lines share one shape: a small, half-believable
// bodily failure, then a pivot near the end that reframes it as something
// absurd — a doctor's verdict, a workers' comp claim, a union. Crowded
// angles the field is already flooding are left out entirely: fever and
// flu, the dog, the dead grandmother, plain food poisoning, the car
// breaking down, the pulled muscle from carrying the office printer.

interface Rubric {
  believable: number; // /20 — a boss might half believe it
  fresh: number; // /20 — an idea the judge has not met a hundred times
  twist: number; // /20 — lands on one read, funniest word near the end
  humanVoice: number; // /15 — sounds like a real person typing a message
  tight: number; // /15 — every word earning its place
}

interface Scored {
  text: string;
  rubric: Rubric;
}

const CANDIDATES: Scored[] = [
  // Pulled muscle yawning: a tiny, half-believable injury, and the
  // doctor's quote is the laugh, landing in the final clause.
  {
    text: "I pulled a muscle yawning, which my doctor called 'impressive in the worst way'.",
    rubric: { believable: 18, fresh: 19, twist: 18, humanVoice: 14, tight: 14 },
  },
  // Same injury, framed as the text to the boss. The framing costs words.
  {
    text: "I can't come in today, I pulled a muscle yawning, and my doctor called it 'impressive in the worst way'.",
    rubric: { believable: 18, fresh: 19, twist: 18, humanVoice: 15, tight: 12 },
  },
  // Sneeze injury: the back files a claim, which is the whole joke.
  {
    text: "I sneezed so hard my back filed for workers' comp.",
    rubric: { believable: 17, fresh: 18, twist: 19, humanVoice: 13, tight: 15 },
  },
  // Bee sting: the confession "which I did" reframes the whole setup.
  {
    text: "My eye is swollen shut and I look like I lost a fight with a bee, which I did.",
    rubric: { believable: 17, fresh: 17, twist: 19, humanVoice: 14, tight: 14 },
  },
  // Lifting nothing: the injury is real, the cause is the joke.
  {
    text: "I threw my back out lifting nothing, which is somehow worse than lifting something.",
    rubric: { believable: 18, fresh: 18, twist: 17, humanVoice: 14, tight: 14 },
  },
  // Laryngitis, gladly: the excuse admits it likes the excuse.
  {
    text: "I woke up with laryngitis, which is convenient because I was going to say no to everything today anyway.",
    rubric: { believable: 16, fresh: 18, twist: 19, humanVoice: 15, tight: 13 },
  },
  // The body parts unionize: personification lands in the final clause.
  {
    text: "My back went out, my knee joined it, and they're forming a union.",
    rubric: { believable: 15, fresh: 18, twist: 19, humanVoice: 13, tight: 15 },
  },
  // Birthday-cake poisoning: the pivot makes it a workplace injury.
  {
    text: "I got food poisoning from the office birthday cake, so technically this is a workplace injury.",
    rubric: { believable: 18, fresh: 16, twist: 18, humanVoice: 14, tight: 14 },
  },
  // The smartwatch diagnoses stress; the couch is the treatment.
  {
    text: "My smartwatch says my stress level is 'seek help', so I'm seeking it from my couch.",
    rubric: { believable: 13, fresh: 19, twist: 17, humanVoice: 15, tight: 14 },
  },
  // Resting the voice, by not answering: the cure is the absence.
  {
    text: "The doctor told me to rest my voice, so I'm resting it by not answering any of your calls today.",
    rubric: { believable: 16, fresh: 16, twist: 18, humanVoice: 15, tight: 13 },
  },
  // Gas station sushi on a dare: the dare is the confession.
  {
    text: "I can't come in, I have a stomach bug, and by stomach bug I mean I ate gas station sushi on a dare.",
    rubric: { believable: 17, fresh: 16, twist: 17, humanVoice: 15, tight: 13 },
  },
  // Too healthy to call in yesterday: the delay is the joke.
  {
    text: "I tried to call in sick yesterday but my voice sounded too healthy, so I waited until today.",
    rubric: { believable: 12, fresh: 19, twist: 18, humanVoice: 15, tight: 13 },
  },
  // Migraine cure: darkness, silence, and no questions about it.
  {
    text: "I have a migraine and the only cure is darkness, silence, and not being asked about the migraine.",
    rubric: { believable: 17, fresh: 16, twist: 17, humanVoice: 14, tight: 13 },
  },
  // Blind in one eye, by pillow: the cause undercuts the drama.
  {
    text: "I woke up blind in one eye and it turns out my pillow was just folded over it, but I'm taking the day anyway.",
    rubric: { believable: 13, fresh: 19, twist: 18, humanVoice: 15, tight: 12 },
  },
  // Office lights migraine: working from the dark, like a mushroom.
  {
    text: "I got a migraine from the office lights, so I'm working from the dark like a mushroom.",
    rubric: { believable: 15, fresh: 17, twist: 17, humanVoice: 13, tight: 14 },
  },
  // Legs working from home: the body remote-works without its owner.
  {
    text: "I can't come in today, my legs have decided to work from home without me.",
    rubric: { believable: 12, fresh: 17, twist: 17, humanVoice: 15, tight: 14 },
  },
  // Hurts everywhere and nowhere: the body as a software update.
  {
    text: "My body is doing that thing where it hurts everywhere and nowhere, like a software update.",
    rubric: { believable: 14, fresh: 17, twist: 16, humanVoice: 14, tight: 13 },
  },
  // WebMD prophecy: the symptoms arrived on schedule.
  {
    text: "I woke up with the exact symptoms WebMD promised I'd have if I kept working like this.",
    rubric: { believable: 12, fresh: 18, twist: 16, humanVoice: 14, tight: 13 },
  },
  // The body read the terms and conditions: too late to opt out.
  {
    text: "I need the day off, my body finally read the terms and conditions of my job.",
    rubric: { believable: 11, fresh: 17, twist: 15, humanVoice: 13, tight: 13 },
  },
  // Allergic to Mondays: the test came back positive.
  {
    text: "I'm allergic to Mondays, and today my allergy test came back positive.",
    rubric: { believable: 10, fresh: 14, twist: 16, humanVoice: 13, tight: 14 },
  },
];

// Crowded angles already flooding the field: discard, not down-score.
const BANNED: string[] = [
  "fever",
  "flu",
  "dog ate",
  "grandmother",
  "grandma died",
  "car broke down",
  "printer",
  "covid",
];

// ------------------------------------------------------------------- scoring
// Rubric mirroring the judge's brief, most important first.

function baseScore(r: Rubric): number {
  return r.believable + r.fresh + r.twist + r.humanVoice + r.tight;
}

function lengthBonus(text: string): number {
  const len = text.length;
  if (len <= 110) return 3; // short lines land hardest
  if (len <= 140) return 1;
  return 0;
}

function score(c: Scored): number {
  return baseScore(c.rubric) + lengthBonus(c.text);
}

function isValid(text: string): boolean {
  if (text.length < 1 || text.length > 200) return false;
  if (text.trim() !== text || text.trim().length === 0) return false;
  if (!text.endsWith(".")) return false;
  // Exactly one sentence: one terminal period, no other sentence enders.
  const body = text.slice(0, -1);
  if (/[.!?;]/.test(body)) return false;
  if (/\s{2,}/.test(text)) return false;
  const lower = text.toLowerCase();
  if (BANNED.some((b) => lower.includes(b))) return false;
  // No sales pitch, no link, no call to action: the line must stand alone.
  if (/free|subscribe|click|buy now|http/.test(lower)) return false;
  return true;
}

// -------------------------------------------------------------- composition
interface Candidate {
  text: string;
  score: number;
}

function buildCandidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const c of CANDIDATES) {
    if (!isValid(c.text)) continue;
    out.push({ text: c.text, score: score(c) });
  }
  return out;
}

function rank(candidates: Candidate[]): Candidate[] {
  // Deterministic argmax: higher score, then shorter, then lexicographic.
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.text.length !== b.text.length) return a.text.length - b.text.length;
    return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
  });
}

// --------------------------------------------------------------------- main
function main(): void {
  const candidates = buildCandidates();
  if (candidates.length === 0) throw new Error("no valid excuse candidate");
  const ranked = rank(candidates);
  const best = ranked[0];
  if (process.env.EXCUSE_DEBUG) {
    for (const c of ranked.slice(0, 5)) {
      console.log(`[${c.score}] (${c.text.length}) ${c.text}`);
    }
  }
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.txt"), best.text, "utf8");
  console.log(best.text);
  console.log(
    `chars: ${best.text.length} score: ${best.score} candidates: ${candidates.length}`,
  );
}

main();
