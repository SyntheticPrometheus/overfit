// The audience panel: AI-playtester feedback that is allowed to move the design
// only if it survives a negative control.
//
// Why this exists. Two results from the reading (research/rr/subagent-playtesters.md):
// LLM-simulated users are unreliable *absolute* proxies -- their ratings miscalibrate
// in both directions and are politeness-biased; and panels only find different things
// when their raters differ. So this harness never asks "is it fun?" on its own. It
// asks a blind A/B against a build that is deliberately choice-poor (`transcript.mjs
// --variant dead`: the game Harvests for you, so the only decision left is shopping),
// and the score is a *judgement*, not a preference: can this rater tell the two apart,
// in the direction the design says matters?
//
//   node design/audience.mjs pack --out design/audience/pack1              # live=A
//   node design/audience.mjs pack --out design/audience/pack2 --flip       # live=B
//   node design/audience.mjs score --pack design/audience/pack1 design/audience/pack1/panel-*.json
//   node design/audience.mjs score ... --check     # exit 1 = the panel is not an instrument
//   node design/audience.mjs selftest              # proves the gate rejects a yes-man panel
//
// The gate (pre-registered in design/audience/RUBRIC.md, do not tune after seeing
// the result): >= 3/4 raters prefer live, mean live engagement beats dead by
// >= 0.75 on a 1-5 scale, no rater contradicts its own series by more than 1.0.
// A panel that fails the gate is a *failed measurement*: report it, do not cite it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const [cmd, ...rest] = process.argv.slice(2);
const arg = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : d; };
const has = k => rest.includes('--' + k);
const positional = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--') && rest[i - 1] !== '--pack' && rest[i - 1] !== '--out'));

function transcript(variant, minutes, seed) {
  return execFileSync('node', [path.join(HERE, 'transcript.mjs'), '--variant', variant,
    '--minutes', String(minutes), '--seed', String(seed), ...((arg('narrative', null)) ? ['--narrative', arg('narrative', null)] : [])], { encoding: 'utf8' });
}

function pack() {
  const out = path.resolve(arg('out', path.join(HERE, 'audience', 'pack1')));
  const minutes = Number(arg('minutes', 10));
  const flip = has('flip');
  const live = transcript('live', minutes, arg('seed', 12345));
  const dead = transcript('dead', minutes, arg('seed', 12345));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, flip ? 'b.txt' : 'a.txt'), live);
  fs.writeFileSync(path.join(out, flip ? 'a.txt' : 'b.txt'), dead);
  const key = { live: flip ? 'b' : 'a', dead: flip ? 'a' : 'b', minutes, hold: 5, made: new Date().toISOString() };
  fs.writeFileSync(path.join(out, 'key.json'), JSON.stringify(key, null, 2) + '\n');
  console.log(`pack ${out}\n  a.txt / b.txt  (${minutes} minutes each)\n  live is ${key.live.toUpperCase()}, dead is ${key.dead.toUpperCase()}`);
  console.log('  give both to each rater with design/audience/RUBRIC.md; they never see key.json');
}

function keyFor(file) {
  let d = path.dirname(path.resolve(file));
  for (let i = 0; i < 3; i++) {
    const k = path.join(d, 'key.json');
    if (fs.existsSync(k)) return JSON.parse(fs.readFileSync(k, 'utf8'));
    d = path.dirname(d);
  }
  throw new Error(`no key.json above ${file}`);
}

function loadPanel(files) {
  const rows = [];
  const problems = [];
  for (const f of files) {
    let p;
    try { p = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { problems.push(`${path.basename(f)}: not JSON (${e.message})`); continue; }
    const eng = v => (p[v] && Array.isArray(p[v].engagement) ? p[v].engagement.map(Number) : null);
    const a = eng('a'), b = eng('b');
    if (!a || !b || a.length !== b.length) { problems.push(`${path.basename(f)}: engagement series missing or unequal length`); continue; }
    if (a.some(x => !(x >= 1 && x <= 5)) || b.some(x => !(x >= 1 && x <= 5))) { problems.push(`${path.basename(f)}: engagement outside 1..5`); continue; }
    const key = keyFor(f);
    const live = key.live === 'a' ? a : b, dead = key.live === 'a' ? b : a;
    const mean = xs => xs.reduce((x, y) => x + y, 0) / xs.length;
    const verdict = String(p.more_fun || '').toLowerCase().trim();
    const prefersLive = verdict === key.live;
    // A rater whose words and numbers disagree is not a measurement.
    const implied = mean(live) > mean(dead) ? key.live : key.dead;
    const contradiction = verdict === key.live || verdict === key.dead ? (implied !== verdict ? Math.abs(mean(live) - mean(dead)) : 0) : null;
    rows.push({ file: path.basename(f), persona: p.persona || path.basename(f, '.json'), live, dead,
      mLive: mean(live), mDead: mean(dead), prefersLive, contradiction, wanted: p.wanted || '', why: p.why || '',
      boring: live.map((v, i) => v <= 2 && dead[i] >= 3 ? i + 1 : 0).filter(Boolean) });
  }
  return { rows, problems };
}

function score() {
  const files = rest.filter(a => a.endsWith('.json') && path.basename(a) !== 'key.json');
  if (!files.length) { console.error('no panel JSON given'); process.exit(2); }
  const { rows, problems } = loadPanel(files);
  if (!rows.length) { console.error('no usable panel rows\n' + problems.join('\n')); process.exit(2); }
  const mean = xs => xs.reduce((x, y) => x + y, 0) / xs.length;
  const prefLive = rows.filter(r => r.prefersLive).length;
  const dEng = mean(rows.map(r => r.mLive)) - mean(rows.map(r => r.mDead));
  const contradictions = rows.filter(r => r.contradiction !== null && r.contradiction > 1.0);
  const agreement = prefLive / rows.length;
  const ent = dEng / 4;                       // engagement is 1..5, so 4 is the span

  console.log(`panel: ${rows.length} rater(s), each scored against its own blind pack\n`);
  console.log('rater                     live   dead  pref  wanted');
  for (const r of rows) {
    console.log(`${r.persona.padEnd(24)} ${r.mLive.toFixed(2)}  ${r.mDead.toFixed(2)}  ` +
      `${r.prefersLive ? 'live' : 'DEAD'}  ${r.wanted.slice(0, 46)}`);
  }
  console.log(`\npreference for live: ${prefLive}/${rows.length}   engagement gap: ${dEng >= 0 ? '+' : ''}${dEng.toFixed(2)}   ENT ${ent.toFixed(3)}   agreement ${(agreement * 100).toFixed(0)}%`);
  const boring = [...new Set(rows.flatMap(r => r.boring))].sort((a, b) => a - b);
  if (boring.length) console.log(`minutes the panel rated dead air in the live build (dead build was better): ${boring.join(', ')}`);

  const fail = [...problems];
  if (prefLive < Math.ceil(rows.length * 0.75)) fail.push(`only ${prefLive}/${rows.length} raters preferred the live build (need 75%)`);
  if (dEng < 0.75) fail.push(`engagement gap ${dEng.toFixed(2)} < 0.75 (the panel cannot feel the decision)`);
  for (const r of contradictions) fail.push(`${r.persona}: words say ${r.prefersLive ? 'live' : 'dead'} but its own series says the other (gap ${r.contradiction.toFixed(2)})`);
  if (fail.length) {
    for (const f of fail) console.log('FAIL  ' + f);
    console.log('\nVERDICT: panel INVALID -- its feedback may be reported as a failure to measure, never cited as a design reason.');
    if (has('check')) process.exit(1);
    return;
  }
  console.log('\nVERDICT: panel VALID -- it separates the build from the choice-poor control, in the direction the design predicts.');
  if (has('check')) return;
}

// Two synthetic panels: a yes-man that calls both builds great and prefers the
// dead one, and a reader that reports what the transcripts actually show. The
// gate must reject the first and accept the second, or it is decoration.
function selftest() {
  const dir = path.join(HERE, 'audience', '_selftest');
  const mkPack = flip => {
    const pd = path.join(dir, flip ? 'p2' : 'p1');
    execFileSync('node', [process.argv[1], 'pack', '--out', pd, '--minutes', '3', ...(flip ? ['--flip'] : [])], { stdio: 'pipe' });
    return pd;
  };
  const call = (pd, files) => {
    try { execFileSync('node', [process.argv[1], 'score', '--pack', pd, '--check', ...files], { stdio: 'pipe' }); return 0; }
    catch (e) { return e.status; }
  };
  const write = (pd, key, name, mkl, mkd, pref) => {
    const a = key.live === 'a' ? mkl : mkd, b = key.live === 'a' ? mkd : mkl;
    const f = path.join(pd, `panel-${name}.json`);
    fs.writeFileSync(f, JSON.stringify({ persona: name, a: { engagement: a }, b: { engagement: b },
      more_fun: pref, wanted: 'a next thing to buy', why: 'synthetic' }));
    return f;
  };
  let goodCode = 0, badCode = 1;
  for (const flip of [false, true]) {
    const pd = mkPack(flip);
    const key = JSON.parse(fs.readFileSync(path.join(pd, 'key.json'), 'utf8'));
    const good = [1, 2].map(n => write(pd, key, `reader${n}`, [3, 4, 4], [2, 2, 2], key.live));
    const bad = [1, 2].map(n => write(pd, key, `yesman${n}`, [5, 5, 5], [5, 5, 5], key.dead));
    goodCode = call(pd, good) || goodCode;
    badCode = call(pd, bad) && badCode;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`selftest: reader panel exit ${goodCode} (want 0), yes-man panel exit ${badCode} (want 1)`);
  if (goodCode !== 0 || badCode !== 1) { console.log('FAIL  the gate does not discriminate'); process.exit(1); }
  console.log('PASS  the gate accepts a panel that reads and rejects one that flatters');
}

if (cmd === 'pack') pack();
else if (cmd === 'score') score();
else if (cmd === 'selftest') selftest();
else { console.error('usage: audience.mjs pack|score|selftest (see the header)'); process.exit(2); }
