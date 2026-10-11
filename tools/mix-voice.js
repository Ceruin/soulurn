// Sentence-mixes new urn lines out of his existing clips (cut at the pauses, then joined),
// writing one mp3 per mix to assets/voice/mix/ and the list to assets/mix-lines.js.
// Usage: node tools/mix-voice.js           build every mix
//        node tools/mix-voice.js --probe   print the speech segments found in each source clip
// Needs ffmpeg on PATH.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VOICE = path.join(__dirname, '..', 'assets', 'voice');
const OUT = path.join(VOICE, 'mix');
const PREFIX = 'Spirit_jar_';
const SILENCE = 'silencedetect=noise=-30dB:d=0.09';
const LEAD_IN = 0.015;
const TAIL = 0.04;
const GAP = 0.07;

// Each part is a source clip plus what to keep of it:
//   seg: a speech segment index, or [first, last]; negative indexes count from the end
//   from/to: explicit seconds, for words with no clean pause around them (found with a finer silence probe)
//   neither: the whole clip
// blend (seconds) crossfades two parts into one word instead of leaving a gap between them.
const RECIPES = [
  { id: 'ugh', g: 'mix_hurt', t: 'Ughhh.', parts: [{ f: 'idol_waiting_on_bridge_11', seg: 0 }] },
  { id: 'ow', g: 'mix_hurt', t: 'Ow!', blend: 0.07, parts: [{ f: 'idol_picked_up_on_bridge_07', from: 0, to: 0.3 }, { f: 'idol_waiting_on_bridge_19', from: 0.42, to: 0.84 }] },
  { id: 'oh', g: 'mix_hurt', t: 'Oh!', parts: [{ f: 'koth_give_up_01', from: 0, to: 0.5 }] },
  { id: 'hey', g: 'mix_hurt', t: 'Hey!', parts: [{ f: 'idol_dropped_10', seg: 0 }] },
  { id: 'ah', g: 'mix_hurt', t: 'Ah!', parts: [{ f: 'idol_picked_up_on_bridge_07', from: 0, to: 0.78 }] },
  { id: 'hmph', g: 'mix_hurt', t: 'Hmph!', parts: [{ f: 'idol_picked_up_on_street_07', from: 0, to: 0.57 }] },
  { id: 'hey_stop', g: 'mix_hurt', t: 'Hey! Stop shooting me!', parts: [{ f: 'idol_dropped_10', seg: 0 }, { f: 'idol_holder_takes_big_damage_05', from: 0.04, to: 0.83 }] },
  { id: 'ugh_typical', g: 'mix_hurt', t: 'Ughhh. Typical...', parts: [{ f: 'idol_waiting_on_bridge_11', seg: 0 }, { f: 'idol_dropped_03' }] },
  { id: 'please_stop', g: 'mix_hurt', t: 'Please. Stop shooting me.', parts: [{ f: 'idol_picked_up_on_street_02', from: 0, to: 0.5 }, { f: 'idol_holder_takes_big_damage_05', from: 0.04, to: 0.83 }] },
  { id: 'hey_what', g: 'mix_hurt', t: 'Hey! What are you doing?!', parts: [{ f: 'idol_dropped_10', seg: 0 }, { f: 'idol_dropped_04' }] },
  { id: 'oh_dear_careful', g: 'mix_hurt', t: 'Oh dear! Be careful!', parts: [{ f: 'idol_holder_takes_big_damage_03' }, { f: 'idol_holder_takes_big_damage_01', from: 0, to: 0.87 }] },
  { id: 'careful_delicate', g: 'mix_hurt', t: 'Be careful! I\'m delicate.', parts: [{ f: 'idol_holder_takes_big_damage_01', from: 0, to: 0.87 }, { f: 'holder_stalls_werewolf_02', seg: -1 }] },
  { id: 'ah_unpleasant', g: 'mix_hurt', t: 'Ah! Well, that was unpleasant.', parts: [{ f: 'idol_picked_up_on_bridge_07', from: 0, to: 0.78 }, { f: 'idol_holder_gets_stunned_05' }] },
  { id: 'thats_it_give_up', g: 'mix_break', t: 'That\'s it. I give up!', parts: [{ f: 'koth_give_up_09', seg: 0 }, { f: 'koth_give_up_02' }] },
  { id: 'oh_dear_times_up', g: 'mix_break', t: 'Oh dear! Time\'s up!', parts: [{ f: 'idol_holder_takes_big_damage_03' }, { f: 'koth_give_up_08' }] },
  { id: 'ugh_leaving', g: 'mix_break', t: 'Ughhh. You know what? I\'m leaving.', parts: [{ f: 'idol_waiting_on_bridge_11', seg: 0 }, { f: 'koth_give_up_03', seg: 0 }, { f: 'koth_give_up_09', seg: -1 }] },
  { id: 'hey_still_full', g: 'mix_break', t: 'Hey! I give up!', parts: [{ f: 'idol_dropped_10', seg: 0 }, { f: 'koth_give_up_02' }] }
];

function getSourcePath(name) {
  return path.join(VOICE, PREFIX + name + '.mp3');
}

// Speech segments are whatever lies between the silences ffmpeg detects.
function findSegments(name) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-i', getSourcePath(name), '-af', SILENCE, '-f', 'null', '-'], { encoding: 'utf8' });
  const log = run.stderr || '';
  const duration = log.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!duration) throw new Error('cannot read ' + name);
  const total = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  const segments = [];
  let cursor = 0;
  const pattern = /silence_(start|end): ([\d.]+)/g;
  let match;
  while ((match = pattern.exec(log)) !== null) {
    const time = Number(match[2]);
    if (match[1] === 'start') {
      if (time - cursor > 0.05) segments.push([cursor, time]);
    } else {
      cursor = time;
    }
  }
  if (total - cursor > 0.05) segments.push([cursor, total]);
  return { total: total, segments: segments };
}

function resolvePart(part) {
  if (part.to !== undefined) return [part.from, part.to];
  const info = findSegments(part.f);
  if (part.seg === undefined) return [0, info.total];
  const span = Array.isArray(part.seg) ? part.seg : [part.seg, part.seg];
  const pickSegment = function (index) {
    const segment = info.segments[index < 0 ? info.segments.length + index : index];
    if (!segment) throw new Error(part.f + ' has no segment ' + index + ' (found ' + info.segments.length + ')');
    return segment;
  };
  return [Math.max(0, pickSegment(span[0])[0] - LEAD_IN), Math.min(info.total, pickSegment(span[1])[1] + TAIL)];
}

function buildMix(recipe) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  const filters = [];
  let length = 0;
  recipe.parts.forEach(function (part, index) {
    const cut = resolvePart(part);
    const span = cut[1] - cut[0];
    length += span + GAP;
    args.push('-i', getSourcePath(part.f));
    filters.push('[' + index + ':a]atrim=start=' + cut[0].toFixed(3) + ':end=' + cut[1].toFixed(3) +
      ',asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st=' + Math.max(0, span - 0.03).toFixed(3) + ':d=0.03' +
      (recipe.blend ? '' : ',apad=pad_dur=' + GAP) + '[p' + index + ']');
  });
  const inputs = recipe.parts.map(function (part, index) { return '[p' + index + ']'; }).join('');
  if (recipe.blend) filters.push(inputs + 'acrossfade=d=' + recipe.blend + ':c1=tri:c2=tri[out]');
  else filters.push(inputs + 'concat=n=' + recipe.parts.length + ':v=0:a=1[out]');
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '44100', '-ac', '1', '-q:a', '4',
    path.join(OUT, recipe.id + '.mp3'));
  const run = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(recipe.id + ': ' + run.stderr);
  return length;
}

function probe() {
  const names = {};
  RECIPES.forEach(function (recipe) { recipe.parts.forEach(function (part) { names[part.f] = true; }); });
  Object.keys(names).forEach(function (name) {
    const info = findSegments(name);
    console.log(name + ' (' + info.total.toFixed(2) + 's): ' +
      info.segments.map(function (s) { return s[0].toFixed(2) + '-' + s[1].toFixed(2); }).join('  '));
  });
}

function main() {
  if (process.argv.includes('--probe')) return probe();
  fs.mkdirSync(OUT, { recursive: true });
  const lines = RECIPES.map(function (recipe) {
    const length = buildMix(recipe);
    console.log(recipe.id + '.mp3  ' + length.toFixed(2) + 's  ' + recipe.t);
    return { f: 'mix/' + recipe.id + '.mp3', g: recipe.g, t: recipe.t };
  });
  fs.writeFileSync(path.join(VOICE, '..', 'mix-lines.js'), 'window.URN_MIXES = ' + JSON.stringify(lines) + ';\n');
  console.log(lines.length + ' mixes written');
}

main();
