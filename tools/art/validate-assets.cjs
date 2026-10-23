/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
const fail = (message) => { throw new Error(message); };
const expect = (condition, message) => { if (!condition) fail(message); };
const keyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pathPattern = /^assets\/[a-z0-9/.-]+\.png$/;

function exactCaseExists(relativePath) {
  let current = root;
  for (const segment of relativePath.split('/')) {
    const entries = fs.readdirSync(current);
    if (!entries.includes(segment)) return false;
    current = path.join(current, segment);
  }
  return fs.existsSync(current);
}

async function validateImage(asset, palettes) {
  expect(keyPattern.test(asset.key), `${asset.key}: invalid key`);
  expect(pathPattern.test(asset.path), `${asset.key}: invalid PNG path`);
  expect(asset.license === 'original', `${asset.key}: license must be original`);
  expect(exactCaseExists(asset.path), `${asset.key}: missing or case-mismatched file`);
  expect(palettes.has(asset.paletteId), `${asset.key}: unknown palette ${asset.paletteId}`);
  const file = path.join(root, asset.path);
  const metadata = await sharp(file).metadata();
  expect(metadata.width === asset.width && metadata.height === asset.height, `${asset.key}: dimensions differ from manifest`);
  expect(metadata.hasAlpha && metadata.channels === 4, `${asset.key}: must be RGBA`);
  expect(asset.width % asset.frameWidth === 0 && asset.height % asset.frameHeight === 0, `${asset.key}: incomplete frame grid`);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const approved = new Set(manifest.palette.find((entry) => entry.id === asset.paletteId).colors.map((hex) => hex.slice(1)));
  let transparent = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = data[i + 3];
    expect(alpha === 0 || alpha === 255, `${asset.key}: non-binary alpha at pixel ${i / 4}`);
    if (alpha === 0) { transparent += 1; continue; }
    const rgb = [data[i], data[i + 1], data[i + 2]].map((value) => value.toString(16).padStart(2, '0')).join('');
    expect(approved.has(rgb), `${asset.key}: color #${rgb} is outside ${asset.paletteId}`);
  }
  expect(transparent > 0, `${asset.key}: lacks transparent pixels`);
  const frameCount = (asset.width / asset.frameWidth) * (asset.height / asset.frameHeight);
  for (const animation of asset.animations || []) {
    expect(animation.frameRate > 0, `${asset.key}/${animation.key}: invalid frame rate`);
    expect(animation.frames.every((frame) => Number.isInteger(frame) && frame >= 0 && frame < frameCount), `${asset.key}/${animation.key}: frame out of range`);
  }
}

async function main() {
  expect(manifest.schemaVersion === 1, 'schemaVersion must be 1');
  for (const field of ['palette', 'images', 'audio', 'maps']) expect(Array.isArray(manifest[field]), `${field} must be an array`);
  const paletteIds = manifest.palette.map((entry) => entry.id);
  expect(['ui', 'cemetery', 'dungeon', 'inferno'].every((id) => paletteIds.includes(id)), 'fixed palettes missing');
  const keys = manifest.images.map((asset) => asset.key);
  expect(new Set(keys).size === keys.length, 'duplicate image key');
  const palettes = new Set(paletteIds);
  for (const asset of manifest.images) await validateImage(asset, palettes);
  const tile = manifest.images.find((asset) => asset.key === 'tileset-cemetery');
  const { data } = await sharp(path.join(root, tile.path)).extract({ left: 0, top: 0, width: 16, height: 16 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(data.every((value, index) => index % 4 !== 3 || value === 0), 'tileset-cemetery: tile 0 is not empty');
  for (const preview of ['player-soul-guide-contact-sheet.png', 'enemy-zombie-contact-sheet.png', 'enemy-bat-contact-sheet.png', 'boss-graveyard-guardian-contact-sheet.png', 'cemetery-vertical-slice-contact-sheet.png']) {
    expect(exactCaseExists(`docs/art/previews/${preview}`), `missing preview ${preview}`);
  }
  console.log(`Validated ${manifest.images.length} images, ${manifest.palette.length} palettes, exact paths, grids, palette pixels, and transparency.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
