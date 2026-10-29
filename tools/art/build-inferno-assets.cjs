const fs = require('node:fs/promises');
const path = require('node:path');
const prettier = require('prettier');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const imageDir = path.join(root, 'assets/images');
const mapDir = path.join(root, 'assets/maps');
const previewDir = path.join(root, 'docs/art/previews');
const palette = [
  '#160f1d',
  '#332036',
  '#5a2c3c',
  '#8c3f3b',
  '#cc5b38',
  '#f09a45',
  '#ffd27a',
  '#6f3f76',
  '#d8c6d8',
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

const rect = (x, y, width, height, fill) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;

function characterSvg(kind, width, height, direction, frame) {
  const dx = [1, 1, 0, -1, -1, -1, 0, 1][direction];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1][direction];
  const bob = [0, -1, 0, -2, 0, 0][frame];
  const stride = [-1, 1, -2, 2][Math.max(0, frame - 1)] ?? 0;
  const hurt = frame === 5;
  const pieces = [];
  const center = Math.round(width / 2) + dx * 2;
  if (kind === 'flame-skull') {
    const skullY = Math.round(height * 0.38) + bob;
    pieces.push(rect(center - 6, skullY, 12, 9, hurt ? palette[7] : palette[8]));
    pieces.push(rect(center - 4, skullY + 3, 2, 2, palette[0]));
    pieces.push(rect(center + 2, skullY + 3, 2, 2, palette[0]));
    pieces.push(rect(center - 3, skullY + 8, 6, 3, palette[2]));
    pieces.push(rect(center - 7 + stride, skullY - 8, 14, 8, palette[4]));
    pieces.push(rect(center - 4 - stride, skullY - 12, 8, 6, palette[5]));
    pieces.push(rect(center - 1, skullY - 15, 3, 5, palette[6]));
  } else {
    const boss = kind === 'flame-demon';
    const scale = boss ? 1.45 : 1;
    const bodyW = Math.round(14 * scale);
    const bodyH = Math.round(14 * scale);
    const bodyX = center - Math.round(bodyW / 2);
    const bodyY = Math.round(height * (boss ? 0.34 : 0.42)) + bob;
    const skin = hurt ? palette[7] : palette[3];
    pieces.push(rect(bodyX, bodyY, bodyW, bodyH, skin));
    pieces.push(rect(center - Math.round(4 * scale), bodyY + 4, 2, 2, palette[6]));
    pieces.push(rect(center + Math.round(2 * scale), bodyY + 4, 2, 2, palette[6]));
    pieces.push(rect(bodyX - 4, bodyY - 7, 5, 9, palette[1]));
    pieces.push(rect(bodyX + bodyW - 1, bodyY - 7, 5, 9, palette[1]));
    pieces.push(rect(center - 8 - stride, bodyY + bodyH, 5, Math.round(8 * scale), palette[2]));
    pieces.push(rect(center + 3 + stride, bodyY + bodyH, 5, Math.round(8 * scale), palette[2]));
    pieces.push(rect(center - 11 + dx * 2, bodyY + 7 + dy, 5, 3, palette[4]));
    pieces.push(rect(center + 6 + dx * 2, bodyY + 7 + dy, 5, 3, palette[4]));
    pieces.push(rect(center - 4, bodyY - 8, 8, 7, palette[5]));
    pieces.push(rect(center - 2, bodyY - 12, 4, 6, palette[6]));
    if (boss) {
      pieces.push(rect(center - 15, bodyY + 2, 6, 18, palette[4]));
      pieces.push(rect(center + 9, bodyY + 2, 6, 18, palette[4]));
      pieces.push(rect(center - 10, bodyY + 12, 20, 5, palette[0]));
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
      layers.push({
        input: await palettePng(
          characterSvg(kind, frameWidth, frameHeight, row, column),
          frameWidth,
          frameHeight,
        ),
        left: column * frameWidth,
        top: row * frameHeight,
      });
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

async function infernoTileset() {
  const parts = [];
  for (let tile = 1; tile < 24; tile += 1) {
    const x = (tile % 8) * 16;
    const y = Math.floor(tile / 8) * 16;
    const base = tile < 8 ? palette[1] : tile < 16 ? palette[2] : palette[3];
    parts.push(rect(x, y, 16, 16, base));
    parts.push(rect(x, y, 16, 2, tile % 3 === 0 ? palette[5] : palette[4]));
    parts.push(rect(x + ((tile * 5) % 12), y + 4, 2, 9, palette[0]));
    if (tile % 2 === 0) parts.push(rect(x + 2, y + 11, 11, 2, palette[4]));
    if (tile % 5 === 0) parts.push(rect(x + 5, y + 4, 6, 5, palette[6]));
  }
  return palettePng(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="48" shape-rendering="crispEdges">${parts.join('')}</svg>`,
    ),
    128,
    48,
  );
}

async function lavaVfx() {
  const parts = [];
  for (let frame = 0; frame < 4; frame += 1) {
    const x = frame * 16;
    parts.push(rect(x, 0, 16, 16, palette[3]));
    parts.push(rect(x + 1, 5, 14, 10, palette[4]));
    parts.push(rect(x + 2, 7 + (frame % 2), 12, 5, palette[5]));
    parts.push(rect(x + 4 + frame, 4, 4, 5, palette[6]));
    parts.push(rect(x + ((frame * 3) % 9) + 3, 12, 3, 2, palette[3]));
  }
  return palettePng(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="16" shape-rendering="crispEdges">${parts.join('')}</svg>`,
    ),
    64,
    16,
  );
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
        frameRate: 9,
        repeat: -1,
        direction,
      },
      { key: `hurt-${direction}`, frames: [start + 5], frameRate: 8, repeat: 0, direction },
    ];
  });
}

function imageEntry(key, width, height, frameWidth, frameHeight, radius) {
  return {
    key,
    path: `assets/images/${key}.png`,
    kind: 'sprite',
    license: 'original',
    width,
    height,
    frameWidth,
    frameHeight,
    anchor: { x: 0.5, y: 0.82 },
    paletteId: 'inferno',
    animations: directionalAnimations(),
    collision: { shape: 'circle', offsetX: 0, offsetY: -4, radius },
  };
}

function hazard(id, name, x, y, width, height) {
  return {
    id,
    name,
    type: 'lava',
    x,
    y,
    width,
    height,
    properties: [
      { name: 'hazardId', type: 'string', value: name },
      { name: 'damage', type: 'int', value: 9 },
      { name: 'tickMs', type: 'int', value: 750 },
    ],
  };
}

async function writeMap() {
  const width = 120;
  const height = 67;
  const ground = Array.from(
    { length: width * height },
    (_, index) => 1 + ((index + Math.floor(index / width) * 3) % 4),
  );
  const decorations = Array.from({ length: width * height }, (_, index) =>
    index % 113 === 0 ? 17 + (index % 4) : 0,
  );
  const obstacles = [
    { id: 1, name: 'north-wall', x: 0, y: 0, width: 1920, height: 32 },
    { id: 2, name: 'south-wall', x: 0, y: 1040, width: 1920, height: 32 },
    { id: 3, name: 'west-wall', x: 0, y: 32, width: 32, height: 1008 },
    { id: 4, name: 'east-wall', x: 1888, y: 32, width: 32, height: 1008 },
  ];
  const hazards = [
    hazard(20, 'lava-west', 224, 176, 288, 96),
    hazard(21, 'lava-north-east', 1344, 128, 320, 96),
    hazard(22, 'lava-center-south', 800, 688, 320, 96),
    hazard(23, 'lava-south-west', 208, 832, 304, 96),
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
        name: 'tileset-inferno',
        tilewidth: 16,
        tileheight: 16,
        tilecount: 24,
        columns: 8,
        image: '../images/tileset-inferno.png',
        imagewidth: 128,
        imageheight: 48,
      },
    ],
    layers: [
      { id: 1, name: 'ground', type: 'tilelayer', width, height, data: ground },
      { id: 2, name: 'obstacles', type: 'objectgroup', objects: obstacles },
      { id: 3, name: 'hazards', type: 'objectgroup', objects: hazards },
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
  const target = path.join(mapDir, 'map-inferno.json');
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

async function contactSheet(key, file, frameWidth, frameHeight, note) {
  const sheet = await fs.readFile(file);
  const frame = await sharp(sheet)
    .extract({ left: 0, top: 0, width: frameWidth, height: frameHeight })
    .resize(frameWidth * 4, frameHeight * 4, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
  const metadata = await sharp(sheet).metadata();
  const displayWidth = Math.min(metadata.width, 540);
  const displayHeight = Math.min(metadata.height, 330);
  const full = await sharp(sheet)
    .resize(displayWidth, displayHeight, { fit: 'inside', kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="420"><rect width="920" height="420" fill="#160f1d"/><text x="24" y="32" fill="#d8c6d8" font-family="monospace" font-size="20">${key}</text><text x="24" y="55" fill="#f09a45" font-family="monospace" font-size="13">${note}</text><rect x="680" y="100" width="${frameWidth * 4}" height="${frameHeight * 4}" fill="none" stroke="#ffd27a"/></svg>`,
  );
  return stripPngChunks(
    await sharp(svg)
      .composite([
        { input: full, left: 24, top: 75 },
        { input: frame, left: 680, top: 100 },
      ])
      .png()
      .toBuffer(),
  );
}

async function mapPreview(map) {
  const scale = 0.5;
  const width = map.width * map.tilewidth * scale;
  const height = map.height * map.tileheight * scale;
  const obstacles = map.layers.find((layer) => layer.name === 'obstacles').objects;
  const hazards = map.layers.find((layer) => layer.name === 'hazards').objects;
  const spawns = map.layers.find((layer) => layer.name === 'spawns').objects;
  const obstacleSvg = obstacles
    .map(
      (object) =>
        `<rect x="${object.x * scale}" y="${object.y * scale}" width="${object.width * scale}" height="${object.height * scale}" fill="#5a2c3c" stroke="#8c3f3b" stroke-width="2"/>`,
    )
    .join('');
  const hazardSvg = hazards
    .map(
      (object) =>
        `<rect x="${object.x * scale}" y="${object.y * scale}" width="${object.width * scale}" height="${object.height * scale}" fill="#cc5b38" stroke="#ffd27a" stroke-width="2" opacity="0.9"/><text x="${object.x * scale + 6}" y="${object.y * scale + 17}" fill="#160f1d" font-family="monospace" font-size="12">${object.name}</text>`,
    )
    .join('');
  const spawnSvg = spawns
    .map(
      (spawn) =>
        `<circle cx="${spawn.x * scale}" cy="${spawn.y * scale}" r="8" fill="${spawn.name === 'player' ? '#d8c6d8' : '#6f3f76'}"/><text x="${spawn.x * scale + 12}" y="${spawn.y * scale + 5}" fill="#d8c6d8" font-family="monospace" font-size="14">${spawn.name}</text>`,
    )
    .join('');
  return stripPngChunks(
    await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#332036"/><path d="M240 0v${height}M480 0v${height}M720 0v${height}M0 134h${width}M0 268h${width}M0 402h${width}" stroke="#5a2c3c" stroke-width="2"/>${hazardSvg}${obstacleSvg}${spawnSvg}</svg>`,
      ),
    )
      .png()
      .toBuffer(),
  );
}

async function montage(items) {
  const width = 960;
  const rowHeight = 150;
  const height = 58 + items.length * rowHeight;
  const layers = [];
  const labels = [
    '<text x="24" y="34" fill="#d8c6d8" font-family="monospace" font-size="20">Inferno vertical-slice asset contact sheet</text>',
  ];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const top = 58 + index * rowHeight;
    const frame = await sharp(await fs.readFile(item.file))
      .extract({ left: item.cropX ?? 0, top: 0, width: item.frameWidth, height: item.frameHeight })
      .png()
      .toBuffer();
    layers.push({ input: frame, left: 30, top: top + 45 });
    layers.push({
      input: await sharp(frame)
        .resize(item.frameWidth * 4, item.frameHeight * 4, { kernel: sharp.kernel.nearest })
        .png()
        .toBuffer(),
      left: 130,
      top: top + 8,
    });
    labels.push(
      `<text x="390" y="${top + 35}" fill="#d8c6d8" font-family="monospace" font-size="17">${item.key}</text>`,
      `<text x="390" y="${top + 60}" fill="#f09a45" font-family="monospace" font-size="13">${item.note}</text>`,
    );
  }
  return stripPngChunks(
    await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#160f1d"/>${labels.join('')}</svg>`,
      ),
    )
      .composite(layers)
      .png()
      .toBuffer(),
  );
}

async function buildInferno() {
  await Promise.all([
    fs.mkdir(imageDir, { recursive: true }),
    fs.mkdir(previewDir, { recursive: true }),
  ]);
  const definitions = [
    ['enemy-swift-demon', 'swift-demon', 32, 32, 8],
    ['enemy-flame-skull', 'flame-skull', 32, 32, 8],
    ['boss-flame-demon', 'flame-demon', 48, 48, 20],
  ];
  for (const [key, kind, frameWidth, frameHeight] of definitions) {
    const file = path.join(imageDir, `${key}.png`);
    await fs.writeFile(file, await characterSheet(kind, frameWidth, frameHeight));
    await fs.writeFile(
      path.join(previewDir, `${key}-contact-sheet.png`),
      await contactSheet(
        key,
        file,
        frameWidth,
        frameHeight,
        '8 directions / idle + four walk frames + hurt / Inferno palette',
      ),
    );
  }
  const tilesetFile = path.join(imageDir, 'tileset-inferno.png');
  const lavaFile = path.join(imageDir, 'vfx-lava.png');
  await fs.writeFile(tilesetFile, await infernoTileset());
  await fs.writeFile(lavaFile, await lavaVfx());
  await fs.writeFile(
    path.join(previewDir, 'tileset-inferno-contact-sheet.png'),
    await contactSheet('tileset-inferno', tilesetFile, 16, 16, '16x16 volcanic tiles'),
  );
  await fs.writeFile(
    path.join(previewDir, 'vfx-lava-contact-sheet.png'),
    await contactSheet('vfx-lava', lavaFile, 16, 16, 'four centered lava animation frames'),
  );
  const infernoMap = await writeMap();
  await fs.writeFile(
    path.join(previewDir, 'map-inferno-preview.png'),
    await mapPreview(infernoMap),
  );

  const items = [
    ...definitions.map(([key, , frameWidth, frameHeight]) => ({
      key,
      file: path.join(imageDir, `${key}.png`),
      frameWidth,
      frameHeight,
      note: 'directional production placeholder / original procedural pixel art',
    })),
    {
      key: 'tileset-inferno',
      file: tilesetFile,
      cropX: 16,
      frameWidth: 16,
      frameHeight: 16,
      note: '16x16 volcanic ground / tile 0 transparent',
    },
    {
      key: 'vfx-lava',
      file: lavaFile,
      frameWidth: 16,
      frameHeight: 16,
      note: 'four-frame fixed and temporary lava effect',
    },
  ];
  await fs.writeFile(
    path.join(previewDir, 'inferno-vertical-slice-contact-sheet.png'),
    await montage(items),
  );

  const manifestPath = path.join(root, 'assets/manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const additions = [
    imageEntry('enemy-swift-demon', 192, 256, 32, 32, 8),
    imageEntry('enemy-flame-skull', 192, 256, 32, 32, 8),
    imageEntry('boss-flame-demon', 288, 384, 48, 48, 20),
    {
      key: 'tileset-inferno',
      path: 'assets/images/tileset-inferno.png',
      kind: 'tileset',
      license: 'original',
      width: 128,
      height: 48,
      frameWidth: 16,
      frameHeight: 16,
      anchor: { x: 0.5, y: 0.5 },
      paletteId: 'inferno',
    },
    {
      key: 'vfx-lava',
      path: 'assets/images/vfx-lava.png',
      kind: 'vfx',
      license: 'original',
      width: 64,
      height: 16,
      frameWidth: 16,
      frameHeight: 16,
      anchor: { x: 0.5, y: 0.5 },
      paletteId: 'inferno',
      animations: [{ key: 'active', frames: [0, 1, 2, 3], frameRate: 8, repeat: -1 }],
    },
  ];
  const replaced = new Set(additions.map((asset) => asset.key));
  manifest.images = [...manifest.images.filter((asset) => !replaced.has(asset.key)), ...additions];
  manifest.maps = [
    ...manifest.maps.filter((map) => map.key !== 'map-inferno'),
    {
      key: 'map-inferno',
      path: 'assets/maps/map-inferno.json',
      kind: 'map',
      license: 'original',
      tilesetKey: 'tileset-inferno',
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
  console.log('Generated 5 Inferno image assets, map-inferno, contact sheets, and previews.');
}

module.exports = { buildInferno };

if (require.main === module) {
  buildInferno().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
