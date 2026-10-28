const fs = require('node:fs/promises');
const path = require('node:path');
const prettier = require('prettier');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const imageDir = path.join(root, 'assets/images');
const mapDir = path.join(root, 'assets/maps');
const previewDir = path.join(root, 'docs/art/previews');
const palette = [
  '#0d1020',
  '#22263a',
  '#3c4058',
  '#62657a',
  '#9693a5',
  '#c9c0b0',
  '#584780',
  '#8e70ba',
  '#55c9d3',
];

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

function stripPngChunks(buffer) {
  const chunks = [buffer.subarray(0, 8)];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (type !== 'pHYs') chunks.push(buffer.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}

async function palettePng(input, width, height) {
  const { data } = await sharp(input)
    .resize(width, height, { kernel: sharp.kernel.nearest })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors = palette.map(rgb);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 96) {
      data.fill(0, index, index + 4);
      continue;
    }
    let selected = colors[0];
    let distance = Number.POSITIVE_INFINITY;
    for (const candidate of colors) {
      const current =
        (data[index] - candidate[0]) ** 2 +
        (data[index + 1] - candidate[1]) ** 2 +
        (data[index + 2] - candidate[2]) ** 2;
      if (current < distance) {
        distance = current;
        selected = candidate;
      }
    }
    data[index] = selected[0];
    data[index + 1] = selected[1];
    data[index + 2] = selected[2];
    data[index + 3] = 255;
  }
  return stripPngChunks(
    await sharp(data, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer(),
  );
}

function rect(x, y, width, height, fill) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;
}

function characterSvg(kind, width, height, direction, frame) {
  const dx = [1, 1, 0, -1, -1, -1, 0, 1][direction];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1][direction];
  const bob = [0, -1, 0, -1, 0, 0][frame];
  const stride = [-1, 1, -2, 2][Math.max(0, frame - 1)] ?? 0;
  const hurt = frame === 5;
  const bone = hurt ? palette[8] : palette[5];
  const shade = hurt ? palette[6] : palette[4];
  const dark = palette[1];
  const violet = palette[7];
  const cyan = palette[8];
  const pieces = [];
  if (kind === 'splitting-slime' || kind === 'small-slime') {
    const small = kind === 'small-slime';
    const w = small ? 14 : 22;
    const h = small ? 9 : 14;
    const x = Math.round((width - w) / 2) + (frame > 0 && frame < 5 ? stride : 0);
    const y = height - h - (small ? 5 : 4) + bob;
    pieces.push(rect(x + 2, y, w - 4, 2, violet));
    pieces.push(rect(x, y + 2, w, h - 4, hurt ? cyan : palette[6]));
    pieces.push(rect(x + 3, y + h - 2, w - 6, 2, dark));
    pieces.push(rect(x + Math.round(w * 0.3), y + 5, 2, 2, cyan));
    pieces.push(rect(x + Math.round(w * 0.68), y + 5, 2, 2, cyan));
    if (!small) pieces.push(rect(x + 7 + dx * 2, y + 9 + dy, 8, 2, shade));
  } else {
    const boss = kind === 'skeleton-warden';
    const scale = boss ? 1.45 : 1;
    const center = Math.round(width / 2) + dx * 2;
    const headW = Math.round(10 * scale);
    const headH = Math.round(9 * scale);
    const headX = center - Math.round(headW / 2);
    const headY = Math.round(height * (boss ? 0.18 : 0.24)) + bob;
    pieces.push(rect(headX, headY, headW, headH, bone));
    pieces.push(rect(headX + 2, headY + 3, 2, 2, cyan));
    pieces.push(rect(headX + headW - 4, headY + 3, 2, 2, cyan));
    pieces.push(
      rect(
        center - Math.round(5 * scale),
        headY + headH,
        Math.round(10 * scale),
        Math.round(10 * scale),
        shade,
      ),
    );
    pieces.push(rect(center - 2, headY + headH + 2, 4, Math.round(9 * scale), dark));
    const footY = headY + headH + Math.round(10 * scale);
    pieces.push(rect(center - 6 - stride, footY, 4, Math.round(7 * scale), bone));
    pieces.push(rect(center + 2 + stride, footY, 4, Math.round(7 * scale), bone));
    const side = dx < 0 ? -1 : 1;
    const bowX = center + side * Math.round(9 * scale);
    pieces.push(rect(bowX, headY + 4, 2, Math.round(15 * scale), violet));
    pieces.push(rect(bowX - side * 3, headY + 2, 3, 2, cyan));
    pieces.push(rect(bowX - side * 3, headY + Math.round(17 * scale), 3, 2, cyan));
    if (boss) {
      pieces.push(rect(center - 11, headY - 5, 22, 3, violet));
      pieces.push(rect(center - 13, headY + 12, 5, 15, palette[6]));
      pieces.push(rect(center + 8, headY + 12, 5, 15, palette[6]));
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" shape-rendering="crispEdges">${pieces.join('')}</svg>`,
  );
}

async function characterSheet(kind, frameWidth, frameHeight) {
  const layers = [];
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const frame = await palettePng(
        characterSvg(kind, frameWidth, frameHeight, row, column),
        frameWidth,
        frameHeight,
      );
      layers.push({ input: frame, left: column * frameWidth, top: row * frameHeight });
    }
  }
  return palettePng(
    await sharp({
      create: {
        width: frameWidth * 6,
        height: frameHeight * 8,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(layers)
      .png()
      .toBuffer(),
    frameWidth * 6,
    frameHeight * 8,
  );
}

async function dungeonTileset() {
  const parts = [];
  for (let tile = 1; tile < 24; tile += 1) {
    const x = (tile % 8) * 16;
    const y = Math.floor(tile / 8) * 16;
    const base = tile < 8 ? palette[1] : tile < 16 ? palette[2] : palette[3];
    parts.push(rect(x, y, 16, 16, base));
    parts.push(rect(x, y, 16, 2, tile % 3 === 0 ? palette[7] : palette[4]));
    parts.push(rect(x + ((tile * 3) % 11), y + 5, 2, 8, palette[0]));
    if (tile % 2 === 0) parts.push(rect(x + 3, y + 11, 9, 2, palette[6]));
    if (tile % 5 === 0) parts.push(rect(x + 6, y + 4, 4, 4, palette[8]));
  }
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="48" shape-rendering="crispEdges">${parts.join('')}</svg>`,
  );
  return palettePng(svg, 128, 48);
}

function directionalAnimations() {
  const directions = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
  return directions.flatMap((direction, row) => {
    const start = row * 6;
    return [
      { key: `idle-${direction}`, frames: [start], frameRate: 1, repeat: -1, direction },
      {
        key: `walk-${direction}`,
        frames: [start + 1, start + 2, start + 3, start + 4],
        frameRate: 8,
        repeat: -1,
        direction,
      },
      { key: `hurt-${direction}`, frames: [start + 5], frameRate: 8, repeat: 0, direction },
    ];
  });
}

function imageEntry(key, width, height, frameWidth, frameHeight, radius, anchorY = 0.82) {
  return {
    key,
    path: `assets/images/${key}.png`,
    kind: 'sprite',
    license: 'original',
    width,
    height,
    frameWidth,
    frameHeight,
    anchor: { x: 0.5, y: anchorY },
    paletteId: 'dungeon',
    animations: directionalAnimations(),
    collision: { shape: 'circle', offsetX: 0, offsetY: -4, radius },
  };
}

async function writeMap() {
  const width = 120;
  const height = 67;
  const ground = Array.from(
    { length: width * height },
    (_, index) => 1 + ((index + Math.floor(index / width)) % 4),
  );
  const decorations = Array.from({ length: width * height }, () => 0);
  const obstacles = [
    { id: 1, name: 'north-wall', x: 0, y: 0, width: 1920, height: 32 },
    { id: 2, name: 'south-wall', x: 0, y: 1040, width: 1920, height: 32 },
    { id: 3, name: 'west-wall', x: 0, y: 32, width: 32, height: 1008 },
    { id: 4, name: 'east-wall', x: 1888, y: 32, width: 32, height: 1008 },
    { id: 5, name: 'northwest-room', x: 320, y: 208, width: 240, height: 32 },
    { id: 6, name: 'northwest-room-side', x: 320, y: 208, width: 32, height: 176 },
    { id: 7, name: 'southeast-room', x: 1360, y: 768, width: 240, height: 32 },
    { id: 8, name: 'southeast-room-side', x: 1568, y: 624, width: 32, height: 176 },
    { id: 9, name: 'center-pillar-west', x: 720, y: 432, width: 64, height: 176 },
    { id: 10, name: 'center-pillar-east', x: 1136, y: 432, width: 64, height: 176 },
  ];
  const map = {
    version: 1,
    type: 'map',
    orientation: 'orthogonal',
    width,
    height,
    tilewidth: 16,
    tileheight: 16,
    infinite: false,
    tilesets: [
      {
        firstgid: 1,
        name: 'tileset-dungeon',
        tilewidth: 16,
        tileheight: 16,
        tilecount: 4,
        columns: 4,
        image: '../images/tileset-dungeon.png',
        imagewidth: 64,
        imageheight: 16,
      },
    ],
    layers: [
      { id: 1, name: 'ground', type: 'tilelayer', width, height, data: ground },
      { id: 2, name: 'obstacles', type: 'objectgroup', objects: obstacles },
      { id: 3, name: 'hazards', type: 'objectgroup', objects: [] },
      { id: 4, name: 'decorations', type: 'tilelayer', width, height, data: decorations },
      {
        id: 5,
        name: 'spawns',
        type: 'objectgroup',
        objects: [
          { id: 101, name: 'player', type: 'spawn', x: 960, y: 536, point: true },
          { id: 102, name: 'boss', type: 'spawn', x: 960, y: 176, point: true },
        ],
      },
    ],
  };
  const target = path.join(mapDir, 'map-dungeon.json');
  await fs.mkdir(mapDir, { recursive: true });
  await fs.writeFile(
    target,
    await prettier.format(JSON.stringify(map), {
      ...(await prettier.resolveConfig(target)),
      parser: 'json',
    }),
  );
  return map;
}

async function mapPreview(map) {
  const scale = 0.5;
  const width = map.width * map.tilewidth * scale;
  const height = map.height * map.tileheight * scale;
  const obstacles = map.layers.find((layer) => layer.name === 'obstacles').objects;
  const spawns = map.layers.find((layer) => layer.name === 'spawns').objects;
  const obstacleSvg = obstacles
    .map(
      (object) =>
        `<rect x="${object.x * scale}" y="${object.y * scale}" width="${object.width * scale}" height="${object.height * scale}" fill="#62657a" stroke="#9693a5" stroke-width="2"/>`,
    )
    .join('');
  const spawnSvg = spawns
    .map(
      (spawn) =>
        `<circle cx="${spawn.x * scale}" cy="${spawn.y * scale}" r="8" fill="${spawn.name === 'player' ? '#55c9d3' : '#8e70ba'}"/><text x="${spawn.x * scale + 12}" y="${spawn.y * scale + 5}" fill="#c9c0b0" font-family="monospace" font-size="14">${spawn.name}</text>`,
    )
    .join('');
  return stripPngChunks(
    await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#22263a"/><path d="M240 0v${height}M480 0v${height}M720 0v${height}M0 134h${width}M0 268h${width}M0 402h${width}" stroke="#3c4058" stroke-width="2"/>${obstacleSvg}${spawnSvg}</svg>`,
      ),
    )
      .png()
      .toBuffer(),
  );
}

async function contactSheet(key, file, frameWidth, frameHeight) {
  const sheet = await fs.readFile(file);
  const frame = await sharp(sheet)
    .extract({ left: 0, top: 0, width: frameWidth, height: frameHeight })
    .resize(frameWidth * 4, frameHeight * 4, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="420"><rect width="920" height="420" fill="#0d1020"/><text x="24" y="32" fill="#c9c0b0" font-family="monospace" font-size="20">${key}</text><text x="24" y="55" fill="#9693a5" font-family="monospace" font-size="13">8 directions / idle + four walk frames + hurt / original procedural pixel art</text><rect x="620" y="100" width="${frameWidth * 4}" height="${frameHeight * 4}" fill="none" stroke="#8e70ba"/><circle cx="${620 + frameWidth * 2}" cy="${100 + frameHeight * 3.28}" r="${Math.max(20, frameWidth)}" fill="none" stroke="#55c9d3"/></svg>`,
  );
  return stripPngChunks(
    await sharp(svg)
      .composite([
        { input: sheet, left: 24, top: 80 },
        { input: frame, left: 620, top: 100 },
      ])
      .png()
      .toBuffer(),
  );
}

async function dungeonMontage(items) {
  const width = 960;
  const rowHeight = 150;
  const height = 58 + items.length * rowHeight;
  const layers = [];
  const labels = [
    '<text x="24" y="34" fill="#c9c0b0" font-family="monospace" font-size="20">Dungeon vertical-slice asset contact sheet</text>',
  ];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const top = 58 + index * rowHeight;
    const source = await fs.readFile(item.file);
    const frame = await sharp(source)
      .extract({ left: item.cropX ?? 0, top: 0, width: item.frameWidth, height: item.frameHeight })
      .png()
      .toBuffer();
    const scaled = await sharp(frame)
      .resize(item.frameWidth * 4, item.frameHeight * 4, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    layers.push({ input: frame, left: 30, top: top + 45 });
    layers.push({ input: scaled, left: 130, top: top + 8 });
    labels.push(
      `<text x="390" y="${top + 35}" fill="#c9c0b0" font-family="monospace" font-size="17">${item.key}</text>`,
      `<text x="390" y="${top + 60}" fill="#9693a5" font-family="monospace" font-size="13">${item.note}</text>`,
    );
  }
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#0d1020"/>${labels.join('')}</svg>`,
  );
  return stripPngChunks(await sharp(svg).composite(layers).png().toBuffer());
}

async function buildDungeon() {
  await Promise.all([
    fs.mkdir(imageDir, { recursive: true }),
    fs.mkdir(previewDir, { recursive: true }),
  ]);
  const definitions = [
    ['enemy-skeleton-archer', 'skeleton-archer', 32, 32, 7],
    ['enemy-splitting-slime', 'splitting-slime', 32, 32, 8],
    ['enemy-small-slime', 'small-slime', 32, 32, 5],
    ['boss-skeleton-warden', 'skeleton-warden', 48, 48, 17],
  ];
  for (const [key, kind, frameWidth, frameHeight] of definitions) {
    const file = path.join(imageDir, `${key}.png`);
    await fs.writeFile(file, await characterSheet(kind, frameWidth, frameHeight));
    await fs.writeFile(
      path.join(previewDir, `${key}-contact-sheet.png`),
      await contactSheet(key, file, frameWidth, frameHeight),
    );
  }
  await fs.writeFile(path.join(imageDir, 'tileset-dungeon.png'), await dungeonTileset());
  const dungeonMap = await writeMap();
  await fs.writeFile(
    path.join(previewDir, 'map-dungeon-preview.png'),
    await mapPreview(dungeonMap),
  );
  await fs.writeFile(
    path.join(previewDir, 'dungeon-vertical-slice-contact-sheet.png'),
    await dungeonMontage([
      {
        key: 'enemy-skeleton-archer',
        file: path.join(imageDir, 'enemy-skeleton-archer.png'),
        frameWidth: 32,
        frameHeight: 32,
        note: '8 directions / 6 columns / ranged silhouette',
      },
      {
        key: 'enemy-splitting-slime',
        file: path.join(imageDir, 'enemy-splitting-slime.png'),
        frameWidth: 32,
        frameHeight: 32,
        note: 'large split parent / readable violet body',
      },
      {
        key: 'enemy-small-slime',
        file: path.join(imageDir, 'enemy-small-slime.png'),
        frameWidth: 32,
        frameHeight: 32,
        note: 'small child / reduced collision silhouette',
      },
      {
        key: 'boss-skeleton-warden',
        file: path.join(imageDir, 'boss-skeleton-warden.png'),
        frameWidth: 48,
        frameHeight: 48,
        note: '48x48 Warden / cyan eyes / violet bow and shield',
      },
      {
        key: 'tileset-dungeon',
        file: path.join(imageDir, 'tileset-dungeon.png'),
        cropX: 16,
        frameWidth: 16,
        frameHeight: 16,
        note: '16x16 masonry / tile 0 transparent',
      },
    ]),
  );

  const manifestPath = path.join(root, 'assets/manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const additions = [
    imageEntry('enemy-skeleton-archer', 192, 256, 32, 32, 7),
    imageEntry('enemy-splitting-slime', 192, 256, 32, 32, 8, 0.78),
    imageEntry('enemy-small-slime', 192, 256, 32, 32, 5, 0.78),
    imageEntry('boss-skeleton-warden', 288, 384, 48, 48, 17),
    {
      key: 'tileset-dungeon',
      path: 'assets/images/tileset-dungeon.png',
      kind: 'tileset',
      license: 'original',
      width: 128,
      height: 48,
      frameWidth: 16,
      frameHeight: 16,
      anchor: { x: 0.5, y: 0.5 },
      paletteId: 'dungeon',
    },
  ];
  const replaced = new Set(additions.map((asset) => asset.key));
  manifest.images = [...manifest.images.filter((asset) => !replaced.has(asset.key)), ...additions];
  manifest.maps = [
    ...manifest.maps.filter((map) => map.key !== 'map-dungeon'),
    {
      key: 'map-dungeon',
      path: 'assets/maps/map-dungeon.json',
      kind: 'map',
      license: 'original',
      tilesetKey: 'tileset-dungeon',
      width: 120,
      height: 67,
      tileWidth: 16,
      tileHeight: 16,
      layers: [
        { name: 'ground', kind: 'tile', collision: false },
        { name: 'obstacles', kind: 'object', collision: true },
        { name: 'hazards', kind: 'object', collision: false },
        { name: 'decorations', kind: 'tile', collision: false },
        { name: 'spawns', kind: 'object', collision: false },
      ],
    },
  ];
  await fs.writeFile(
    manifestPath,
    await prettier.format(JSON.stringify(manifest), {
      ...(await prettier.resolveConfig(manifestPath)),
      parser: 'json',
    }),
  );
  console.log(
    'Generated 5 Dungeon image assets, map-dungeon, 5 contact sheets, and a map preview.',
  );
}

module.exports = { buildDungeon };
