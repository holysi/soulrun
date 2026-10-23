// Deterministic post-processing for Issue #4. Requires repository dependencies.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../..');
const sourceDir = path.join(root, 'assets/source/imagegen');
const imageDir = path.join(root, 'assets/images');
const previewDir = path.join(root, 'docs/art/previews');

const palettes = {
  ui: ['#101426', '#20284a', '#46506e', '#d7d0b4', '#50e3e6', '#a8ffff', '#d65a62', '#ff9a8f'],
  cemetery: [
    '#101426',
    '#252a3a',
    '#39483b',
    '#56624a',
    '#6c7180',
    '#9aa0ad',
    '#d7d0b4',
    '#7456a6',
    '#50e3e6',
    '#a8ffff',
  ],
  dungeon: [
    '#0d1020',
    '#22263a',
    '#3c4058',
    '#62657a',
    '#9693a5',
    '#c9c0b0',
    '#584780',
    '#8e70ba',
    '#55c9d3',
  ],
  inferno: [
    '#160f1d',
    '#332036',
    '#5a2c3c',
    '#8c3f3b',
    '#cc5b38',
    '#f09a45',
    '#ffd27a',
    '#6f3f76',
    '#d8c6d8',
  ],
};

const sources = {
  player: path.join(sourceDir, 'soul-guide-imagegen.png'),
  cemetery: path.join(sourceDir, 'cemetery-kit-imagegen.png'),
  enemies: path.join(sourceDir, 'cemetery-enemies-imagegen.png'),
  boss: path.join(sourceDir, 'graveyard-guardian-imagegen.png'),
  effects: path.join(sourceDir, 'effects-pickups-imagegen.png'),
};

const hexRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

async function quantize(input, palette, width, height) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colors = palette.map(hexRgb);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 72) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
      continue;
    }
    let best = colors[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of colors) {
      const dr = data[i] - candidate[0];
      const dg = data[i + 1] - candidate[1];
      const db = data[i + 2] - candidate[2];
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    data[i] = best[0];
    data[i + 1] = best[1];
    data[i + 2] = best[2];
    data[i + 3] = 255;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(width, height, { kernel: sharp.kernel.nearest, fit: 'fill' })
    .png()
    .toBuffer();
}

async function isolatedCrop(file, region, width, height, palette, margin = 2) {
  const extracted = await sharp(file).extract(region).png().toBuffer();
  const crop = await sharp(extracted)
    .trim({ background: '#00000000', threshold: 12 })
    .png()
    .toBuffer();
  const innerWidth = Math.max(1, width - margin * 2);
  const innerHeight = Math.max(1, height - margin * 2);
  const fitted = await sharp(crop)
    .resize(innerWidth, innerHeight, {
      fit: 'contain',
      position: 'south',
      kernel: sharp.kernel.nearest,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return quantize(fitted, palette, innerWidth, innerHeight).then((pixel) =>
    sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: pixel, left: margin, top: margin }])
      .png()
      .toBuffer(),
  );
}

const directionVectors = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];

function copyPixel(source, target, sourceIndex, x, y, width, height) {
  if (x < 0 || y < 0 || x >= width || y >= height || source[sourceIndex + 3] === 0) return;
  const targetIndex = (y * width + x) * 4;
  for (let channel = 0; channel < 4; channel += 1)
    target[targetIndex + channel] = source[sourceIndex + channel];
}

async function transformFrame(input, width, height, mapPixel, tint) {
  const sourcePng = tint ? await sharp(input).tint(tint).png().toBuffer() : input;
  const { data } = await sharp(sourcePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = (y * width + x) * 4;
      const destination = mapPixel(x, y);
      copyPixel(data, output, sourceIndex, destination.x, destination.y, width, height);
    }
  return sharp(output, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

async function walkFrame(input, width, height, phase) {
  const bob = Math.abs(phase) === 1 ? -1 : 0;
  const split = Math.floor(height * 0.48);
  return transformFrame(input, width, height, (x, y) => {
    const lowerRatio = Math.max(0, (y - split) / Math.max(1, height - split - 1));
    const stride = Math.round(phase * lowerRatio);
    const cloakSway = y > split && (x + y + Math.abs(phase)) % 3 === 0 ? Math.sign(phase) : 0;
    return { x: x + stride + cloakSway, y: y + bob };
  });
}

async function hurtFrame(input, width, height, direction) {
  return transformFrame(
    input,
    width,
    height,
    (x, y) => ({ x: x - direction.x, y: y - direction.y }),
    '#d7d0b4',
  );
}

async function attackFrame(input, width, height, direction, reach, palette) {
  const leaned = await transformFrame(input, width, height, (x, y) => ({
    x: x + Math.round(direction.x * (y / height) * 2),
    y: y + Math.round(direction.y * (y / height) * 2),
  }));
  const { data } = await sharp(leaned).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cyan = hexRgb(palette[palette.length - 2]);
  const bright = hexRgb(palette[palette.length - 1]);
  const center = { x: Math.round(width / 2), y: Math.round(height * 0.45) };
  const perpendicular = { x: -direction.y, y: direction.x };
  for (let step = 4; step <= reach; step += 1) {
    const px = Math.round(center.x + direction.x * step);
    const py = Math.round(center.y + direction.y * step);
    for (let thickness = -1; thickness <= 1; thickness += 1) {
      const x = px + perpendicular.x * thickness;
      const y = py + perpendicular.y * thickness;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const index = (y * width + x) * 4;
      const color = thickness === 0 ? bright : cyan;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

async function deathFrame(input, width, height) {
  const { data } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(width * height * 4);
  const center = (width - 1) / 2;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = (y * width + x) * 4;
      if (data[sourceIndex + 3] === 0 || (x + y) % 4 === 0) continue;
      const collapsedX = Math.round(center + (x - center) * 1.18);
      const collapsedY = Math.round(height * 0.61 + y * 0.34);
      copyPixel(data, output, sourceIndex, collapsedX, collapsedY, width, height);
    }
  return sharp(output, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

async function sheetFromPoses(poses, frameWidth, frameHeight, columns, palette) {
  const layers = [];
  for (let row = 0; row < poses.length; row += 1) {
    const base = poses[row];
    const direction = directionVectors[row];
    for (let col = 0; col < columns; col += 1) {
      let frame = base;
      if (col >= 1 && col <= 4)
        frame = await walkFrame(base, frameWidth, frameHeight, [-2, -1, 1, 2][col - 1]);
      else if (col === 5) frame = await hurtFrame(base, frameWidth, frameHeight, direction);
      else if (columns === 9 && col === 6)
        frame = await attackFrame(
          base,
          frameWidth,
          frameHeight,
          direction,
          Math.round(frameWidth * 0.27),
          palette,
        );
      else if (columns === 9 && col === 7)
        frame = await attackFrame(
          base,
          frameWidth,
          frameHeight,
          direction,
          Math.round(frameWidth * 0.4),
          palette,
        );
      else if (columns === 9 && col === 8) frame = await deathFrame(base, frameWidth, frameHeight);
      layers.push({ input: frame, left: col * frameWidth, top: row * frameHeight });
    }
  }
  const raw = await sharp({
    create: {
      width: columns * frameWidth,
      height: poses.length * frameHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
  return quantize(raw, palette, columns * frameWidth, poses.length * frameHeight);
}

async function extractGrid(file, cols, rows, frameWidth, frameHeight, palette) {
  const meta = await sharp(file).metadata();
  const output = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const left = Math.floor((meta.width * col) / cols);
      const top = Math.floor((meta.height * row) / rows);
      const right = Math.floor((meta.width * (col + 1)) / cols);
      const bottom = Math.floor((meta.height * (row + 1)) / rows);
      output.push(
        await isolatedCrop(
          file,
          { left, top, width: right - left, height: bottom - top },
          frameWidth,
          frameHeight,
          palette,
        ),
      );
    }
  }
  return output;
}

async function save(file, buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    path.extname(file) === '.png' ? stripPngChunks(buffer, new Set(['pHYs'])) : buffer,
  );
}

function stripPngChunks(buffer, forbidden) {
  const signature = buffer.subarray(0, 8);
  const chunks = [signature];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (!forbidden.has(type)) chunks.push(buffer.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}

async function extractEffect(region, width, height, palette = palettes.ui) {
  return isolatedCrop(sources.effects, region, width, height, palette, 1);
}

function checkerSvg(width, height, cell = 8) {
  const tiles = [];
  for (let y = 0; y < height; y += cell)
    for (let x = 0; x < width; x += cell) {
      const fill = (x / cell + y / cell) % 2 ? '#22263a' : '#353a50';
      tiles.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}"/>`);
    }
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${tiles.join('')}</svg>`,
  );
}

async function contactSheet(assetEntry, assetPath, detail = '') {
  const { key, frameWidth, frameHeight, anchor, collision } = assetEntry;
  const asset = await fs.readFile(assetPath);
  const metadata = await sharp(asset).metadata();
  const one = await sharp(asset)
    .extract({ left: 0, top: 0, width: frameWidth, height: frameHeight })
    .png()
    .toBuffer();
  const four = await sharp(one)
    .resize(frameWidth * 4, frameHeight * 4, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
  const canvasW = 920;
  const canvasH = Math.max(360, 102 + metadata.height);
  const x1 = 24;
  const y1 = 72;
  const x4 = 460;
  const y4 = 90;
  const anchorX = x4 + frameWidth * 4 * anchor.x;
  const anchorY = y4 + frameHeight * 4 * anchor.y;
  const radius = (collision?.radius || 0) * 4;
  const notesY = y4 + frameHeight * 4 + 35;
  const cols = metadata.width / frameWidth;
  const rows = metadata.height / frameHeight;
  const grid = [];
  for (let x = 0; x <= cols; x += 1)
    grid.push(
      `<path d="M${x1 + x * frameWidth} ${y1}v${metadata.height}" stroke="#46506e" stroke-width="1"/>`,
    );
  for (let y = 0; y <= rows; y += 1)
    grid.push(
      `<path d="M${x1} ${y1 + y * frameHeight}h${metadata.width}" stroke="#46506e" stroke-width="1"/>`,
    );
  const overlay =
    Buffer.from(`<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">
    <style>text{font-family:monospace;fill:#d7d0b4} .small{font-size:13px}.title{font-size:20px;font-weight:bold}</style>
    <text x="24" y="30" class="title">${key}</text><text x="24" y="52" class="small">full sheet 1x / rows e,se,s,sw,w,nw,n,ne</text><text x="460" y="68" class="small">frame 0 nearest-neighbor 4x</text>
    ${grid.join('')}
    <rect x="${x4}" y="${y4}" width="${frameWidth * 4}" height="${frameHeight * 4}" fill="none" stroke="#7456a6"/>
    ${collision ? `<circle cx="${anchorX + collision.offsetX * 4}" cy="${anchorY + collision.offsetY * 4}" r="${radius}" fill="none" stroke="#ff9a8f" stroke-width="2"/><path d="M${anchorX - 5} ${anchorY}h10M${anchorX} ${anchorY - 5}v10" stroke="#50e3e6" stroke-width="2"/>` : ''}
    <text x="650" y="105" class="small">frame ${frameWidth}x${frameHeight}</text><text x="650" y="128" class="small">anchor ${anchor.x.toFixed(2)},${anchor.y.toFixed(2)}</text>
    <text x="650" y="151" class="small">${detail}</text><text x="650" y="174" class="small">alpha: transparent RGBA</text><text x="650" y="197" class="small">license: original</text>
    <text x="460" y="${notesY}" class="small">${key === 'player-soul-guide' ? 'columns idle-0, walk-0..3, hurt-0,' : 'columns idle-0, walk-0..3, hurt-0'}</text>
    ${key === 'player-soul-guide' ? `<text x="460" y="${notesY + 21}" class="small">attack-0, attack-1, death-0</text>` : ''}
    <text x="460" y="${notesY + 55}" class="small">cyan cross = anchor; coral outline = collision</text>
  </svg>`);
  const bg = await sharp(checkerSvg(canvasW, canvasH)).png().toBuffer();
  return sharp(bg)
    .composite([
      { input: asset, left: x1, top: y1 },
      { input: four, left: x4, top: y4 },
      { input: overlay },
    ])
    .png()
    .toBuffer();
}

async function montage(items) {
  const width = 960;
  const rowHeight = 150;
  const height = 48 + items.length * rowHeight;
  const base = await sharp(checkerSvg(width, height, 12))
    .png()
    .toBuffer();
  const layers = [];
  const labels = [
    `<text x="20" y="30" class="title">Cemetery vertical-slice asset contact sheet</text>`,
  ];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const y = 48 + i * rowHeight;
    const data = await fs.readFile(item.path);
    const native = await sharp(data)
      .extract({ left: item.cropX || 0, top: item.cropY || 0, width: item.fw, height: item.fh })
      .png()
      .toBuffer();
    const scaled = await sharp(native)
      .resize(item.fw * 4, item.fh * 4, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    layers.push({ input: native, left: 24, top: y + 40 }, { input: scaled, left: 120, top: y + 8 });
    labels.push(
      `<text x="360" y="${y + 34}" class="name">${item.key}</text><text x="360" y="${y + 58}" class="small">1x + 4x / frame ${item.fw}x${item.fh} / ${item.note}</text>`,
    );
  }
  const labelSvg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:monospace;fill:#d7d0b4}.title{font-size:20px;font-weight:bold}.name{font-size:16px;font-weight:bold}.small{font-size:13px}</style>${labels.join('')}</svg>`,
  );
  return sharp(base)
    .composite([...layers, { input: labelSvg }])
    .png()
    .toBuffer();
}

function directionalAnimations(columns, includeAttackDeath) {
  const directions = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'];
  return directions.flatMap((direction, row) => {
    const start = row * columns;
    const animations = [
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
    if (includeAttackDeath)
      animations.push(
        {
          key: `attack-${direction}`,
          frames: [start + 6, start + 7],
          frameRate: 10,
          repeat: 0,
          direction,
        },
        {
          key: `death-${direction}`,
          frames: [start + 5, start + 8],
          frameRate: 6,
          repeat: 0,
          direction,
        },
      );
    return animations;
  });
}

async function writeManifest() {
  const image = (key, kind, width, height, frameWidth, frameHeight, paletteId, extra = {}) => ({
    key,
    path: `assets/images/${key}.png`,
    kind,
    license: 'original',
    width,
    height,
    frameWidth,
    frameHeight,
    anchor: { x: 0.5, y: extra.anchorY ?? 0.5 },
    paletteId,
    ...(extra.animations ? { animations: extra.animations } : {}),
    ...(extra.collision ? { collision: extra.collision } : {}),
  });
  const circle = (offsetY, radius) => ({ shape: 'circle', offsetX: 0, offsetY, radius });
  const rect = (offsetY, width, height) => ({ shape: 'rect', offsetX: 0, offsetY, width, height });
  const manifest = {
    schemaVersion: 1,
    palette: Object.entries(palettes).map(([id, colors]) => ({ id, colors })),
    images: [
      image('player-soul-guide', 'sprite', 288, 256, 32, 32, 'ui', {
        anchorY: 0.82,
        animations: directionalAnimations(9, true),
        collision: circle(-5, 8),
      }),
      image('enemy-zombie', 'sprite', 192, 256, 32, 32, 'cemetery', {
        anchorY: 0.82,
        animations: directionalAnimations(6, false),
        collision: circle(-4, 7),
      }),
      image('enemy-bat', 'sprite', 192, 256, 32, 32, 'cemetery', {
        anchorY: 0.72,
        animations: directionalAnimations(6, false),
        collision: circle(-6, 7),
      }),
      image('boss-graveyard-guardian', 'sprite', 288, 384, 48, 48, 'cemetery', {
        anchorY: 0.82,
        animations: directionalAnimations(6, false),
        collision: circle(-8, 17),
      }),
      image('tileset-cemetery', 'tileset', 128, 48, 16, 16, 'cemetery'),
      image('weapon-ghost-arrow', 'sprite', 32, 16, 32, 16, 'ui', { collision: rect(0, 24, 8) }),
      image('weapon-soul-blade', 'sprite', 32, 32, 32, 32, 'ui', { collision: circle(0, 10) }),
      image('vfx-death-aura', 'vfx', 128, 32, 32, 32, 'ui', {
        animations: [{ key: 'pulse', frames: [0, 1, 2, 3], frameRate: 10, repeat: 0 }],
      }),
      image('vfx-hit', 'vfx', 64, 16, 16, 16, 'ui', {
        animations: [{ key: 'hit', frames: [0, 1, 2, 3], frameRate: 14, repeat: 0 }],
      }),
      image('vfx-telegraph-line', 'vfx', 64, 8, 64, 8, 'ui'),
      image('vfx-telegraph-circle', 'vfx', 32, 32, 32, 32, 'ui'),
      image('pickup-xp-gem', 'ui', 16, 16, 16, 16, 'ui', { collision: circle(0, 5) }),
      image('pickup-heal', 'ui', 16, 16, 16, 16, 'ui', { collision: circle(0, 5) }),
      image('ui-heart', 'ui', 16, 16, 16, 16, 'ui'),
      image('ui-pointer', 'ui', 16, 16, 16, 16, 'ui'),
    ],
    audio: [],
    maps: [],
  };
  await fs.writeFile(
    path.join(root, 'assets/manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

async function main() {
  await fs.mkdir(imageDir, { recursive: true });
  await fs.mkdir(previewDir, { recursive: true });

  const playerPoses = await extractGrid(sources.player, 4, 2, 32, 32, palettes.ui);
  const player = await sheetFromPoses(playerPoses, 32, 32, 9, palettes.ui);
  await save(path.join(imageDir, 'player-soul-guide.png'), player);

  const enemyPoses = await extractGrid(sources.enemies, 8, 2, 32, 32, palettes.cemetery);
  const zombie = await sheetFromPoses(enemyPoses.slice(0, 8), 32, 32, 6, palettes.cemetery);
  const bat = await sheetFromPoses(enemyPoses.slice(8, 16), 32, 32, 6, palettes.cemetery);
  await save(path.join(imageDir, 'enemy-zombie.png'), zombie);
  await save(path.join(imageDir, 'enemy-bat.png'), bat);

  const bossPoses = await extractGrid(sources.boss, 4, 2, 48, 48, palettes.cemetery);
  const boss = await sheetFromPoses(bossPoses, 48, 48, 6, palettes.cemetery);
  await save(path.join(imageDir, 'boss-graveyard-guardian.png'), boss);

  const tilesMeta = await sharp(sources.cemetery).metadata();
  const tileRegions = [
    { left: 30, top: 25, width: 190, height: 210 },
    { left: 220, top: 25, width: 200, height: 210 },
    { left: 410, top: 25, width: 200, height: 210 },
    { left: 610, top: 25, width: 210, height: 210 },
    { left: 30, top: 245, width: 190, height: 190 },
    { left: 225, top: 245, width: 190, height: 190 },
    { left: 420, top: 245, width: 190, height: 190 },
    { left: 620, top: 245, width: 190, height: 190 },
    { left: 870, top: 55, width: 125, height: 175 },
    { left: 995, top: 55, width: 125, height: 175 },
    { left: 1120, top: 50, width: 140, height: 185 },
    { left: 1280, top: 40, width: 225, height: 390 },
    { left: 30, top: 430, width: 200, height: 210 },
    { left: 250, top: 430, width: 200, height: 210 },
    { left: 450, top: 430, width: 200, height: 210 },
    { left: 740, top: 610, width: 220, height: 200 },
  ].map((r) => ({
    ...r,
    left: Math.min(r.left, tilesMeta.width - r.width),
    top: Math.min(r.top, tilesMeta.height - r.height),
  }));
  const tileLayers = [];
  for (let i = 0; i < tileRegions.length; i += 1) {
    const tile = await isolatedCrop(sources.cemetery, tileRegions[i], 16, 16, palettes.cemetery, 0);
    tileLayers.push({ input: tile, left: ((i + 1) % 8) * 16, top: Math.floor((i + 1) / 8) * 16 });
  }
  const tileset = await sharp({
    create: { width: 128, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(tileLayers)
    .png()
    .toBuffer();
  await save(
    path.join(imageDir, 'tileset-cemetery.png'),
    await quantize(tileset, palettes.cemetery, 128, 48),
  );

  const effects = [
    ['weapon-ghost-arrow.png', { left: 20, top: 80, width: 430, height: 210 }, 32, 16],
    ['weapon-soul-blade.png', { left: 455, top: 45, width: 300, height: 270 }, 32, 32],
    ['vfx-death-aura.png', { left: 800, top: 30, width: 900, height: 300 }, 128, 32],
    ['vfx-hit.png', { left: 40, top: 345, width: 850, height: 210 }, 64, 16],
    ['vfx-telegraph-line.png', { left: 950, top: 350, width: 760, height: 160 }, 64, 8],
    ['vfx-telegraph-circle.png', { left: 30, top: 555, width: 430, height: 300 }, 32, 32],
    ['pickup-xp-gem.png', { left: 545, top: 555, width: 230, height: 310 }, 16, 16],
    ['pickup-heal.png', { left: 850, top: 560, width: 245, height: 310 }, 16, 16],
    ['ui-heart.png', { left: 1160, top: 565, width: 230, height: 250 }, 16, 16],
    ['ui-pointer.png', { left: 1460, top: 565, width: 220, height: 250 }, 16, 16],
  ];
  for (const [name, region, width, height] of effects)
    await save(path.join(imageDir, name), await extractEffect(region, width, height));

  const contactItems = [
    {
      key: 'player-soul-guide',
      path: path.join(imageDir, 'player-soul-guide.png'),
      fw: 32,
      fh: 32,
      note: '8 directions / 9 columns',
    },
    {
      key: 'enemy-zombie',
      path: path.join(imageDir, 'enemy-zombie.png'),
      fw: 32,
      fh: 32,
      note: '8 directions / 6 columns',
    },
    {
      key: 'enemy-bat',
      path: path.join(imageDir, 'enemy-bat.png'),
      fw: 32,
      fh: 32,
      note: '8 directions / 6 columns',
    },
    {
      key: 'boss-graveyard-guardian',
      path: path.join(imageDir, 'boss-graveyard-guardian.png'),
      fw: 48,
      fh: 48,
      note: '8 directions / 6 columns',
    },
    {
      key: 'tileset-cemetery',
      path: path.join(imageDir, 'tileset-cemetery.png'),
      fw: 16,
      fh: 16,
      cropX: 16,
      note: 'tile 0 reserved empty',
    },
    {
      key: 'weapon-ghost-arrow',
      path: path.join(imageDir, 'weapon-ghost-arrow.png'),
      fw: 32,
      fh: 16,
      note: 'east-facing source frame',
    },
    {
      key: 'weapon-soul-blade',
      path: path.join(imageDir, 'weapon-soul-blade.png'),
      fw: 32,
      fh: 32,
      note: 'centered orbit sprite',
    },
    {
      key: 'vfx-death-aura',
      path: path.join(imageDir, 'vfx-death-aura.png'),
      fw: 32,
      fh: 32,
      note: '4-frame pulse',
    },
    {
      key: 'vfx-hit',
      path: path.join(imageDir, 'vfx-hit.png'),
      fw: 16,
      fh: 16,
      note: '4-frame spark',
    },
    {
      key: 'vfx-telegraph-line',
      path: path.join(imageDir, 'vfx-telegraph-line.png'),
      fw: 64,
      fh: 8,
      note: 'centered warning',
    },
    {
      key: 'vfx-telegraph-circle',
      path: path.join(imageDir, 'vfx-telegraph-circle.png'),
      fw: 32,
      fh: 32,
      note: 'centered warning',
    },
    {
      key: 'pickup-xp-gem',
      path: path.join(imageDir, 'pickup-xp-gem.png'),
      fw: 16,
      fh: 16,
      note: 'pickup',
    },
    {
      key: 'pickup-heal',
      path: path.join(imageDir, 'pickup-heal.png'),
      fw: 16,
      fh: 16,
      note: 'pickup',
    },
    {
      key: 'ui-heart',
      path: path.join(imageDir, 'ui-heart.png'),
      fw: 16,
      fh: 16,
      note: 'HUD icon',
    },
    {
      key: 'ui-pointer',
      path: path.join(imageDir, 'ui-pointer.png'),
      fw: 16,
      fh: 16,
      note: 'UI pointer',
    },
  ];
  const manifest = await writeManifest();
  const manifestByKey = new Map(manifest.images.map((asset) => [asset.key, asset]));
  await save(
    path.join(previewDir, 'player-soul-guide-contact-sheet.png'),
    await contactSheet(
      manifestByKey.get('player-soul-guide'),
      contactItems[0].path,
      'rows e,se,s,sw,w,nw,n,ne',
    ),
  );
  await save(
    path.join(previewDir, 'enemy-zombie-contact-sheet.png'),
    await contactSheet(
      manifestByKey.get('enemy-zombie'),
      contactItems[1].path,
      'idle/walk/hurt columns',
    ),
  );
  await save(
    path.join(previewDir, 'enemy-bat-contact-sheet.png'),
    await contactSheet(
      manifestByKey.get('enemy-bat'),
      contactItems[2].path,
      'idle/walk/hurt columns',
    ),
  );
  await save(
    path.join(previewDir, 'boss-graveyard-guardian-contact-sheet.png'),
    await contactSheet(
      manifestByKey.get('boss-graveyard-guardian'),
      contactItems[3].path,
      'idle/walk/hurt columns',
    ),
  );
  await save(
    path.join(previewDir, 'cemetery-vertical-slice-contact-sheet.png'),
    await montage(contactItems),
  );
  console.log(`Generated ${contactItems.length} contract assets and 5 contact sheets.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
