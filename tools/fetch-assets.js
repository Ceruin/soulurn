// Downloads the Soul Urn voice lines, soul icons and urn music from deadlock.wiki
// into assets/, and writes assets/lines.js (file + transcript per voice line).
// Usage: node tools/fetch-assets.js
'use strict';

const fs = require('fs');
const path = require('path');

const WIKI = 'https://deadlock.wiki';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (soul-urn fan page asset fetch)' };
const ASSETS = path.join(__dirname, '..', 'assets');
const PARALLEL = 6;

const IMAGES = [
  'Soul_Urn_Render.png', 'Soul_Urn.png', 'Soul_Urn_favored.png',
  'Souls_icon.png', 'Souls_icon_black.png', 'Souls.png',
  'Soul_orbs_spawn.png', 'Soul_released.png'
];
const MUSIC = ['Music_idol_carry_lp_141bpm.mp3', 'Music_idol_announce.mp3'];

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  return res.json();
}

async function listVoiceFiles() {
  const data = await getJson(WIKI + '/api.php?action=query&list=allimages&aiprefix=Spirit_jar&ailimit=500&format=json');
  return data.query.allimages.map(function (i) { return { name: i.name, url: i.url }; });
}

async function resolveUrls(names) {
  const titles = names.map(function (n) { return 'File:' + n; }).join('|');
  const data = await getJson(WIKI + '/api.php?action=query&prop=imageinfo&iiprop=url&format=json&titles=' + encodeURIComponent(titles));
  return Object.values(data.query.pages)
    .filter(function (p) { return p.imageinfo; })
    .map(function (p) { return { name: p.title.replace(/^File:/, '').replace(/ /g, '_'), url: p.imageinfo[0].url }; });
}

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, function (m, code) { return String.fromCharCode(Number(code)); })
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

async function loadTranscripts() {
  const res = await fetch(WIKI + '/Soul_Urn/Voice_lines', { headers: HEADERS });
  const html = await res.text();
  const transcripts = {};
  const pattern = /<span class="audio-text"><a href="[^"]*\/([^"\/]+\.mp3)"[^>]*>([\s\S]*?)<\/a><\/span>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    transcripts[decodeURIComponent(match[1])] = text;
  }
  return transcripts;
}

async function download(item, dir) {
  const target = path.join(dir, item.name);
  if (fs.existsSync(target)) return;
  const res = await fetch(item.url, { headers: HEADERS });
  if (!res.ok) throw new Error(res.status + ' ' + item.url);
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
}

async function downloadAll(items, dir) {
  fs.mkdirSync(dir, { recursive: true });
  let next = 0;
  let failed = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      try {
        await download(item, dir);
      } catch (err) {
        failed++;
        console.error('FAILED ' + item.name + ': ' + err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(path.basename(dir) + ': ' + (items.length - failed) + '/' + items.length);
  return failed;
}

async function main() {
  const voice = await listVoiceFiles();
  const transcripts = await loadTranscripts();
  let failed = 0;
  failed += await downloadAll(voice, path.join(ASSETS, 'voice'));
  failed += await downloadAll(await resolveUrls(IMAGES), path.join(ASSETS, 'img'));
  failed += await downloadAll(await resolveUrls(MUSIC), path.join(ASSETS, 'music'));

  const lines = voice.map(function (v) {
    return {
      f: v.name,
      g: v.name.replace(/^Spirit_jar_/, '').replace(/_\d+\.mp3$/, ''),
      t: transcripts[v.name] || ''
    };
  });
  const missing = lines.filter(function (l) { return !l.t; }).length;
  fs.writeFileSync(path.join(ASSETS, 'lines.js'), 'window.URN_LINES = ' + JSON.stringify(lines, null, 0) + ';\n');
  console.log('lines.js: ' + lines.length + ' lines, ' + missing + ' without transcript');
  process.exit(failed ? 1 : 0);
}

main();
