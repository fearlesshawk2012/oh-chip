// ============================================================
// SEAGULL RPG
// ============================================================

const SCALE    = 3;       // pixel scale factor (gives 16-bit feel)
const TILE     = 16;      // base tile size in pixels
const SPRITE_W = 32;      // sprite width (wide gliding seagull)
const W        = 320;     // logical canvas width
const H        = 240;     // logical canvas height
const WORLD_W  = W * 5;   // total world width (scrolls horizontally)

// Zone boundaries (top to bottom)
const SEA_END    = 160;   // sea fills 0–159
const BEACH_END  = 200;   // beach fills 160–199
                          // street fills 200–239

// Camera (horizontal scroll only)
const camera = { x: 0 };

const canvas = document.getElementById('game');
canvas.width  = W * SCALE;
canvas.height = H * SCALE;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// ============================================================
// SEAGULL SPRITE — hand-crafted pixel art (32x16 px)
// Wide gliding pose with outstretched wings
// Each row is a string: '.' = transparent, letters = colour key
// ============================================================
const PALETTE = {
  W: '#f0f0f0', // white body
  G: '#c8c8c8', // grey wing edge
  D: '#909090', // dark grey wing tip
  B: '#3a3a6a', // dark outline
  Y: '#f5c623', // yellow beak
  O: '#e0a010', // beak tip
  F: '#f5a623', // feet
  K: '#1a1a1a', // black tail / eye
  T: '#4a4a4a', // tail feather mid
  S: '#d0e8f8', // sky / light feather detail
  P: '#5ab34a', // pea green
  R: '#8B4513', // brown (pot)
};

// Bird's-eye seagull facing right: body centre, wings top/bottom, beak right, tail left
const SPRITE_RIGHT = [
  '...............BDB.............',
  '...............BGB.............',
  '..............BGDB.............',
  '..............BGDB.............',
  '.............BGDWB.............',
  '.............BGDWB.............',
  '............BGDWWB.............',
  '............BGDWWB.............',
  '...........BGDWWWB.............',
  '..........BGDWWWWB.............',
  '.KK..BGWWWWWWWWWWWWWWB.........',
  'KTKB.BGWWWWWBWWWWWWWWWYOB......',
  '.KK..BGWWWWWWWWWWWWWWB.........',
  '..........BGDWWWWBF............',
  '...........BGDWWWB.............',
  '............BGDWWB.............',
  '............BGDWWBF............',
  '.............BGDWB.............',
  '.............BGDWB.............',
  '..............BGDB.............',
  '..............BGDB.............',
  '...............BDB.............',
];

// Flap: wings swept back a bit
const SPRITE_FLAP = [
  '................................',
  '...............BDB.............',
  '...............BGB.............',
  '..............BGDB.............',
  '..............BGDB.............',
  '.............BGDWB.............',
  '.............BGDWWB............',
  '............BGDWWWB............',
  '...........BGDWWWWB............',
  '..........BGDWWWWWB............',
  '.KK..BGWWWWWWWWWWWWWWB.........',
  'KTKB.BGWWWWWBWWWWWWWWWYOB......',
  '.KK..BGWWWWWWWWWWWWWWB.........',
  '..........BGDWWWWWBF...........',
  '...........BGDWWWWB............',
  '............BGDWWWB............',
  '.............BGDWWBF...........',
  '.............BGDWB.............',
  '..............BGDB.............',
  '..............BGDB.............',
  '...............BDB.............',
  '................................',
];

// ============================================================
// DRAW SPRITE onto an offscreen canvas, return ImageBitmap-like
// ============================================================
function buildSprite(rows) {
  const sc = document.createElement('canvas');
  sc.width = rows[0].length;
  sc.height = rows.length;
  const sx = sc.getContext('2d');
  rows.forEach((row, y) => {
    row.split('').forEach((c, x) => {
      const col = PALETTE[c.toUpperCase()];
      if (col) {
        sx.fillStyle = col;
        sx.fillRect(x, y, 1, 1);
      }
    });
  });
  return sc;
}

const sprites = {
  glide: buildSprite(SPRITE_RIGHT),
  flap:  buildSprite(SPRITE_FLAP),
};

// ============================================================
// SEA BACKGROUND
// ============================================================
// We'll draw a simple animated sea using a few shades of blue
const SEA_COLOURS = [
  '#1a6ea8', '#1c78b8', '#1e80c4', '#2188cc',
  '#1a6ea8', '#1674b0', '#1c78b8', '#2080c0',
];

// Pre-build a sea tile (32x32 so waves look natural)
const SEA_TILE_SIZE = 32;
const seaTileCanvas = document.createElement('canvas');
seaTileCanvas.width  = SEA_TILE_SIZE;
seaTileCanvas.height = SEA_TILE_SIZE;
const stx = seaTileCanvas.getContext('2d');

function drawSeaTile(offset) {
  stx.clearRect(0, 0, SEA_TILE_SIZE, SEA_TILE_SIZE);
  for (let y = 0; y < SEA_TILE_SIZE; y++) {
    const colIdx = Math.floor((y + offset) / 4) % SEA_COLOURS.length;
    stx.fillStyle = SEA_COLOURS[colIdx];
    stx.fillRect(0, y, SEA_TILE_SIZE, 1);
  }
  // Sparkles / wave crests
  stx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i = 0; i < 3; i++) {
    const wx = (i * 11 + offset) % SEA_TILE_SIZE;
    const wy = (i * 7  + offset) % SEA_TILE_SIZE;
    stx.fillRect(wx, wy, 3, 1);
  }
}

function drawSea(waveOffset) {
  drawSeaTile(Math.floor(waveOffset));
  const pat = ctx.createPattern(seaTileCanvas, 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(camera.x, 0, W, SEA_END);

  // Foam edge where sea meets beach
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  const foamY = SEA_END - 2;
  for (let x = camera.x; x < camera.x + W; x += 6) {
    const wobble = Math.sin((x + waveOffset * 2) * 0.15) * 2;
    ctx.fillRect(x, foamY + wobble, 4, 2);
  }
}

// ============================================================
// BEACH
// ============================================================
function drawBeach() {
  // Base sand
  ctx.fillStyle = '#e8d5a3';
  ctx.fillRect(camera.x, SEA_END, W, BEACH_END - SEA_END);

  // Darker wet sand near the water
  ctx.fillStyle = '#c4aa70';
  ctx.fillRect(camera.x, SEA_END, W, 6);

  // Sand grain texture (deterministic dots spread across world)
  ctx.fillStyle = 'rgba(160,130,70,0.3)';
  for (let i = 0; i < 400; i++) {
    const sx = (i * 97 + 13) % WORLD_W;
    if (sx < camera.x - 2 || sx > camera.x + W + 2) continue;
    const sy = SEA_END + 8 + ((i * 53 + 7) % (BEACH_END - SEA_END - 10));
    ctx.fillRect(sx, sy, 1, 1);
  }

  // Pebbles spread across the world
  ctx.fillStyle = '#a09080';
  for (let i = 0; i < 20; i++) {
    const px = (i * 173 + 45) % WORLD_W;
    if (px < camera.x - 4 || px > camera.x + W + 4) continue;
    const py = SEA_END + 12 + ((i * 67 + 11) % 22);
    const pw = 2 + (i % 2);
    ctx.fillRect(px, py, pw, 2);
  }
}

// ============================================================
// PROMENADE / PAVEMENT
// ============================================================
// Promenade furniture — placed once across the whole world
const BENCHES = [];
for (let i = 0; i < 10; i++) {
  BENCHES.push((i * 157 + 60) % WORLD_W);
}
const BINS = [];
for (let i = 0; i < 6; i++) {
  BINS.push((i * 251 + 155) % WORLD_W);
}

function drawBench(x, y) {
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(x, y + 2, 20, 4);
  ctx.fillStyle = '#55341c';
  ctx.fillRect(x, y, 20, 2);
  ctx.fillStyle = '#444';
  ctx.fillRect(x + 1, y + 2, 1, 5);
  ctx.fillRect(x + 18, y + 2, 1, 5);
}

function drawStreet() {
  const pavY = BEACH_END;
  const pavH = H - BEACH_END;
  const vl = camera.x;       // visible left
  const vr = camera.x + W;   // visible right

  // Paving slabs base
  ctx.fillStyle = '#c8beb0';
  ctx.fillRect(vl, pavY, W, pavH);

  // Slab grid lines (lighter grout) — only draw visible ones
  ctx.fillStyle = '#d6cfc2';
  const firstSlab = Math.floor(vl / 16) * 16;
  for (let x = firstSlab; x <= vr; x += 16) {
    ctx.fillRect(x, pavY, 1, pavH);
  }
  for (let y = pavY; y < H; y += 16) {
    ctx.fillRect(vl, y, W, 1);
  }

  // Subtle slab colour variation
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  for (let i = 0; i < 100; i++) {
    const sx = ((i * 73 + 5) % Math.ceil(WORLD_W / 16)) * 16;
    if (sx < vl - 16 || sx > vr + 16) continue;
    const sy = pavY + ((i * 37) % 2) * 16;
    ctx.fillRect(sx, sy, 16, 16);
  }

  // Low sea wall / kerb along the beach edge
  ctx.fillStyle = '#9a918a';
  ctx.fillRect(vl, pavY, W, 3);
  ctx.fillStyle = '#b0a89e';
  ctx.fillRect(vl, pavY, W, 1);

  // Benches
  for (const bx of BENCHES) {
    if (bx > vl - 24 && bx < vr + 4) {
      drawBench(bx, pavY + 8);
    }
  }

  // Bins
  for (const bx of BINS) {
    if (bx > vl - 8 && bx < vr + 4) {
      ctx.fillStyle = '#3a5a3a';
      ctx.fillRect(bx, pavY + 8, 6, 8);
      ctx.fillStyle = '#2a4a2a';
      ctx.fillRect(bx, pavY + 8, 6, 2);
    }
  }

  // Railing along the bottom edge
  ctx.fillStyle = '#707070';
  ctx.fillRect(vl, H - 3, W, 1);
  const firstPost = Math.floor(vl / 12) * 12 + 8;
  for (let x = firstPost; x < vr; x += 12) {
    ctx.fillRect(x, H - 6, 1, 6);
  }
}

// ============================================================
// SOUND
// ============================================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Seagull cry — synthesised with Web Audio API
function squawk() {
  const now = audioCtx.currentTime;
  const duration = 0.3 + Math.random() * 0.25;

  // Main tone — a rising then falling sweep
  const osc = audioCtx.createOscillator();
  osc.type = 'sawtooth';
  const startFreq = 900 + Math.random() * 300;
  const peakFreq  = 1600 + Math.random() * 400;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.linearRampToValueAtTime(peakFreq, now + duration * 0.4);
  osc.frequency.linearRampToValueAtTime(startFreq * 0.8, now + duration);

  // Vibrato for that warbling seagull quality
  const vibrato = audioCtx.createOscillator();
  const vibratoGain = audioCtx.createGain();
  vibrato.frequency.value = 20 + Math.random() * 15;
  vibratoGain.gain.value = 150 + Math.random() * 100;
  vibrato.connect(vibratoGain);
  vibratoGain.connect(osc.frequency);

  // Shape the volume envelope
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
  gain.gain.setValueAtTime(0.15, now + duration * 0.5);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  // Bandpass to make it sound less synthy
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2400;
  filter.Q.value = 2;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  vibrato.start(now);
  osc.stop(now + duration);
  vibrato.stop(now + duration);
}

function speakIncoming() {
  // Resume audio context (browsers require user gesture)
  if (audioCtx.state === 'suspended') audioCtx.resume();
  squawk();
}

// Speech synthesis for people only
function speak(text, pitch, rate) {
  const u = new SpeechSynthesisUtterance(text);
  u.pitch  = pitch || 1;
  u.rate   = rate  || 1;
  u.volume = 0.8;
  speechSynthesis.speak(u);
}

const HIT_PHRASES = [
  'why thank you',
  'by jove!',
  'by jove!',
  'oh my!',
  'well I never!',
  'good heavens!',
  'charming!',
];

function speakHit(person) {
  const phrase = HIT_PHRASES[Math.floor(Math.random() * HIT_PHRASES.length)];
  speak(phrase, person.voicePitch, person.voiceRate);
}

// ============================================================
// PEOPLE
// ============================================================
const SHIRT_COLOURS = [
  '#e04040', '#4080e0', '#e0a020', '#40b040',
  '#d060c0', '#40c8c8', '#f07030', '#8060d0',
];
const SKIN_TONES = ['#f5c8a0', '#d4a06a', '#8d5e3c', '#f0d0b0'];
const HAIR_COLOURS = ['#2a1a0a', '#6b3a1a', '#d4a030', '#e0c880', '#888', '#c04020'];

const people = [];
function spawnPeople() {
  // Beach people (sitting on towels, sunbathing)
  for (let i = 0; i < 25; i++) {
    const x = (i * 193 + 37) % WORLD_W;
    const y = SEA_END + 10 + ((i * 71 + 13) % 24);
    people.push({
      x, y,
      shirt: SHIRT_COLOURS[i % SHIRT_COLOURS.length],
      skin:  SKIN_TONES[i % SKIN_TONES.length],
      zone: 'beach',
      sitting: true,
      hit: false,
      hitTimer: 0,
      towelColour: SHIRT_COLOURS[(i + 3) % SHIRT_COLOURS.length],
      hairColour: HAIR_COLOURS[i % HAIR_COLOURS.length],
      voicePitch: 0.6 + (i * 31 % 100) / 100 * 1.2,  // 0.6–1.8
      voiceRate:  0.8 + (i * 47 % 100) / 100 * 0.6,   // 0.8–1.4
    });
  }
  // Promenade people (some standing, some walking, some with chips)
  for (let i = 0; i < 20; i++) {
    const x = (i * 211 + 80) % WORLD_W;
    const y = BEACH_END + 8 + ((i * 59 + 3) % 24);
    const walking = i % 3 !== 0;  // 2/3 of prom people walk
    const dir = (i % 2 === 0) ? 1 : -1;
    const chips = !walking && (i % 3 === 0);  // standing people sometimes have chips
    people.push({
      x, y,
      shirt: SHIRT_COLOURS[(i + 4) % SHIRT_COLOURS.length],
      skin:  SKIN_TONES[(i + 1) % SKIN_TONES.length],
      zone: 'prom',
      sitting: false,
      hit: false,
      hitTimer: 0,
      hairColour: HAIR_COLOURS[(i + 3) % HAIR_COLOURS.length],
      voicePitch: 0.6 + ((i + 5) * 31 % 100) / 100 * 1.2,
      voiceRate:  0.8 + ((i + 5) * 47 % 100) / 100 * 0.6,
      walkSpeed: walking ? (0.05 + (i * 17 % 100) / 100 * 0.1) * dir : 0,
      hasChips: chips,
    });
  }
  // A few beach walkers along the shore
  for (let i = 0; i < 8; i++) {
    const x = (i * 283 + 120) % WORLD_W;
    const y = SEA_END + 4 + ((i * 41) % 8);
    const dir = (i % 2 === 0) ? 1 : -1;
    people.push({
      x, y,
      shirt: SHIRT_COLOURS[(i + 2) % SHIRT_COLOURS.length],
      skin:  SKIN_TONES[(i + 2) % SKIN_TONES.length],
      zone: 'beach',
      sitting: false,
      hit: false,
      hitTimer: 0,
      hairColour: HAIR_COLOURS[(i + 1) % HAIR_COLOURS.length],
      voicePitch: 0.6 + ((i + 8) * 31 % 100) / 100 * 1.2,
      voiceRate:  0.8 + ((i + 8) * 47 % 100) / 100 * 0.6,
      walkSpeed: (0.03 + (i * 23 % 100) / 100 * 0.08) * dir,
    });
  }
  // Special NPCs: kite flyer on the beach
  people.push({
    x: 400, y: SEA_END + 20,
    shirt: '#e06030', skin: '#d4a574', zone: 'beach',
    sitting: false, hit: false, hitTimer: 0,
    hairColour: '#4a2a1a',
    voicePitch: 0.9, voiceRate: 1.0,
    walkSpeed: 0,
    hasKite: true,
    kiteAngle: 0,
  });
  people.push({
    x: 1100, y: SEA_END + 18,
    shirt: '#3070c0', skin: '#c09060', zone: 'beach',
    sitting: false, hit: false, hitTimer: 0,
    hairColour: '#1a1a1a',
    voicePitch: 1.1, voiceRate: 1.0,
    walkSpeed: 0,
    hasKite: true,
    kiteAngle: 0,
  });

  // Special NPCs: drone flyer on the promenade
  people.push({
    x: 700, y: BEACH_END + 12,
    shirt: '#2a2a2a', skin: '#e0b090', zone: 'prom',
    sitting: false, hit: false, hitTimer: 0,
    hairColour: '#5a3a1a',
    voicePitch: 0.7, voiceRate: 0.9,
    walkSpeed: 0,
    hasDrone: true,
    droneOffset: 0,
  });
  people.push({
    x: 1350, y: BEACH_END + 16,
    shirt: '#606060', skin: '#c4956a', zone: 'prom',
    sitting: false, hit: false, hitTimer: 0,
    hairColour: '#8a5a2a',
    voicePitch: 1.3, voiceRate: 1.1,
    walkSpeed: 0,
    hasDrone: true,
    droneOffset: Math.PI,
  });
}
spawnPeople();

function drawPerson(p) {
  if (p.drowned) return;
  if (p.x < camera.x - 12 || p.x > camera.x + W + 12) return;

  // Clip when sinking into water
  const sink = p.sinkAmount || 0;
  if (sink > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(camera.x - 20, p.y - 20 - sink, W + 40, 20 + sink);
    ctx.clip();
  }

  if (p.sitting) {
    // Beach towel
    ctx.fillStyle = p.towelColour;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(Math.round(p.x) - 5, Math.round(p.y) - 2, 12, 8);
    ctx.globalAlpha = 1;
  }

  // Rock pile next to standing/walking people
  if (!p.sitting && !p.panicking && !p.drowned) {
    const rx = Math.round(p.x);
    const ry = Math.round(p.y);
    ctx.fillStyle = '#777';
    ctx.fillRect(rx + 4, ry + 3, 4, 3);
    ctx.fillStyle = '#888';
    ctx.fillRect(rx + 3, ry + 2, 3, 2);
    ctx.fillStyle = '#999';
    ctx.fillRect(rx + 6, ry + 2, 2, 2);
  }

  // Body (top-down oval) — rotated to face walk/panic direction
  let facing;
  if (p.panicking) {
    facing = Math.PI;  // face upward (toward sea)
  } else if (p.walkSpeed > 0) {
    facing = -Math.PI / 2;
  } else if (p.walkSpeed < 0) {
    facing = Math.PI / 2;
  } else {
    facing = 0;  // standing faces "down"
  }

  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y));
  ctx.rotate(facing);

  // Walk cycle
  const isMoving = (p.walkSpeed || p.panicking) && !p.sitting;
  const animSpeed = p.panicking ? 0.3 : 0.15 * Math.abs(p.walkSpeed) * 10;
  const stride = isMoving ? Math.round(Math.sin(frame * animSpeed) * 2) : 0;

  const throwing = p.throwTimer > 0;

  if (p.sitting) {
    // Sitting: legs out in front, body, head on top
    // Legs (two stumps below body)
    ctx.fillStyle = p.skin;
    ctx.fillRect(-2, 4, 2, 2);
    ctx.fillRect(1, 4, 2, 2);

    // Torso (round from above — shoulders visible)
    ctx.fillStyle = p.shirt;
    ctx.fillRect(-3, -2, 7, 5);
    ctx.fillRect(-4, -1, 9, 3);

    // Head (circle on top)
    ctx.fillStyle = p.skin;
    ctx.fillRect(-2, -5, 5, 4);
    // Hair
    ctx.fillStyle = p.hairColour;
    ctx.fillRect(-2, -6, 5, 2);
  } else {
    // Bird's-eye standing/walking person
    // Legs (alternating stride sideways from body)
    ctx.fillStyle = '#2a2a5a';
    ctx.fillRect(-2 + stride, 4, 2, 3);
    ctx.fillRect(1 - stride, 4, 2, 3);

    // Shoes
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(-2 + stride, 6, 2, 1);
    ctx.fillRect(1 - stride, 6, 2, 1);

    // Torso / shoulders (wider rectangle from above)
    ctx.fillStyle = p.shirt;
    ctx.fillRect(-4, -2, 9, 5);
    ctx.fillRect(-3, -3, 7, 7);

    // Arms (swing opposite to legs)
    ctx.fillStyle = p.skin;
    if (throwing) {
      const windUp = p.throwTimer > 10;
      ctx.fillRect(-5, 0 - stride, 2, 2);
      ctx.fillRect(4, windUp ? -4 : 0, 2, 2);
      if (windUp) {
        ctx.fillStyle = '#777';
        ctx.fillRect(5, -5, 3, 3);
      }
    } else {
      ctx.fillRect(-5, 0 - stride, 2, 2);
      ctx.fillRect(4, 0 + stride, 2, 2);
    }

    // Head (round, on top of shoulders)
    ctx.fillStyle = p.skin;
    ctx.fillRect(-2, -6, 5, 4);
    ctx.fillRect(-3, -5, 7, 2);

    // Hair (top of head)
    ctx.fillStyle = p.hairColour;
    ctx.fillRect(-2, -7, 5, 2);
    ctx.fillRect(-3, -6, 7, 1);
  }

  ctx.restore();

  // Chips in hand + thought bubble
  if (p.hasChips && !p.hit) {
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    // Chip cone in hand
    ctx.fillStyle = '#f5e6c8';
    ctx.fillRect(px + 5, py - 2, 3, 5);
    ctx.fillStyle = '#e8c840';
    ctx.fillRect(px + 4, py - 4, 2, 3);
    ctx.fillRect(px + 6, py - 5, 2, 3);
    ctx.fillRect(px + 5, py - 3, 2, 2);
    // Thought bubble: "Yum!"
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 8, py - 16, 20, 8);
    ctx.fillRect(px - 7, py - 17, 18, 10);
    // Bubble tail dots
    ctx.fillRect(px + 1, py - 8, 2, 2);
    ctx.fillRect(px + 3, py - 10, 1, 1);
    // Text
    ctx.fillStyle = '#222';
    ctx.font = '4px monospace';
    ctx.fillText('Yum!', px - 5, py - 11);
  }

  // Poop splat on them
  if (p.hit) {
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    ctx.fillStyle = '#f0f0e0';
    ctx.fillRect(px - 3, py - 3, 6, 4);
    ctx.fillStyle = '#5a4530';
    ctx.fillRect(px - 1, py - 2, 3, 2);
  }

  // Reaction above head
  if (p.hitTimer > 0) {
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    if (p.chipRemark) {
      // Speech bubble with remark
      const text = p.chipRemark;
      const tw = text.length * 3 + 6;
      ctx.fillStyle = '#fff';
      ctx.fillRect(px - tw / 2, py - 18, tw, 8);
      ctx.fillStyle = '#222';
      ctx.font = '4px monospace';
      ctx.fillText(text, px - tw / 2 + 3, py - 12);
    } else {
      ctx.fillStyle = '#ff0000';
      ctx.font = '5px monospace';
      ctx.fillText('!', px - 1, py - 10);
    }
  }

  // Close sink clip
  if (sink > 0) ctx.restore();
}

function drawPeople() {
  for (const p of people) {
    drawPerson(p);
  }
  // Draw kites and drones in the sky
  for (const p of people) {
    if (p.drowned || p.panicking) continue;
    if (p.x < camera.x - 60 || p.x > camera.x + W + 60) continue;
    const px = p.x - camera.x;

    if (p.hasKite && !p.hit) {
      // Kite string from person up into the sky
      const kx = px + Math.sin(p.kiteAngle) * 20;
      const ky = 30 + Math.sin(p.kiteAngle * 0.7) * 10;
      // String
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(px, p.y - 4);
      ctx.lineTo(kx, ky);
      ctx.stroke();
      // Kite diamond shape
      ctx.fillStyle = '#e03030';
      ctx.beginPath();
      ctx.moveTo(kx, ky - 6);
      ctx.lineTo(kx + 5, ky);
      ctx.lineTo(kx, ky + 6);
      ctx.lineTo(kx - 5, ky);
      ctx.closePath();
      ctx.fill();
      // Cross pattern
      ctx.fillStyle = '#f5c623';
      ctx.fillRect(kx - 0.5, ky - 5, 1, 10);
      ctx.fillRect(kx - 4, ky - 0.5, 8, 1);
      // Tail ribbons
      ctx.strokeStyle = '#3a3a6a';
      ctx.beginPath();
      ctx.moveTo(kx, ky + 6);
      ctx.lineTo(kx - 3, ky + 12 + Math.sin(p.kiteAngle * 2) * 2);
      ctx.lineTo(kx + 1, ky + 16 + Math.sin(p.kiteAngle * 2 + 1) * 2);
      ctx.stroke();
      // Store kite position for collision
      p.kiteX = kx + camera.x;
      p.kiteY = ky;
    }

    if (p.hasDrone && !p.hit) {
      // Drone hovers above the person in a figure-8 pattern
      const dx = px + Math.sin(p.droneOffset) * 25;
      const dy = 50 + Math.cos(p.droneOffset * 0.5) * 15;
      // Drone body
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(dx - 4, dy - 1, 8, 3);
      // Arms
      ctx.fillStyle = '#555';
      ctx.fillRect(dx - 7, dy - 1, 3, 1);
      ctx.fillRect(dx + 4, dy - 1, 3, 1);
      // Rotors (spinning)
      const spin = (frame % 4 < 2);
      ctx.fillStyle = '#888';
      if (spin) {
        ctx.fillRect(dx - 9, dy - 2, 5, 1);
        ctx.fillRect(dx + 4, dy - 2, 5, 1);
      } else {
        ctx.fillRect(dx - 8, dy - 2, 3, 1);
        ctx.fillRect(dx + 5, dy - 2, 3, 1);
      }
      // Red light
      ctx.fillStyle = frame % 30 < 15 ? '#e03030' : '#600';
      ctx.fillRect(dx, dy + 1, 1, 1);
      // Store drone position for collision
      p.droneX = dx + camera.x;
      p.droneY = dy;
    }
  }
}

function updatePeople() {
  for (const p of people) {
    if (p.hitTimer > 0) p.hitTimer--;
    if (p.throwTimer > 0) p.throwTimer--;

    if (p.drowned) continue;

    // Wading — slowly sink
    if (p.wading) {
      p.sinkAmount = (p.sinkAmount || 0) + 0.05;
      p.y += p.panicSpeed;
    }

    // Panicking — run toward the sea
    if (p.panicking) {
      p.y += p.panicSpeed;
      p.x += p.walkSpeed;
      p.sitting = false;

      // Reached the water — start wading in
      if (p.y <= SEA_END && !p.wading) {
        p.wading = true;
        p.panicSpeed = -0.15;  // slow wade
        p.walkSpeed = 0;
      }

      // Fully submerged — remove
      if (p.wading && p.sinkAmount >= 12) {
        p.drowned = true;
        p.panicSpeed = 0;
      }
    } else if (p.walkSpeed) {
      // Normal walking
      p.x += p.walkSpeed;
      // Wrap around the world
      if (p.x > WORLD_W + 10) p.x = -10;
      if (p.x < -10) p.x = WORLD_W + 10;
    }

    // Animate kite
    if (p.hasKite && !p.hit) {
      p.kiteAngle += 0.03;
    }
    // Animate drone
    if (p.hasDrone && !p.hit) {
      p.droneOffset += 0.04;
    }
  }

  // Kite & drone collision with player
  if (!player.falling && !player.dead && player.spinTimer <= 0) {
    const gx = player.x + SPRITE_W / 2;
    const gy = player.y + TILE / 2;
    for (const p of people) {
      if (p.drowned || p.hit) continue;

      if (p.hasKite && p.kiteX != null) {
        const dx = gx - p.kiteX;
        const dy = gy - p.kiteY;
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
          player.hits += 2;
          player.spinTimer = 50;
          p.hit = true;
          p.hitTimer = 120;
          speak('My kite!', p.voicePitch, p.voiceRate);
          squawk();
          if (player.hits >= 3) {
            player.falling = true;
            player.fallVy = 0;
          }
        }
      }

      if (p.hasDrone && p.droneX != null) {
        const dx = gx - p.droneX;
        const dy = gy - p.droneY;
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
          player.hits += 1;
          player.spinTimer = 40;
          p.hit = true;
          p.hitTimer = 120;
          speak('My drone!', p.voicePitch, p.voiceRate);
          squawk();
          if (player.hits >= 3) {
            player.falling = true;
            player.fallVy = 0;
          }
        }
      }
    }
  }
}

// ============================================================
// POOP SYSTEM
// ============================================================
const poops = [];   // active falling poops
const splats = [];  // landed splats (persistent)

function spawnPoop() {
  const cx = player.x + SPRITE_W / 2;
  const cy = player.y + TILE / 2;

  // Work out where this poop will land based on gull height
  let ground;
  if (cy >= BEACH_END) {
    ground = H - 4;                         // over promenade
  } else if (cy >= SEA_END) {
    ground = BEACH_END - 2;                 // over beach
  } else {
    // Over sea — closer to shore = lands further onto land
    // cy 0 (top) → lands on sea surface, cy near SEA_END → lands on promenade
    const t = cy / SEA_END;                 // 0 at top, 1 at shore
    const seaSurface = SEA_END - 1;
    const deepLand   = H - 4;
    ground = seaSurface + (deepLand - seaSurface) * t * t;
  }

  const homing = player.chipPoops > 0;
  if (homing) player.chipPoops--;

  poops.push({ x: cx, y: cy, vy: 0, ground: ground, homing: homing, vx: 0 });
  speakIncoming();
}

function updatePoops() {
  for (let i = poops.length - 1; i >= 0; i--) {
    const p = poops[i];
    p.vy += 0.15;        // gravity
    p.y  += p.vy;

    // Homing: steer toward nearest person
    if (p.homing) {
      let nearest = null;
      let nearDist = Infinity;
      for (const person of people) {
        if (person.drowned || person.panicking) continue;
        const dx = person.x - p.x;
        const dy = person.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearDist) { nearDist = d; nearest = person; }
      }
      if (nearest) {
        const dx = nearest.x - p.x;
        p.vx = (p.vx || 0) + dx * 0.02;
        p.vx *= 0.9;
      }
    }
    p.x += (p.vx || 0);

    if (p.y >= p.ground) {
      const sz = p.ground >= BEACH_END ? 3 + Math.random() * 2 : 2 + Math.random() * 2;
      splats.push({ x: p.x, y: p.ground, size: sz, angle: Math.random() * Math.PI });

      // Check if we hit anyone
      for (const person of people) {
        const dx = p.x - person.x;
        const dy = p.ground - person.y;
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
          person.hit = true;
          person.hitTimer = 90;  // frames to show "!"
          score += 67;
          // Panic and run toward the sea
          if (!person.panicking) {
            person.panicking = true;
            person.panicSpeed = -(0.4 + Math.random() * 0.4); // run upward (toward sea)
            person.origWalkSpeed = person.walkSpeed;
            person.walkSpeed = (Math.random() < 0.5 ? 1 : -1) * (0.2 + Math.random() * 0.2); // also run sideways a bit
          }
          speakHit(person);
        }
      }

      poops.splice(i, 1);
    }
  }
}

function drawPoops() {
  // Falling poops (pixel art blob)
  for (const p of poops) {
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    ctx.fillStyle = p.homing ? '#e8c840' : '#f0f0e0';
    ctx.fillRect(px - 2, py - 1, 4, 3);
    ctx.fillRect(px - 1, py - 2, 2, 1);
    ctx.fillStyle = p.homing ? '#c8a020' : '#4a3a2a';
    ctx.fillRect(px - 1, py, 2, 1);
    // Homing glow
    if (p.homing && frame % 4 < 2) {
      ctx.fillStyle = 'rgba(232,200,64,0.4)';
      ctx.fillRect(px - 3, py - 2, 6, 5);
    }
  }

  // Splats (pixel art)
  for (const s of splats) {
    if (s.x < camera.x - 10 || s.x > camera.x + W + 10) continue;
    const px = Math.round(s.x);
    const py = Math.round(s.y);
    const sz = Math.round(s.size);
    // White outer splat
    ctx.fillStyle = '#f0f0e0';
    ctx.fillRect(px - sz, py - 1, sz * 2, 3);
    ctx.fillRect(px - sz + 1, py - 2, sz * 2 - 2, 1);
    ctx.fillRect(px - sz + 1, py + 2, sz * 2 - 2, 1);
    // Drip pixels
    ctx.fillRect(px - sz - 1, py, 1, 1);
    ctx.fillRect(px + sz, py, 1, 1);
    // Brown centre
    ctx.fillStyle = '#5a4530';
    ctx.fillRect(px - 1, py - 1, 3, 2);
    // Dark speck
    ctx.fillStyle = '#2a1a0a';
    ctx.fillRect(px, py, 1, 1);
  }
}

// ============================================================
// STONES (thrown by people at the seagull)
// ============================================================
const stones = [];

function spawnStone(person, tx, ty) {
  const dx = tx - person.x;
  const dy = ty - person.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return;
  const speed = 1.5;
  stones.push({
    x: person.x,
    y: person.y - 4,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
    age: 0,
  });
  // Trigger throw animation
  person.throwTimer = 20;
}

function updateStones() {
  const gx = player.x + SPRITE_W / 2;
  const gy = player.y + TILE / 2;

  for (let i = stones.length - 1; i >= 0; i--) {
    const s = stones[i];
    s.x += s.vx;
    s.y += s.vy;
    s.vy -= 0.005; // slight arc upward
    s.age++;

    // Hit the player seagull?
    const dx = s.x - gx;
    const dy = s.y - gy;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 8 && !player.falling) {
      player.hits++;
      player.spinTimer = 40;
      stones.splice(i, 1);
      if (player.hits >= 3) {
        player.falling = true;
        player.fallVy = 0;
      }
      continue;
    }

    // Hit an NPC seagull?
    let hitNpc = false;
    for (const npc of npcGulls) {
      if (npc.dead || npc.falling) continue;
      const ndx = s.x - npc.x;
      const ndy = s.y - npc.y;
      if (Math.abs(ndx) < 10 && Math.abs(ndy) < 8) {
        npc.hits++;
        npc.spinTimer = 40;
        if (npc.hits >= 3) {
          npc.falling = true;
          npc.fallVy = 0;
          npc.phrase = 'AAAARGH!';
          npc.phraseTimer = 60;
          squawk();
        }
        hitNpc = true;
        break;
      }
    }
    if (hitNpc) { stones.splice(i, 1); continue; }

    // Miss — stone flies off screen or too old
    if (s.age > 180 || s.y < -20 || s.y > H + 20) {
      stones.splice(i, 1);
    }
  }
}

function drawStones() {
  for (const s of stones) {
    const px = Math.round(s.x);
    const py = Math.round(s.y);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(px - 3, py + 2, 7, 3);
    // Stone body
    ctx.fillStyle = '#666';
    ctx.fillRect(px - 3, py - 2, 7, 5);
    ctx.fillRect(px - 4, py - 1, 9, 3);
    // Highlight
    ctx.fillStyle = '#999';
    ctx.fillRect(px - 2, py - 2, 3, 2);
    // Dark edge
    ctx.fillStyle = '#444';
    ctx.fillRect(px + 2, py + 1, 2, 2);
  }
}

// People throw stones at nearby seagulls (player + NPCs)
function maybeThrowStones() {
  // Build list of all targetable gulls
  const targets = [];
  if (!player.falling && !player.dead) {
    targets.push({ x: player.x + SPRITE_W / 2, y: player.y + TILE / 2 });
  }
  for (const npc of npcGulls) {
    if (!npc.dead && !npc.falling) {
      targets.push({ x: npc.x, y: npc.y });
    }
  }
  if (targets.length === 0) return;

  for (const p of people) {
    if (p.drowned || p.panicking || p.sitting) continue;
    // Find closest gull
    let closest = null;
    let bestDist = Infinity;
    for (const t of targets) {
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; closest = t; }
    }
    // Only throw if gull is somewhat close and above them
    if (bestDist < 100 && closest.y < p.y && Math.random() < 0.0008) {
      spawnStone(p, closest.x, closest.y);
    }
  }
}

// ============================================================
// NPC SEAGULLS
// ============================================================
const NPC_PHRASES = [
  "Nice hat, mate",
  "Bit windy innit",
  "I once pooped on a mayor",
  "Chip?",
  "Watch out for the stones",
  "You call that a dive bomb?",
  "They think we're all the same",
  "My cousin works at the pier",
  "I've seen better aim from a pigeon",
  "Top hat? Bit posh for round here",
  "That bloke's got chips, just saying",
  "Ever tried a bin? Five stars",
  "I'm not saying it was me... but it was me",
  "The early bird gets the chip",
];

function makeNpcGull(baseX, baseY, bobOffset) {
  return {
    x: baseX, y: baseY,
    baseX, baseY,
    angle: 0,
    bobOffset,
    phrase: '',
    phraseTimer: 0,
    cooldown: 0,
    flapPhase: false,
    flapTimer: 0,
    hits: 0,
    spinTimer: 0,
    falling: false,
    fallVy: 0,
    dead: false,
    voicePitch: 1.4 + bobOffset * 0.2,
    voiceRate: 1.2 + bobOffset * 0.1,
  };
}

const npcGulls = [
  makeNpcGull(400, 40, 0),
  makeNpcGull(900, 70, Math.PI * 0.7),
  makeNpcGull(1300, 30, Math.PI * 1.3),
];

function updateNpcGulls() {
  const gx = player.x + SPRITE_W / 2;
  const gy = player.y + TILE / 2;

  for (const npc of npcGulls) {
    if (npc.dead) continue;

    // Falling into sea
    if (npc.falling) {
      npc.fallVy += 0.05;
      npc.y += npc.fallVy;
      npc.angle += 0.2;
      if (npc.y > SEA_END) {
        npc.dead = true;
      }
      continue;
    }

    // Spin from stone hit
    if (npc.spinTimer > 0) {
      npc.angle += 0.3;
      npc.spinTimer--;
    } else {
      // Gentle drift around base position
      npc.x = npc.baseX + Math.sin(frame * 0.008 + npc.bobOffset) * 30;
      npc.y = npc.baseY + Math.cos(frame * 0.012 + npc.bobOffset) * 10;

      // Face toward drift direction
      const driftDx = Math.cos(frame * 0.008 + npc.bobOffset);
      npc.angle = lerpAngle(npc.angle, driftDx > 0 ? 0 : Math.PI, 0.05);
    }

    // Flap wings
    npc.flapTimer++;
    if (npc.flapTimer >= 25) {
      npc.flapTimer = 0;
      npc.flapPhase = !npc.flapPhase;
    }

    // Cooldown
    if (npc.cooldown > 0) npc.cooldown--;
    if (npc.phraseTimer > 0) npc.phraseTimer--;

    // Say something when player is close
    const dx = gx - npc.x;
    const dy = gy - npc.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 60 && npc.cooldown <= 0 && npc.phraseTimer <= 0 && npc.spinTimer <= 0) {
      npc.phrase = NPC_PHRASES[Math.floor(Math.random() * NPC_PHRASES.length)];
      npc.phraseTimer = 180;
      npc.cooldown = 360;
      // Say it out loud with a seagull-ish voice
      speak(npc.phrase, npc.voicePitch, npc.voiceRate);
    }
  }
}

function drawNpcGulls() {
  for (const npc of npcGulls) {
    if (npc.dead) continue;
    if (npc.x < camera.x - 40 || npc.x > camera.x + W + 40) continue;

    const nx = Math.round(npc.x);
    const ny = Math.round(npc.y);
    const bobY = Math.round(Math.sin(frame * 0.05 + npc.bobOffset));

    // Shadow (pixel art)
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(nx - 10, ny + 7, 20, 3);

    // Sprite
    const spr = npc.flapPhase ? getActiveSprites().flap : getActiveSprites().glide;
    ctx.save();
    ctx.translate(nx, ny + bobY);
    ctx.rotate(npc.angle);
    ctx.drawImage(spr, -SPRITE_W / 2, -TILE / 2);
    ctx.restore();

    // Speech bubble
    if (npc.phraseTimer > 0) {
      const text = npc.phrase;
      const tw = text.length * 3.5 + 8;
      const bx = npc.x - tw / 2;
      const by = npc.y - 18;

      // Bubble background
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(bx + 2, by);
      ctx.lineTo(bx + tw - 2, by);
      ctx.quadraticCurveTo(bx + tw, by, bx + tw, by + 2);
      ctx.lineTo(bx + tw, by + 10);
      ctx.quadraticCurveTo(bx + tw, by + 12, bx + tw - 2, by + 12);
      // Little tail
      ctx.lineTo(npc.x + 3, by + 12);
      ctx.lineTo(npc.x, by + 15);
      ctx.lineTo(npc.x - 2, by + 12);
      ctx.lineTo(bx + 2, by + 12);
      ctx.quadraticCurveTo(bx, by + 12, bx, by + 10);
      ctx.lineTo(bx, by + 2);
      ctx.quadraticCurveTo(bx, by, bx + 2, by);
      ctx.fill();

      // Border
      ctx.strokeStyle = '#3a3a6a';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Text
      ctx.fillStyle = '#222';
      ctx.font = '4px monospace';
      ctx.fillText(text, bx + 4, by + 8);
    }
  }
}

// ============================================================
// PLAYER
// ============================================================
const player = {
  x: W / 2 - SPRITE_W / 2,
  y: H / 2 - TILE / 2,
  speed: 2,
  angle: 0,        // radians, 0 = pointing right
  moving: false,
  flapTimer: 0,
  flapInterval: 20, // frames between flap toggle
  flapPhase: false,
  hits: 0,           // stone hits taken
  spinTimer: 0,      // frames of spin remaining
  falling: false,     // falling into sea
  fallVy: 0,
  dead: false,
  // Dive
  diving: false,
  diveY: 0,          // y position when dive started
  diveVx: 0,
  diveVy: 0,
  diveTimer: 0,
  // Chip power-up
  chipPoops: 0,       // homing poops remaining
};

// ============================================================
// INPUT
// ============================================================
const keys = {};
let poopCooldown = 0;
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ' && poopCooldown <= 0 && !player.falling && !player.dead && player.spinTimer <= 0 && !player.diving) {
    spawnPoop();
    poopCooldown = 15; // frames between poops
  }
  if (e.key === 'x' && !player.diving && !player.falling && !player.dead && player.spinTimer <= 0) {
    const DIVE_DIST = 80;     // fixed dive distance in pixels
    player.diving = true;
    player.diveRising = false;
    player.diveY = player.y;  // remember starting height
    player.diveTarget = player.y + DIVE_DIST;  // dive down fixed distance
    player.diveVx = Math.cos(player.angle) * 1.5;
    player.diveVy = 1.5;
    player.diveTimer = 0;
  }
  if (e.key === 'Escape' && gameState === 'playing' && !player.dead) {
    wallet += score;
    player.dead = true;
  }
  e.preventDefault();
});
window.addEventListener('keyup', e => {
  keys[e.key] = false;
});

function lerpAngle(from, to, t) {
  let diff = to - from;
  // Wrap to [-PI, PI]
  while (diff > Math.PI)  diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

function handleInput() {
  let dx = 0, dy = 0;

  if (keys['ArrowLeft']  || keys['a']) dx -= player.speed;
  if (keys['ArrowRight'] || keys['d']) dx += player.speed;
  if (keys['ArrowUp']    || keys['w']) dy -= player.speed;
  if (keys['ArrowDown']  || keys['s']) dy += player.speed;

  // Diagonal normalisation
  if (dx !== 0 && dy !== 0) {
    dx *= 0.707;
    dy *= 0.707;
  }

  player.x += dx;
  player.y += dy;

  // Clamp to world bounds
  const margin = SPRITE_W / 2;
  player.x = Math.max(-margin, Math.min(WORLD_W - margin, player.x));
  player.y = Math.max(-margin, Math.min(H - margin, player.y));

  player.moving = (dx !== 0 || dy !== 0);

  // Smoothly rotate toward movement direction
  if (player.moving) {
    const target = Math.atan2(dy, dx);
    player.angle = lerpAngle(player.angle, target, 0.15);
  }
}

// ============================================================
// GAME LOOP
// ============================================================
let frame = 0;
let score = 0;
let wallet = 0;
let gameState = 'title'; // 'title', 'playing', 'tutorial', or 'shop'
let tutorialPage = 0;
let activeSkin = 'default';
const ownedSkins = { default: true };

// ============================================================
// ALTERNATE SKINS (pixel art sprites, same 32x22 format)
// ============================================================
const SKIN_REALISTIC = [
  '...............BDB.............',
  '...............BGB.............',
  '..............BGDB.............',
  '..............BGWB.............',
  '.............BGWWB.............',
  '.............BGWWB.............',
  '............BGWWWB.............',
  '............BGSSWB.............',
  '...........BGSWWWB.............',
  '..........BGSWWWWB.............',
  '.KK..BGWWSSWWWWWWWWWB.........',
  'KTKB.BGSSWWBWWWWWWWWWYOB......',
  '.KK..BGWWSSWWWWWWWWWB.........',
  '..........BGSWWWWB.............',
  '...........BGSWWWB.............',
  '............BGSSWB.............',
  '............BGWWWB.............',
  '.............BGWWBF............',
  '.............BGWWB.............',
  '..............BGWBF............',
  '..............BGDB.............',
  '...............BDB.............',
];

const SKIN_GOOSE = [
  '................................',
  '...............BB...............',
  '..............BWWB..............',
  '..............BWWB..............',
  '.............BWWWB..............',
  '.............BWWWB..............',
  '............BWWWWB..............',
  '............BWWWWB..............',
  '...........BWWWWWB..............',
  '..........BWWWWWWB..............',
  '.RRRR.BWWWWWWWWWWWWWB..........',
  'RRRRRBBWWWWBWWWWWWWWWOOB.......',
  '.RRRR.BWWWWWWWWWWWWWB..........',
  '..........BWWWWWWB..............',
  '...........BWWWWWB..............',
  '............BWWWWB..............',
  '............BWWWWB..............',
  '.............BWWWBF.............',
  '.............BWWWB..............',
  '..............BWWBF.............',
  '..............BWWB..............',
  '...............BB...............',
];

const SKIN_DEFORMED = [
  '..........BBBB.................',
  '.........BGGGBB................',
  '........BGGGWWB................',
  '..........BGWWWB...............',
  '...........BGWB................',
  '..........BWWWWB...............',
  '.........BWWWWWWB...............',
  '.......BWWWWWWWWWB..............',
  '......BWWWWWWWWWWWB.............',
  '.....BWBWWWWWWWWWWWB............',
  '.KKK.BWWWWWWWBWWWWWWYOB........',
  'KTTKBBWWWWWWWWWWWWWB............',
  '.KKK..BWWWWBWWWWWWB.............',
  '........BWWWWWWWB...............',
  '.........BGGGWB................',
  '..........BGGB......F..........',
  '...........BB...................',
  '..............B....F...........',
  '................................',
  '................................',
  '................................',
  '................................',
];

const SKIN_PEAGULL = [
  '................................',
  '................................',
  '..............BB................',
  '.............BPPB...............',
  '............BPPPB...............',
  '...........BPPPPB...............',
  '..........BPPPPPB...............',
  '..........BPPPPPB...............',
  '.........BPPPPPPB...............',
  '........BPPPPPPPB...............',
  '.KK.BPPPPPPPPPPPPPB............',
  'KTKBBPPPPBPPPPPPPPPYOB.........',
  '.KK.BPPPPPPPPPPPPPB............',
  '........BPPPPPPPB...............',
  '.........BPPPPPPB...............',
  '..........BPPPPPB...............',
  '..........BPPPPPB...............',
  '...........BPPPPBF..............',
  '............BPPPB...............',
  '.............BPPBF..............',
  '..............BB................',
  '................................',
];

const skinDefs = [
  { id: 'realistic', name: 'REALISTIC', cost: 67, sprite: SKIN_REALISTIC, desc: 'Detailed plumage' },
  { id: 'goose',     name: 'GOOSE POT', cost: 67, sprite: SKIN_GOOSE,    desc: 'Goose in a pot' },
  { id: 'deformed',  name: 'DEFORMED',  cost: 67, sprite: SKIN_DEFORMED, desc: 'What happened?!' },
  { id: 'peagull',   name: 'PEAGULL',   cost: 67, sprite: SKIN_PEAGULL,  desc: 'Green & round' },
];

// Build skin sprite canvases
const skinSprites = {};
for (const skin of skinDefs) {
  skinSprites[skin.id] = {
    glide: buildSprite(skin.sprite),
    flap: buildSprite(skin.sprite), // same for now
  };
}

function getActiveSprites() {
  if (activeSkin === 'default') return sprites;
  return skinSprites[activeSkin] || sprites;
}
let waveOffset = 0;

function update() {
  if (player.dead) return;

  // Falling into sea
  if (player.falling) {
    player.fallVy += 0.05;
    player.y += player.fallVy;
    player.angle += 0.2;  // spin while falling
    if (player.y > SEA_END) {
      player.dead = true;
      wallet += score;
    }
    // Still update camera & waves while falling
    const targetCamX = player.x + SPRITE_W / 2 - W / 2;
    camera.x = Math.max(0, Math.min(WORLD_W - W, targetCamX));
    waveOffset += 0.1;
    return;
  }

  // Dive mechanic
  if (player.diving) {
    player.x += player.diveVx;
    player.y += player.diveVy;
    player.diveTimer++;

    if (!player.diveRising) {
      // Descending phase — fixed dive distance
      if (player.y >= player.diveTarget) {
        // Check for chip steal — hit a chip person?
        const gx = player.x + SPRITE_W / 2;
        const gy = player.y + TILE / 2;
        for (const person of people) {
          if (!person.hasChips || person.drowned || person.panicking) continue;
          const dx = gx - person.x;
          const dy = gy - person.y;
          if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
            person.hasChips = false;
            player.chipPoops = 3;
            player.hasChipsInMouth = true;
            player.chipMouthTimer = 180;  // show chips for 3 seconds
            score += 100;
            squawk();
            // Witty remark (no panicking)
            const CHIP_REMARKS = [
              'My chips!', 'I was hungry!', 'Oi!', 'Come back!',
              'That was my lunch!', 'Blimey!', 'Not again!',
            ];
            const remark = CHIP_REMARKS[Math.floor(Math.random() * CHIP_REMARKS.length)];
            person.hitTimer = 120;
            person.chipRemark = remark;
            speak(remark, person.voicePitch, person.voiceRate);
            break;
          }
        }
        // Start rising back up
        player.diveRising = true;
        player.diveVy = -1.0;
      }
    } else {
      // Rising phase — smooth swoop back up
      const dist = player.y - player.diveY;
      const totalDist = player.diveTarget - player.diveY;
      const t = Math.max(0, dist / totalDist);  // 1 at bottom, 0 at top
      // Ease out: fast at bottom, gentle arrival at top
      player.diveVy = -0.5 - t * 1.5;
      if (player.y <= player.diveY + 1) {
        player.y = player.diveY;
        player.diving = false;
        player.diveRising = false;
      }
    }

    // Safety: abort dive if it goes too long
    if (player.diveTimer > 120) {
      player.diving = false;
      player.diveRising = false;
      player.y = player.diveY;
    }
  } else {
    handleInput();
  }

  // Spin from stone hit
  if (player.spinTimer > 0) {
    player.angle += 0.3;
    player.spinTimer--;
  }

  // Wing flap animation
  if (player.moving) {
    player.flapTimer++;
    if (player.flapTimer >= player.flapInterval) {
      player.flapTimer = 0;
      player.flapPhase = !player.flapPhase;
    }
  } else {
    player.flapPhase = false;
    player.flapTimer = 0;
  }

  // People, gulls & poop physics
  updatePeople();
  updateNpcGulls();
  updatePoops();
  updateStones();
  maybeThrowStones();
  if (poopCooldown > 0) poopCooldown--;
  if (player.chipMouthTimer > 0) {
    player.chipMouthTimer--;
    if (player.chipMouthTimer <= 0) player.hasChipsInMouth = false;
  }

  // Camera follows player horizontally
  const targetCamX = player.x + SPRITE_W / 2 - W / 2;
  camera.x = Math.max(0, Math.min(WORLD_W - W, targetCamX));

  waveOffset += 0.1;
}

function render() {
  ctx.save();
  ctx.scale(SCALE, SCALE);

  // Apply camera scroll
  ctx.save();
  ctx.translate(-camera.x, 0);

  // Background
  drawSea(waveOffset);
  drawBeach();
  drawStreet();

  // People on beach & promenade
  drawPeople();

  // NPC seagulls
  drawNpcGulls();

  // Poop splats & falling droppings
  drawPoops();

  // Stones
  drawStones();

  // Centre of the sprite in world space
  const cx = Math.round(player.x + SPRITE_W / 2);
  const cy = Math.round(player.y + TILE / 2);

  // Player shadow (pixel art rectangle, grows during dive)
  const shadowAlpha = player.diving ? 0.35 : 0.2;
  const shadowW = player.diving ? 28 : 24;
  ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
  ctx.fillRect(cx - Math.round(shadowW / 2), cy + 5, shadowW, 3);

  // Player sprite — rotate around centre
  const activeSprites = getActiveSprites();
  const sprite = player.flapPhase ? activeSprites.flap : activeSprites.glide;

  // Gentle hover bob when idle
  const bobY = player.moving ? 0 : Math.round(Math.sin(frame * 0.05));

  ctx.save();
  ctx.translate(cx, cy + bobY);
  ctx.rotate(player.angle);
  ctx.drawImage(sprite, -SPRITE_W / 2, -TILE / 2);
  // Chips in mouth (at beak, which points right in sprite space)
  if (player.hasChipsInMouth) {
    ctx.fillStyle = '#f5e6c8';
    ctx.fillRect(12, -3, 3, 5);
    ctx.fillStyle = '#e8c840';
    ctx.fillRect(14, -5, 2, 3);
    ctx.fillRect(13, -4, 2, 2);
    ctx.fillRect(15, -3, 2, 3);
  }
  ctx.restore();

  ctx.restore(); // end camera scroll

  // HUD (fixed on screen, not affected by camera)
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(4, 4, 80, 12);
  ctx.fillStyle = '#fff';
  ctx.font = '6px monospace';
  ctx.fillText('SEAGULL RPG', 8, 13);

  // Score
  const scoreText = String(score);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(W - 6 - scoreText.length * 4 - 4, 4, scoreText.length * 4 + 8, 12);
  ctx.fillStyle = '#fff';
  ctx.fillText(scoreText, W - 4 - scoreText.length * 4, 13);

  // Lives (hearts for remaining hits)
  const livesLeft = Math.max(0, 3 - player.hits);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < livesLeft ? '#e03030' : '#555';
    ctx.fillText('\u2665', 88 + i * 7, 13);
  }

  // Chip power-up indicator
  if (player.chipPoops > 0) {
    ctx.fillStyle = 'rgba(232,200,64,0.7)';
    ctx.fillRect(4, 18, 30, 10);
    ctx.fillStyle = '#fff';
    ctx.fillText('\u2B50' + player.chipPoops, 6, 25);
  }

  // Exit button (top-left, below HUD)
  if (!player.dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(W - 22, H - 12, 20, 10);
    ctx.fillStyle = '#aaa';
    ctx.font = '5px monospace';
    ctx.fillText('ESC', W - 18, H - 5);
  }

  // Game over overlay — pixel art style
  if (player.dead) {
    // Dark overlay with dithered pattern
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    for (let dy = 0; dy < H; dy += 2) {
      for (let dx = (dy % 4 === 0 ? 0 : 1); dx < W; dx += 2) {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(dx, dy, 1, 1);
      }
    }

    const cx = W / 2;
    const cy = H / 2;

    // Panel background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(cx - 60, cy - 50, 120, 115);
    // Panel border (double pixel border)
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 60, cy - 50, 120, 115);
    ctx.strokeStyle = '#3a3a6a';
    ctx.strokeRect(cx - 58, cy - 48, 116, 111);

    // Skull/cross bones pixel art (simple X)
    ctx.fillStyle = '#e03030';
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(cx + i, cy - 43 + Math.abs(i), 1, 1);
      ctx.fillRect(cx + i, cy - 37 - Math.abs(i), 1, 1);
    }
    ctx.fillRect(cx - 1, cy - 40, 3, 1);

    // Title
    ctx.fillStyle = '#e03030';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', cx, cy - 24);

    // Score with pixel box
    ctx.fillStyle = '#2a2a4a';
    ctx.fillRect(cx - 40, cy - 18, 80, 14);
    ctx.fillStyle = '#f5c623';
    ctx.font = '7px monospace';
    ctx.fillText('SCORE: +' + score, cx, cy - 8);

    // Wallet total
    ctx.fillStyle = '#2a2a4a';
    ctx.fillRect(cx - 40, cy, 80, 12);
    ctx.fillStyle = '#f5c623';
    ctx.font = '5px monospace';
    ctx.fillText('WALLET: ' + wallet, cx, cy + 9);

    // Decorative dots
    ctx.fillStyle = '#3a3a6a';
    for (let dx = cx - 38; dx <= cx + 38; dx += 4) {
      ctx.fillRect(dx, cy + 16, 1, 1);
    }

    // Restart button
    ctx.fillStyle = '#e03030';
    ctx.fillRect(cx - 40, cy + 22, 80, 14);
    ctx.fillStyle = '#c02020';
    ctx.fillRect(cx - 40, cy + 34, 80, 2);
    ctx.fillStyle = '#fff';
    ctx.font = '6px monospace';
    ctx.fillText('RESTART', cx, cy + 32);

    // Menu button
    ctx.fillStyle = '#3a3a6a';
    ctx.fillRect(cx - 40, cy + 42, 80, 14);
    ctx.fillStyle = '#2a2a5a';
    ctx.fillRect(cx - 40, cy + 54, 80, 2);
    ctx.fillStyle = '#fff';
    ctx.fillText('MENU', cx, cy + 52);

    ctx.textAlign = 'left';
  }

  ctx.restore();
}

function restart() {
  player.x = W / 2 - SPRITE_W / 2;
  player.y = H / 2 - TILE / 2;
  player.angle = 0;
  player.moving = false;
  player.hits = 0;
  player.spinTimer = 0;
  player.falling = false;
  player.fallVy = 0;
  player.dead = false;
  player.diving = false;
  player.diveRising = false;
  player.chipPoops = 0;
  player.hasChipsInMouth = false;
  player.chipMouthTimer = 0;
  player.flapPhase = false;
  player.flapTimer = 0;
  score = 0;
  poops.length = 0;
  splats.length = 0;
  stones.length = 0;
  // Reset people
  people.length = 0;
  spawnPeople();
  // Reset NPC gulls
  for (const npc of npcGulls) {
    npc.hits = 0;
    npc.spinTimer = 0;
    npc.falling = false;
    npc.fallVy = 0;
    npc.dead = false;
    npc.phraseTimer = 0;
    npc.cooldown = 0;
  }
}

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / (rect.width / W);
  const my = (e.clientY - rect.top) / (rect.height / H);

  if (gameState === 'shop') {
    const cx = W / 2;
    const cardW = 70, cardH = 80;
    const startX = cx - cardW - 5;
    const startY = 40;

    for (let i = 0; i < skinDefs.length; i++) {
      const skin = skinDefs[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = startX + col * (cardW + 10);
      const by = startY + row * (cardH + 8);

      // Click on buy/equip button area
      if (mx >= bx + 10 && mx <= bx + cardW - 10 && my >= by + 52 && my <= by + 64) {
        if (ownedSkins[skin.id] && activeSkin !== skin.id) {
          activeSkin = skin.id;
        } else if (!ownedSkins[skin.id] && wallet >= skin.cost) {
          wallet -= skin.cost;
          ownedSkins[skin.id] = true;
          activeSkin = skin.id;
        }
      }
    }

    // Back button
    if (mx >= cx - 25 && mx <= cx + 25 && my >= H - 22 && my <= H - 8) {
      gameState = 'title';
    }
    return;
  }

  if (gameState === 'tutorial') {
    const tcx = W / 2;
    // Back button
    if (tutorialPage > 0 && mx >= 20 && mx <= 60 && my >= 175 && my <= 189) {
      tutorialPage--;
    }
    // Next / Done button
    if (mx >= W - 60 && mx <= W - 20 && my >= 175 && my <= 189) {
      if (tutorialPage === tutorialPages.length - 1) {
        gameState = 'title';
      } else {
        tutorialPage++;
      }
    }
    // Menu button
    if (mx >= tcx - 20 && mx <= tcx + 20 && my >= 200 && my <= 212) {
      gameState = 'title';
    }
    return;
  }

  if (gameState === 'title') {
    for (const btn of titleButtons) {
      if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
        if (btn.label === 'PLAY') {
          gameState = 'playing';
          restart();
        } else if (btn.label === 'TUTORIAL') {
          gameState = 'tutorial';
          tutorialPage = 0;
        }
        else if (btn.label === 'SHOP') {
          gameState = 'shop';
        }
      }
    }
    return;
  }

  // Exit button click (bottom-right corner)
  if (!player.dead && mx >= W - 22 && mx <= W - 2 && my >= H - 12 && my <= H - 2) {
    wallet += score;
    player.dead = true;
    return;
  }

  if (!player.dead) return;
  const cx = W / 2;
  const cy = H / 2;
  // Restart button
  if (mx >= cx - 40 && mx <= cx + 40 && my >= cy + 22 && my <= cy + 36) {
    restart();
  }
  // Menu button
  if (mx >= cx - 40 && mx <= cx + 40 && my >= cy + 42 && my <= cy + 56) {
    gameState = 'title';
    restart();
  }
});

// ============================================================
// TITLE SCREEN
// ============================================================
const titleButtons = [
  { label: 'PLAY',     x: W / 2 - 30, y: 130, w: 60, h: 16 },
  { label: 'TUTORIAL', x: W / 2 - 30, y: 152, w: 60, h: 16 },
  { label: 'SHOP',     x: W / 2 - 30, y: 174, w: 60, h: 16 },
];

let titleWave = 0;

function drawTitle() {
  ctx.save();
  ctx.scale(SCALE, SCALE);

  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#6ec6ff');
  grad.addColorStop(0.5, '#ffe8a0');
  grad.addColorStop(1, '#ff9966');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Animated sea at bottom
  ctx.fillStyle = '#1a6ea8';
  ctx.fillRect(0, H - 50, W, 50);
  for (let x = 0; x < W; x += 4) {
    const waveY = H - 50 + Math.sin((x + titleWave) * 0.08) * 3;
    ctx.fillStyle = '#2188cc';
    ctx.fillRect(x, waveY, 4, 2);
  }

  // Draw the seagull sprite in the middle, a bit above the title
  const spriteFrame = Math.sin(titleWave * 0.05) > 0 ? sprites.glide : sprites.flap;
  const gullX = W / 2 - spriteFrame.width / 2 + Math.sin(titleWave * 0.03) * 20;
  const gullY = 35 + Math.sin(titleWave * 0.05) * 5;
  ctx.drawImage(spriteFrame, gullX, gullY);

  // Title text
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('OH CHIP!', W / 2 + 1, 91);
  ctx.fillStyle = '#fff';
  ctx.fillText('OH CHIP!', W / 2, 90);

  // Subtitle
  ctx.font = '5px monospace';
  ctx.fillStyle = '#ffffffaa';
  ctx.fillText('a seagull adventure', W / 2, 102);

  // Buttons
  for (const btn of titleButtons) {
    // Button shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(btn.x + 1, btn.y + 1, btn.w, btn.h);
    // Button background
    ctx.fillStyle = btn.label === 'PLAY' ? '#e03030' : '#3a3a6a';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    // Button border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
    // Button text
    ctx.fillStyle = '#fff';
    ctx.font = '7px monospace';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + 11);
  }

  ctx.textAlign = 'left';
  ctx.restore();
}

// ============================================================
// TUTORIAL
// ============================================================
const tutorialPages = [
  {
    title: 'MOVEMENT',
    lines: ['Arrow keys or WASD', 'to fly around.', '', 'You auto-rotate toward', 'the direction you fly.'],
    draw(cx, cy) {
      // Draw arrow keys
      const kx = cx - 20, ky = cy - 30;
      const ks = 10;
      ctx.fillStyle = '#2a2a4a';
      // Up
      ctx.fillRect(kx + ks, ky, ks, ks);
      ctx.fillStyle = '#fff'; ctx.font = '6px monospace'; ctx.textAlign = 'center';
      ctx.fillText('\u2191', kx + ks + ks/2, ky + 8);
      // Down
      ctx.fillStyle = '#2a2a4a';
      ctx.fillRect(kx + ks, ky + ks + 2, ks, ks);
      ctx.fillStyle = '#fff'; ctx.fillText('\u2193', kx + ks + ks/2, ky + ks + 10);
      // Left
      ctx.fillStyle = '#2a2a4a';
      ctx.fillRect(kx, ky + ks + 2, ks, ks);
      ctx.fillStyle = '#fff'; ctx.fillText('\u2190', kx + ks/2, ky + ks + 10);
      // Right
      ctx.fillStyle = '#2a2a4a';
      ctx.fillRect(kx + ks * 2, ky + ks + 2, ks, ks);
      ctx.fillStyle = '#fff'; ctx.fillText('\u2192', kx + ks * 2 + ks/2, ky + ks + 10);
      // Gull flying
      const gf = Math.sin(titleWave * 0.06) > 0 ? sprites.glide : sprites.flap;
      ctx.drawImage(gf, cx + 15, cy - 28);
    },
  },
  {
    title: 'POOP',
    lines: ['Press SPACE to poop!', '', 'Hit people for 67 pts.', 'They\'ll panic and', 'run into the sea!'],
    draw(cx, cy) {
      // Spacebar
      ctx.fillStyle = '#2a2a4a';
      ctx.fillRect(cx - 25, cy - 28, 50, 12);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 0.5;
      ctx.strokeRect(cx - 25, cy - 28, 50, 12);
      ctx.fillStyle = '#fff'; ctx.font = '5px monospace'; ctx.textAlign = 'center';
      ctx.fillText('SPACE', cx, cy - 19);
      // Poop splat
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(cx - 2, cy - 10, 4, 4);
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(cx - 1, cy - 9, 2, 2);
      // Arrow down
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) ctx.fillRect(cx, cy - 5 + i, 1, 1);
      ctx.fillRect(cx - 1, cy - 2, 3, 1);
      // Splat on ground
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(cx - 4, cy + 2, 8, 3);
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(cx - 2, cy + 3, 5, 1);
    },
  },
  {
    title: 'DIVE BOMB',
    lines: ['Press X to dive!', '', 'Swoop down to steal', 'chips from people.', 'Gives 3 homing poops!'],
    draw(cx, cy) {
      // X key
      ctx.fillStyle = '#2a2a4a';
      ctx.fillRect(cx - 8, cy - 30, 16, 12);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 0.5;
      ctx.strokeRect(cx - 8, cy - 30, 16, 12);
      ctx.fillStyle = '#e03030'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
      ctx.fillText('X', cx, cy - 21);
      // Dive arc
      ctx.strokeStyle = '#f5c623'; ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - 25, cy - 12);
      ctx.quadraticCurveTo(cx, cy + 5, cx + 25, cy - 12);
      ctx.stroke();
      // Gull at start of arc
      const gf = sprites.glide;
      ctx.drawImage(gf, cx - 25 - gf.width/2, cy - 18);
      // Chips icon at bottom
      ctx.fillStyle = '#f5c623';
      ctx.fillRect(cx - 3, cy + 2, 6, 4);
      ctx.fillStyle = '#e0a010';
      ctx.fillRect(cx - 2, cy + 3, 4, 2);
    },
  },
  {
    title: 'WATCH OUT!',
    lines: ['People throw stones!', '', '3 hits and you fall', 'into the sea.', 'Game over!'],
    draw(cx, cy) {
      // Stone
      ctx.fillStyle = '#888';
      ctx.fillRect(cx - 3, cy - 26, 6, 5);
      ctx.fillStyle = '#666';
      ctx.fillRect(cx - 2, cy - 25, 4, 3);
      // Trajectory line
      ctx.strokeStyle = '#e03030'; ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - 20, cy - 10);
      ctx.lineTo(cx, cy - 24);
      ctx.lineTo(cx + 20, cy - 10);
      ctx.stroke();
      // Hearts
      ctx.fillStyle = '#e03030'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('\u2665 \u2665 \u2665', cx, cy + 2);
    },
  },
  {
    title: 'SCORE BIG!',
    lines: ['Poop on people: 67 pts', 'Steal chips: 100 pts', '', 'Homing golden poops', 'never miss!'],
    draw(cx, cy) {
      // Score display
      ctx.fillStyle = '#2a2a4a';
      ctx.fillRect(cx - 30, cy - 30, 60, 16);
      ctx.fillStyle = '#f5c623'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('1337', cx, cy - 18);
      // Golden poop
      ctx.fillStyle = '#f5c623';
      ctx.fillRect(cx - 3, cy - 6, 6, 5);
      ctx.fillStyle = '#e0a010';
      ctx.fillRect(cx - 2, cy - 5, 4, 3);
      // Homing arrow
      ctx.strokeStyle = '#f5c623'; ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + 5, cy - 3);
      ctx.quadraticCurveTo(cx + 20, cy - 10, cx + 25, cy + 5);
      ctx.stroke();
      // Target
      ctx.fillStyle = '#e03030';
      ctx.fillRect(cx + 23, cy + 3, 5, 5);
    },
  },
];

function drawTutorial() {
  ctx.save();
  ctx.scale(SCALE, SCALE);

  // Background — same sunset as title
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#4a3a6a');
  grad.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Stars
  for (let i = 0; i < 30; i++) {
    const sx = (i * 97 + titleWave * 0.1) % W;
    const sy = (i * 53) % (H - 60);
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(titleWave * 0.03 + i) * 0.3})`;
    ctx.fillRect(sx, sy, 1, 1);
  }

  const page = tutorialPages[tutorialPage];
  const cx = W / 2;

  // Page title
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5c623';
  ctx.font = '10px monospace';
  ctx.fillText(page.title, cx, 22);

  // Illustration area
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(cx - 55, 30, 110, 60);
  ctx.strokeStyle = '#3a3a6a'; ctx.lineWidth = 0.5;
  ctx.strokeRect(cx - 55, 30, 110, 60);

  // Page-specific illustration
  page.draw(cx, 60);

  // Text lines
  ctx.fillStyle = '#f0f0f0';
  ctx.font = '5px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < page.lines.length; i++) {
    ctx.fillText(page.lines[i], cx, 105 + i * 10);
  }

  // Page dots
  for (let i = 0; i < tutorialPages.length; i++) {
    ctx.fillStyle = i === tutorialPage ? '#f5c623' : '#3a3a6a';
    const dotX = cx - (tutorialPages.length * 4) + i * 8;
    ctx.fillRect(dotX, 160, 4, 4);
  }

  // Nav buttons
  // Back / Previous
  if (tutorialPage > 0) {
    ctx.fillStyle = '#3a3a6a';
    ctx.fillRect(20, 175, 40, 14);
    ctx.fillStyle = '#fff'; ctx.font = '6px monospace'; ctx.textAlign = 'center';
    ctx.fillText('\u2190 BACK', 40, 184);
  }

  // Next / Done
  const isLast = tutorialPage === tutorialPages.length - 1;
  ctx.fillStyle = isLast ? '#e03030' : '#3a3a6a';
  ctx.fillRect(W - 60, 175, 40, 14);
  ctx.fillStyle = '#fff'; ctx.font = '6px monospace'; ctx.textAlign = 'center';
  ctx.fillText(isLast ? 'DONE' : 'NEXT \u2192', W - 40, 184);

  // Menu button
  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(cx - 20, 200, 40, 12);
  ctx.fillStyle = '#888'; ctx.font = '5px monospace';
  ctx.fillText('MENU', cx, 209);

  // Wallet display
  ctx.fillStyle = '#f5c623';
  ctx.font = '6px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('WALLET: ' + wallet, W - 8, 12);

  ctx.textAlign = 'left';
  ctx.restore();
}

// ============================================================
// SHOP SCREEN
// ============================================================
let shopScroll = 0;

function drawShop() {
  ctx.save();
  ctx.scale(SCALE, SCALE);

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#2a1a3e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;

  // Title
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5c623';
  ctx.font = '10px monospace';
  ctx.fillText('SHOP', cx, 18);

  // Wallet
  ctx.fillStyle = '#f5c623';
  ctx.font = '6px monospace';
  ctx.fillText('WALLET: ' + wallet, cx, 30);

  // Skin cards — 2x2 grid
  const cardW = 70, cardH = 80;
  const startX = cx - cardW - 5;
  const startY = 40;

  for (let i = 0; i < skinDefs.length; i++) {
    const skin = skinDefs[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = startX + col * (cardW + 10);
    const by = startY + row * (cardH + 8);
    const owned = ownedSkins[skin.id];
    const active = activeSkin === skin.id;

    // Card background
    ctx.fillStyle = active ? '#2a3a2a' : '#1a1a2e';
    ctx.fillRect(bx, by, cardW, cardH);
    // Border
    ctx.strokeStyle = active ? '#4ae04a' : (owned ? '#f5c623' : '#3a3a6a');
    ctx.lineWidth = active ? 1 : 0.5;
    ctx.strokeRect(bx, by, cardW, cardH);

    // Sprite preview
    const preview = skinSprites[skin.id].glide;
    ctx.drawImage(preview, bx + cardW / 2 - preview.width / 2, by + 6);

    // Name
    ctx.fillStyle = '#fff';
    ctx.font = '5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(skin.name, bx + cardW / 2, by + 36);

    // Description
    ctx.fillStyle = '#888';
    ctx.font = '4px monospace';
    ctx.fillText(skin.desc, bx + cardW / 2, by + 44);

    // Button
    if (active) {
      ctx.fillStyle = '#4ae04a';
      ctx.fillRect(bx + 10, by + 52, cardW - 20, 12);
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '5px monospace';
      ctx.fillText('EQUIPPED', bx + cardW / 2, by + 60);
    } else if (owned) {
      ctx.fillStyle = '#3a3a6a';
      ctx.fillRect(bx + 10, by + 52, cardW - 20, 12);
      ctx.fillStyle = '#fff';
      ctx.font = '5px monospace';
      ctx.fillText('EQUIP', bx + cardW / 2, by + 60);
    } else {
      ctx.fillStyle = wallet >= skin.cost ? '#e03030' : '#555';
      ctx.fillRect(bx + 10, by + 52, cardW - 20, 12);
      ctx.fillStyle = '#fff';
      ctx.font = '5px monospace';
      ctx.fillText(skin.cost + ' PTS', bx + cardW / 2, by + 60);
    }

    // Active checkmark
    if (active) {
      ctx.fillStyle = '#4ae04a';
      ctx.font = '8px monospace';
      ctx.fillText('\u2713', bx + cardW - 8, by + 10);
    }
  }

  // Back button
  ctx.fillStyle = '#3a3a6a';
  ctx.fillRect(cx - 25, H - 22, 50, 14);
  ctx.fillStyle = '#fff'; ctx.font = '6px monospace'; ctx.textAlign = 'center';
  ctx.fillText('BACK', cx, H - 12);

  ctx.textAlign = 'left';
  ctx.restore();
}

function loop() {
  frame++;
  titleWave++;
  if (gameState === 'title') {
    drawTitle();
  } else if (gameState === 'tutorial') {
    drawTutorial();
  } else if (gameState === 'shop') {
    drawShop();
  } else {
    update();
    render();
  }
  requestAnimationFrame(loop);
}

loop();
