const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
const manifestSchema = JSON.parse(
  fs.readFileSync(path.join(root, 'docs/spec/asset-manifest.schema.json'), 'utf8'),
);
const fail = (message) => {
  throw new Error(message);
};
const expect = (condition, message) => {
  if (!condition) fail(message);
};
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

function schemaErrors(value, schema, schemaRoot = manifestSchema, location = '$') {
  if (schema.$ref) {
    const target = schema.$ref
      .slice(2)
      .split('/')
      .reduce((node, segment) => node[segment], schemaRoot);
    return schemaErrors(value, target, schemaRoot, location);
  }
  const errors = [];
  const add = (message) => errors.push(`${location}: ${message}`);
  if (Object.hasOwn(schema, 'const') && value !== schema.const)
    add(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((candidate) => candidate === value))
    add(`must be one of ${schema.enum.join(', ')}`);
  if (schema.type) {
    const valid =
      schema.type === 'array'
        ? Array.isArray(value)
        : schema.type === 'object'
          ? value !== null && typeof value === 'object' && !Array.isArray(value)
          : schema.type === 'integer'
            ? Number.isInteger(value)
            : schema.type === 'number'
              ? typeof value === 'number' && Number.isFinite(value)
              : typeof value === schema.type;
    if (!valid) {
      add(`must be ${schema.type}`);
      return errors;
    }
  }
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value))
    add(`does not match ${schema.pattern}`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) add(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) add(`must be <= ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
      add(`must be > ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      add(`must contain at least ${schema.minItems} items`);
    if (schema.items)
      value.forEach((item, index) =>
        errors.push(...schemaErrors(item, schema.items, schemaRoot, `${location}[${index}]`)),
      );
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const property of schema.required || [])
      if (!Object.hasOwn(value, property)) errors.push(`${location}.${property}: is required`);
    for (const [property, child] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, property))
        errors.push(...schemaErrors(value[property], child, schemaRoot, `${location}.${property}`));
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const property of Object.keys(value))
        if (!allowed.has(property))
          errors.push(`${location}.${property}: additional property is forbidden`);
    }
  }
  for (const child of schema.allOf || []) {
    if (child.if) {
      if (schemaErrors(value, child.if, schemaRoot, location).length === 0 && child.then)
        errors.push(...schemaErrors(value, child.then, schemaRoot, location));
    } else errors.push(...schemaErrors(value, child, schemaRoot, location));
  }
  return errors;
}

function pngChunkTypes(buffer) {
  const types = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    types.push(buffer.toString('ascii', offset + 4, offset + 8));
    offset += length + 12;
  }
  return types;
}

async function rawFrame(file, asset, frameIndex) {
  const columns = asset.width / asset.frameWidth;
  const left = (frameIndex % columns) * asset.frameWidth;
  const top = Math.floor(frameIndex / columns) * asset.frameHeight;
  return sharp(file)
    .extract({ left, top, width: asset.frameWidth, height: asset.frameHeight })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

async function validateDirectionalSemantics(file, asset) {
  const columns = asset.width / asset.frameWidth;
  if (
    ![
      'player-soul-guide',
      'enemy-zombie',
      'enemy-bat',
      'boss-graveyard-guardian',
      'enemy-skeleton-archer',
      'enemy-splitting-slime',
      'enemy-small-slime',
      'boss-skeleton-warden',
      'enemy-swift-demon',
      'enemy-flame-skull',
      'boss-flame-demon',
    ].includes(asset.key)
  )
    return;
  for (let row = 0; row < 8; row += 1) {
    const start = row * columns;
    const idle = await rawFrame(file, asset, start);
    const walks = await Promise.all(
      [1, 2, 3, 4].map((column) => rawFrame(file, asset, start + column)),
    );
    expect(
      new Set(walks.map((frame) => frame.toString('base64'))).size === 4,
      `${asset.key} row ${row}: walk frames must all be visibly distinct`,
    );
    expect(
      walks.every((frame) => !frame.equals(idle)),
      `${asset.key} row ${row}: walk frame matches idle`,
    );
    const hurt = await rawFrame(file, asset, start + 5);
    expect(!hurt.equals(idle), `${asset.key} row ${row}: hurt frame matches idle`);
    if (columns === 9) {
      const attack0 = await rawFrame(file, asset, start + 6);
      const attack1 = await rawFrame(file, asset, start + 7);
      const death = await rawFrame(file, asset, start + 8);
      expect(
        !attack0.equals(idle) && !attack1.equals(idle) && !attack0.equals(attack1),
        `${asset.key} row ${row}: attack silhouette is not distinct`,
      );
      expect(
        !death.equals(idle) && !death.equals(hurt) && !death.equals(attack1),
        `${asset.key} row ${row}: death collapse is not distinct`,
      );
    }
  }
}

async function validateImage(asset, palettes) {
  expect(keyPattern.test(asset.key), `${asset.key}: invalid key`);
  expect(pathPattern.test(asset.path), `${asset.key}: invalid PNG path`);
  expect(asset.license === 'original', `${asset.key}: license must be original`);
  expect(exactCaseExists(asset.path), `${asset.key}: missing or case-mismatched file`);
  expect(palettes.has(asset.paletteId), `${asset.key}: unknown palette ${asset.paletteId}`);
  const file = path.join(root, asset.path);
  const png = fs.readFileSync(file);
  expect(
    !pngChunkTypes(png).includes('pHYs'),
    `${asset.key}: PNG must not contain pHYs scaling metadata`,
  );
  const metadata = await sharp(file).metadata();
  expect(
    metadata.width === asset.width && metadata.height === asset.height,
    `${asset.key}: dimensions differ from manifest`,
  );
  expect(metadata.hasAlpha && metadata.channels === 4, `${asset.key}: must be RGBA`);
  expect(
    asset.width % asset.frameWidth === 0 && asset.height % asset.frameHeight === 0,
    `${asset.key}: incomplete frame grid`,
  );
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const approved = new Set(
    manifest.palette
      .find((entry) => entry.id === asset.paletteId)
      .colors.map((hex) => hex.slice(1)),
  );
  let transparent = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = data[i + 3];
    expect(alpha === 0 || alpha === 255, `${asset.key}: non-binary alpha at pixel ${i / 4}`);
    if (alpha === 0) {
      transparent += 1;
      continue;
    }
    const rgb = [data[i], data[i + 1], data[i + 2]]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    expect(approved.has(rgb), `${asset.key}: color #${rgb} is outside ${asset.paletteId}`);
  }
  expect(transparent > 0, `${asset.key}: lacks transparent pixels`);
  const frameCount = (asset.width / asset.frameWidth) * (asset.height / asset.frameHeight);
  for (const animation of asset.animations || []) {
    expect(animation.frameRate > 0, `${asset.key}/${animation.key}: invalid frame rate`);
    expect(
      animation.frames.every(
        (frame) => Number.isInteger(frame) && frame >= 0 && frame < frameCount,
      ),
      `${asset.key}/${animation.key}: frame out of range`,
    );
  }
  await validateDirectionalSemantics(file, asset);
}

async function main() {
  const errors = schemaErrors(manifest, manifestSchema);
  expect(errors.length === 0, `manifest schema validation failed:\n${errors.join('\n')}`);
  expect(manifest.schemaVersion === 1, 'schemaVersion must be 1');
  for (const field of ['palette', 'images', 'audio', 'maps'])
    expect(Array.isArray(manifest[field]), `${field} must be an array`);
  const paletteIds = manifest.palette.map((entry) => entry.id);
  expect(
    ['ui', 'cemetery', 'dungeon', 'inferno'].every((id) => paletteIds.includes(id)),
    'fixed palettes missing',
  );
  const keys = manifest.images.map((asset) => asset.key);
  expect(new Set(keys).size === keys.length, 'duplicate image key');
  const palettes = new Set(paletteIds);
  for (const asset of manifest.images) await validateImage(asset, palettes);
  for (const tileKey of ['tileset-cemetery', 'tileset-dungeon', 'tileset-inferno']) {
    const tile = manifest.images.find((asset) => asset.key === tileKey);
    expect(tile, `missing ${tileKey}`);
    const { data } = await sharp(path.join(root, tile.path))
      .extract({ left: 0, top: 0, width: 16, height: 16 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(
      data.every((value, index) => index % 4 !== 3 || value === 0),
      `${tileKey}: tile 0 is not empty`,
    );
  }
  const dungeonMapEntry = manifest.maps.find((entry) => entry.key === 'map-dungeon');
  expect(dungeonMapEntry, 'missing map-dungeon manifest entry');
  expect(exactCaseExists(dungeonMapEntry.path), 'missing or case-mismatched map-dungeon file');
  const dungeonMap = JSON.parse(fs.readFileSync(path.join(root, dungeonMapEntry.path), 'utf8'));
  expect(dungeonMap.width === 120 && dungeonMap.height === 67, 'map-dungeon: invalid bounds');
  expect(
    dungeonMap.width * dungeonMap.tilewidth === 1920 &&
      dungeonMap.height * dungeonMap.tileheight === 1072,
    'map-dungeon: dimensions do not match world bounds',
  );
  const mapLayers = new Map(dungeonMap.layers.map((layer) => [layer.name, layer]));
  for (const layer of dungeonMapEntry.layers) {
    expect(mapLayers.has(layer.name), `map-dungeon: missing ${layer.name} layer`);
  }
  expect(
    mapLayers.get('ground').data.length === dungeonMap.width * dungeonMap.height,
    'map-dungeon: incomplete ground grid',
  );
  expect(mapLayers.get('obstacles').objects.length > 4, 'map-dungeon: obstacles are incomplete');
  const infernoMapEntry = manifest.maps.find((entry) => entry.key === 'map-inferno');
  expect(infernoMapEntry, 'missing map-inferno manifest entry');
  expect(exactCaseExists(infernoMapEntry.path), 'missing or case-mismatched map-inferno file');
  const infernoMap = JSON.parse(fs.readFileSync(path.join(root, infernoMapEntry.path), 'utf8'));
  expect(infernoMap.width === 120 && infernoMap.height === 67, 'map-inferno: invalid bounds');
  expect(
    infernoMap.width * infernoMap.tilewidth === 1920 &&
      infernoMap.height * infernoMap.tileheight === 1072,
    'map-inferno: dimensions do not match world bounds',
  );
  const infernoLayers = new Map(infernoMap.layers.map((layer) => [layer.name, layer]));
  for (const layer of infernoMapEntry.layers) {
    expect(infernoLayers.has(layer.name), `map-inferno: missing ${layer.name} layer`);
  }
  expect(
    infernoLayers.get('ground').data.length === infernoMap.width * infernoMap.height,
    'map-inferno: incomplete ground grid',
  );
  const fixedHazards = infernoLayers.get('hazards').objects;
  expect(fixedHazards.length === 4, 'map-inferno: expected four fixed lava zones');
  for (const hazard of fixedHazards) {
    const properties = new Map(
      hazard.properties.map((property) => [property.name, property.value]),
    );
    expect(properties.get('hazardId') === hazard.name, `${hazard.name}: hazardId must be stable`);
    expect(properties.get('damage') > 0, `${hazard.name}: damage must be positive`);
    expect(properties.get('tickMs') > 0, `${hazard.name}: tickMs must be positive`);
  }
  for (const preview of [
    'player-soul-guide-contact-sheet.png',
    'enemy-zombie-contact-sheet.png',
    'enemy-bat-contact-sheet.png',
    'boss-graveyard-guardian-contact-sheet.png',
    'cemetery-vertical-slice-contact-sheet.png',
    'enemy-skeleton-archer-contact-sheet.png',
    'enemy-splitting-slime-contact-sheet.png',
    'enemy-small-slime-contact-sheet.png',
    'boss-skeleton-warden-contact-sheet.png',
    'dungeon-vertical-slice-contact-sheet.png',
    'map-dungeon-preview.png',
    'enemy-swift-demon-contact-sheet.png',
    'enemy-flame-skull-contact-sheet.png',
    'boss-flame-demon-contact-sheet.png',
    'tileset-inferno-contact-sheet.png',
    'vfx-lava-contact-sheet.png',
    'inferno-vertical-slice-contact-sheet.png',
    'map-inferno-preview.png',
  ]) {
    expect(exactCaseExists(`docs/art/previews/${preview}`), `missing preview ${preview}`);
  }
  console.log(
    `Validated schema, ${manifest.images.length} images, ${manifest.palette.length} palettes, exact paths, grids, semantic frames, palette pixels, binary alpha, and PNG metadata.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
