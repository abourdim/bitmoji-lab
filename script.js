/**
 * micro:bit Serial Logger
 * USB Serial communication with chunked transfer and retry mechanism
 */

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════
const CONFIG = {
  baudRate: 115200,
  chunkSize: 50,  // Reduced from 64 for RGB reliability
  ackTimeout: 50, // Increased from 30 for RGB processing
  retryDelay: 15, // Increased from 10 for stability
  maxRetries: 10,
  maxSeq: 1000
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ═══════════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════════
const dom = {
  connectBtn: document.getElementById('connectBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  sendBtn: document.getElementById('sendBtn'),
  testBtn: document.getElementById('testBtn'),
  clearStatsBtn: document.getElementById('clearStatsBtn'),
  messageInput: document.getElementById('messageInput'),
  // Emoji UI
  emojiList: document.getElementById('emojiList'),
  emojiMatrix: document.getElementById('emojiMatrix'),
  selectedEmojiText: document.getElementById('selectedEmojiText'),
  selectedEmojiDescription: document.getElementById('selectedEmojiDescription'),
  sendEmojiBtn: document.getElementById('sendEmojiBtn'),
  matrixSize: document.getElementById('matrixSize'),
  brightnessSlider: document.getElementById('brightnessSlider'),
  brightnessValue: document.getElementById('brightnessValue'),
  brushColor: document.getElementById('brushColor'),
  // Preview controls
  clearPreviewBtn: document.getElementById('clearPreviewBtn'),
  testRedBtn: document.getElementById('testRedBtn'),
  testGreenBtn: document.getElementById('testGreenBtn'),
  testBlueBtn: document.getElementById('testBlueBtn'),
  testWhiteBtn: document.getElementById('testWhiteBtn'),
  // Save/Load
  saveNameInput: document.getElementById('saveNameInput'),
  saveDesignBtn: document.getElementById('saveDesignBtn'),
  savedDesignsList: document.getElementById('savedDesignsList'),
  noSavedDesigns: document.getElementById('noSavedDesigns'),
  logContainer: document.getElementById('logContainer'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  copyLogBtn: document.getElementById('copyLogBtn'),
  exportLogBtn: document.getElementById('exportLogBtn'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  statusPill: document.getElementById('statusPill')
};

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════
let port = null;
let reader = null;
let writer = null;
let isConnected = false;
let rxBuffer = '';
let sendInProgress = false;

// Emoji state
let selectedEmoji = null;
let selectedEmojiHex = null; // hex for RGBMOJI (size-dependent)

// ACK state
let awaitingPayload = null;
let awaitingResolve = null;
let awaitingReject = null;
let awaitingTimer = null;

// Test statistics
let stats = {
  chunks: 0,
  retries: 0,
  maxRetryPerChunk: 0
};

// Cumulative statistics
let cumulative = {
  tests: 0,
  bytes: 0,
  chunks: 0,
  retries: 0,
  time: 0,
  minSpeed: Infinity,
  maxSpeed: 0,
  minRetries: Infinity,
  maxRetries: 0,
  maxRetryPerChunk: 0
};

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const timestamp = () => `[${new Date().toLocaleTimeString()}]`;

// ═══════════════════════════════════════════════════════════════════
// EMOJI → 16x16 BITMAP
// - We render the emoji to an offscreen canvas, sample it into 16x16,
//   then encode as 64 hex chars (256 bits).
// - Payload over serial: EMOJI:<64hex>
// ═══════════════════════════════════════════════════════════════════

const EMOJI_LIBRARY = {
  '😀 Basic': [
    '😀','😃','😄','😁','😎','🥳','😍','🤖','👻','💀','👽','🎃',
    '❤️','💛','💚','💙','💜','⭐','⚡','🔥','❄️','🌈','🍀','🍕',
    '🍎','🍌','🍓','🍉','🎈','🎉','🎮','🎵','🚀','🧠','✅','❌'
  ],
  '🤖 Robots': [
    '🤖','👾','🛸','🦾','🦿','💡','🔋','⚙️','🔧','🔨','🪛','⚒️',
    '🛠️','🔩','⛓️','🧲','📡','📻','💻','⌨️','🖥️','📱','🖱️','💾'
  ],
  '🚗 Vehicles': [
    '🚗','🚙','🚕','🏎️','🚓','🚑','🚒','🚜','🦼','🦽','🛴','🛹',
    '🚲','🏍️','🛵','✈️','🚁','🛩️','🚂','🚃','🚄','🚅','🚆','🚇'
  ],
  '🔧 Tools': [
    '🔧','🔨','🪛','⚒️','🛠️','🪚','🪓','✂️','📏','📐','🧰','🗜️',
    '⛏️','🔪','🪒','🧪','🔬','🔭','⚗️','🧬','💉','🌡️','🧯','🪝'
  ],
  '🔴 Symbols': [
    '🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸',
    '🔺','🔻','💠','🔘','⏺️','⏸️','⏹️','⏩','⏪','⏫','⏬','▶️',
    '◀️','🔼','🔽','⏏️','⚠️','☢️','☣️','⛔','🚫','❗','❓','💯'
  ],
  '🏴 Flags': [
    '🇫🇷','🇺🇸','🇬🇧','🇩🇿','🇵🇸','🇹🇳','🇲🇦','🇪🇬','🇶🇦','🇿🇦',
    '🇮🇪','🇪🇸','🇮🇹','🏴','🏳️','🏁','🚩','🏴‍☠️'
  ],
  '🛑 Road Signs': [
    '🛑','⚠️','🚸','⛔','🚫','🚷','🚳','🚭','🚯','🚱',
    '🚰','♿','🅿️','🚏','🛤️','🚦','🚥','⛽','🏧','ℹ️',
    '🆘','🆗','🆙','🆕','🆓','🔞','📵','🔇','🔕','⏸️',
    '⏹️','⏺️','⏏️','⏮️','⏭️','⏯️','🔁','🔂','◀️','▶️'
  ]
};

// Emoji descriptions for better understanding
const EMOJI_DESCRIPTIONS = {
  // Basic
  '😀': 'Grinning Face - Happy smile',
  '😃': 'Grinning Face with Big Eyes',
  '😄': 'Grinning Face with Smiling Eyes',
  '😁': 'Beaming Face - Big grin',
  '😎': 'Smiling Face with Sunglasses - Cool',
  '🥳': 'Partying Face - Celebration',
  '😍': 'Smiling Face with Heart-Eyes - Love',
  '🤖': 'Robot Face - Technology',
  '👻': 'Ghost - Spooky',
  '💀': 'Skull - Danger or Halloween',
  '👽': 'Alien - Extraterrestrial',
  '🎃': 'Jack-O-Lantern - Halloween pumpkin',
  '❤️': 'Red Heart - Love',
  '💛': 'Yellow Heart - Friendship',
  '💚': 'Green Heart - Nature',
  '💙': 'Blue Heart - Trust',
  '💜': 'Purple Heart - Magic',
  '⭐': 'Star - Excellence',
  '⚡': 'Lightning Bolt - Power/Energy',
  '🔥': 'Fire - Hot or trending',
  '❄️': 'Snowflake - Cold or winter',
  '🌈': 'Rainbow - Colorful',
  '🍀': 'Four Leaf Clover - Good luck',
  '🍕': 'Pizza - Food',
  '🍎': 'Red Apple - Fruit or health',
  '🍌': 'Banana - Fruit',
  '🍓': 'Strawberry - Berry fruit',
  '🍉': 'Watermelon - Summer fruit',
  '🎈': 'Balloon - Party',
  '🎉': 'Party Popper - Celebration',
  '🎮': 'Video Game Controller - Gaming',
  '🎵': 'Musical Note - Music',
  '🚀': 'Rocket - Space or fast',
  '🧠': 'Brain - Intelligence',
  '✅': 'Check Mark - Correct/Done',
  '❌': 'Cross Mark - Wrong/Error',
  
  // Road Signs
  '🛑': 'STOP Sign - Arrêt obligatoire',
  '⚠️': 'Warning Sign - Attention danger',
  '🚸': 'Children Crossing - Passage piétons',
  '⛔': 'No Entry - Interdiction d\'entrer',
  '🚫': 'Prohibited - Interdit',
  '🚷': 'No Pedestrians - Piétons interdits',
  '🚳': 'No Bicycles - Vélos interdits',
  '🚭': 'No Smoking - Défense de fumer',
  '🚯': 'No Littering - Ne pas jeter',
  '🚱': 'Non-Potable Water - Eau non potable',
  '🚰': 'Potable Water - Eau potable',
  '♿': 'Wheelchair Symbol - Accès handicapés',
  '🅿️': 'Parking Sign - Stationnement',
  '🚏': 'Bus Stop - Arrêt de bus',
  '🛤️': 'Railway Track - Voie ferrée',
  '🚦': 'Traffic Light Vertical - Feu tricolore',
  '🚥': 'Traffic Light Horizontal - Feu',
  '⛽': 'Fuel Pump - Station essence',
  '🏧': 'ATM Sign - Distributeur',
  'ℹ️': 'Information - Point info',
  '🆘': 'SOS Button - Urgence',
  '🆗': 'OK Button - Validation',
  '🆙': 'UP Button - Direction haut',
  '🆕': 'NEW Button - Nouveau',
  '🆓': 'FREE Button - Gratuit',
  '🔞': 'No One Under 18 - Interdit -18 ans',
  '📵': 'No Mobile Phones - Téléphone interdit',
  '🔇': 'Muted Speaker - Son coupé',
  '🔕': 'No Bell - Silencieux',
  
  // Flags
  '🇫🇷': 'France Flag - Drapeau français',
  '🇺🇸': 'USA Flag - Drapeau américain',
  '🇬🇧': 'UK Flag - Drapeau britannique',
  '🇩🇿': 'Algeria Flag - Drapeau algérien',
  '🇵🇸': 'Palestine Flag - Drapeau palestinien',
  '🇹🇳': 'Tunisia Flag - Drapeau tunisien',
  '🇲🇦': 'Morocco Flag - Drapeau marocain',
  '🇪🇬': 'Egypt Flag - Drapeau égyptien',
  '🇶🇦': 'Qatar Flag - Drapeau qatarien',
  '🇿🇦': 'South Africa Flag - Drapeau sud-africain',
  '🇮🇪': 'Ireland Flag - Drapeau irlandais',
  '🇪🇸': 'Spain Flag - Drapeau espagnol',
  '🇮🇹': 'Italy Flag - Drapeau italien',
  '🏴': 'Black Flag - Drapeau noir',
  '🏳️': 'White Flag - Drapeau blanc',
  '🏁': 'Chequered Flag - Drapeau à damier',
  '🚩': 'Red Flag - Drapeau rouge',
  '🏴‍☠️': 'Pirate Flag - Drapeau pirate',
  
  // Robots
  '🤖': 'Robot - Robot face',
  '👾': 'Alien Monster - Space invader',
  '🛸': 'Flying Saucer - UFO',
  '🦾': 'Mechanical Arm - Robot arm',
  '🦿': 'Mechanical Leg - Robot leg',
  '💡': 'Light Bulb - Idea or light',
  '🔋': 'Battery - Power source',
  '⚙️': 'Gear - Mechanism',
  '🔧': 'Wrench - Tool',
  '🔨': 'Hammer - Building tool',
  '🪛': 'Screwdriver - Precision tool',
  
  // Vehicles
  '🚗': 'Car - Automobile',
  '🚙': 'SUV - Sport utility vehicle',
  '🚕': 'Taxi - Cab',
  '🏎️': 'Racing Car - Fast car',
  '🚓': 'Police Car - Law enforcement',
  '🚑': 'Ambulance - Emergency vehicle',
  '🚒': 'Fire Engine - Fire truck',
  '🚜': 'Tractor - Farm vehicle',
  '🚲': 'Bicycle - Bike',
  '🏍️': 'Motorcycle - Motorbike',
  '✈️': 'Airplane - Aircraft',
  '🚁': 'Helicopter - Chopper',
  '🚂': 'Locomotive - Train engine',
  '🚃': 'Railway Car - Train car',
  
  // Symbols
  '🔴': 'Red Circle - Red',
  '🟠': 'Orange Circle - Orange',
  '🟡': 'Yellow Circle - Yellow',
  '🟢': 'Green Circle - Green',
  '🔵': 'Blue Circle - Blue',
  '🟣': 'Purple Circle - Purple',
  '⚫': 'Black Circle - Black',
  '⚪': 'White Circle - White',
  '🔶': 'Large Orange Diamond',
  '🔷': 'Large Blue Diamond',
  '🔺': 'Red Triangle Pointed Up',
  '🔻': 'Red Triangle Pointed Down',
  '▶️': 'Play Button - Start',
  '◀️': 'Reverse Button - Back',
  '⏸️': 'Pause Button - Pause',
  '⏹️': 'Stop Button - Stop',
  '⏺️': 'Record Button - Record',
  '❗': 'Exclamation Mark - Important',
  '❓': 'Question Mark - Unknown',
  '💯': '100 Points - Perfect score'
};

function ensureEmojiMatrixGrid() {
  if (!dom.emojiMatrix) return;
  
  // Get the selected matrix size
  const matrixSize = parseInt(dom.matrixSize?.value || '16');
  const numCells = matrixSize * matrixSize;
  
  // Only rebuild if size changed
  if (dom.emojiMatrix.childElementCount === numCells) return;

  dom.emojiMatrix.innerHTML = '';
  
  // Set CSS grid columns based on size
  dom.emojiMatrix.style.gridTemplateColumns = `repeat(${matrixSize}, 1fr)`;
  
  for (let i = 0; i < numCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'pixel-cell';
    cell.dataset.index = String(i);
    dom.emojiMatrix.appendChild(cell);
  }
}

function bitsToHex(bits256) {
  const hex = [];
  for (let i = 0; i < 64; i++) {
    const b0 = bits256[i * 4 + 0] ? 1 : 0;
    const b1 = bits256[i * 4 + 1] ? 1 : 0;
    const b2 = bits256[i * 4 + 2] ? 1 : 0;
    const b3 = bits256[i * 4 + 3] ? 1 : 0;
    const value = (b0 << 3) | (b1 << 2) | (b2 << 1) | b3;
    hex.push(value.toString(16));
  }
  return hex.join('');
}

function renderEmojiToBits16(emoji) {
  // Draw big, then sample down.
  const W = 64, H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '56px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji';
  ctx.fillText(emoji, W / 2, H / 2 + 2);

  const img = ctx.getImageData(0, 0, W, H).data;
  const bits = new Array(256).fill(0);

  // Sample each 4x4 block into one pixel
  const cell = 4;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let onScore = 0;
      for (let yy = 0; yy < cell; yy++) {
        for (let xx = 0; xx < cell; xx++) {
          const px = x * cell + xx;
          const py = y * cell + yy;
          const idx = (py * W + px) * 4;
          const r = img[idx + 0];
          const g = img[idx + 1];
          const b = img[idx + 2];
          const a = img[idx + 3];
          // Simple luminance
          const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722);
          // Count pixel as "ink" if it exists and isn't near-black
          if (a > 40 && lum > 18) onScore++;
        }
      }

      // Threshold: at least ~20% of the 16 samples
      bits[y * 16 + x] = onScore >= 3 ? 1 : 0;
    }
  }

  return bits;
}

// NEW: Extract RGB color for each 16x16 pixel
function renderEmojiToRGB(emoji, targetSize = 16) {
  const W = 64, H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '56px system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji';
  ctx.fillText(emoji, W / 2, H / 2 + 2);

  const img = ctx.getImageData(0, 0, W, H).data;
  const colors = []; // Array of {r, g, b}

  const cell = Math.floor(64 / targetSize); // 4 for 16×16, 8 for 8×8
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      let totalR = 0, totalG = 0, totalB = 0, totalA = 0;
      let count = 0;

      // Average the cell block
      for (let yy = 0; yy < cell; yy++) {
        for (let xx = 0; xx < cell; xx++) {
          const px = x * cell + xx;
          const py = y * cell + yy;
          const idx = (py * W + px) * 4;
          const r = img[idx + 0];
          const g = img[idx + 1];
          const b = img[idx + 2];
          const a = img[idx + 3];
          
          if (a > 40) { // Only count visible pixels
            totalR += r;
            totalG += g;
            totalB += b;
            totalA += a;
            count++;
          }
        }
      }

      if (count > 2) { // At least 3 pixels in block
        colors.push({
          r: Math.round(totalR / count),
          g: Math.round(totalG / count),
          b: Math.round(totalB / count)
        });
      } else {
        colors.push({ r: 0, g: 0, b: 0 }); // Black/off
      }
    }
  }

  return colors;
}

// Legacy function names for compatibility
function renderEmojiToRGB16(emoji) {
  return renderEmojiToRGB(emoji, 16);
}

function renderEmojiToRGB8(emoji) {
  return renderEmojiToRGB(emoji, 8);
}

// Convert RGB array to hex string for transmission
function rgbToHex(colors) {
  // 256 pixels × 3 bytes = 768 bytes = 1536 hex chars
  const hex = [];
  for (const color of colors) {
    hex.push(color.r.toString(16).padStart(2, '0'));
    hex.push(color.g.toString(16).padStart(2, '0'));
    hex.push(color.b.toString(16).padStart(2, '0'));
  }
  return hex.join('');
}

function paintEmojiMatrix(data) {
  if (!dom.emojiMatrix) return;
  ensureEmojiMatrixGrid();
  const cells = dom.emojiMatrix.children;
  
  // Check if data is RGB colors or bits
  if (data[0] && typeof data[0] === 'object' && 'r' in data[0]) {
    // RGB color array
    const max = Math.min(cells.length, data.length);
    for (let i = 0; i < max; i++) {
      const color = data[i];
      const isOn = color.r > 10 || color.g > 10 || color.b > 10;
      cells[i].classList.toggle('on', isOn);
      if (isOn) {
        cells[i].style.background = `rgb(${color.r}, ${color.g}, ${color.b})`;
        cells[i].style.boxShadow = `0 0 8px rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`;
      } else {
        cells[i].style.background = '';
        cells[i].style.boxShadow = '';
      }
    }
  } else {
    // Monochrome bits (legacy)
    const max = Math.min(cells.length, data.length);
    for (let i = 0; i < max; i++) {
      cells[i].classList.toggle('on', !!data[i]);
      cells[i].style.background = '';
      cells[i].style.boxShadow = '';
    }
  }
}

function buildEmojiPicker() {
  if (!dom.emojiList) return;

  dom.emojiList.innerHTML = '';
  dom.emojiList.classList.remove('emoji-grid');
  dom.emojiList.classList.add('emoji-categories');

  for (const [categoryName, emojis] of Object.entries(EMOJI_LIBRARY)) {
    // Create category section
    const categorySection = document.createElement('details');
    categorySection.className = 'emoji-category';
    categorySection.open = categoryName === '😀 Basic'; // First category open by default

    // Category header
    const summary = document.createElement('summary');
    summary.className = 'emoji-category-title';
    summary.textContent = categoryName;
    categorySection.appendChild(summary);

    // Emoji grid for this category
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    
    for (const emoji of emojis) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-btn';
      btn.textContent = emoji;
      btn.addEventListener('click', () => selectEmoji(emoji, btn));
      grid.appendChild(btn);
    }

    categorySection.appendChild(grid);
    dom.emojiList.appendChild(categorySection);
  }

  ensureEmojiMatrixGrid();
  initEditablePreview();
}

function selectEmoji(emoji, btnEl) {
  selectedEmoji = emoji;
  if (dom.selectedEmojiText) dom.selectedEmojiText.textContent = emoji;
  
  // Show emoji description
  if (dom.selectedEmojiDescription) {
    const description = EMOJI_DESCRIPTIONS[emoji] || 'Custom emoji';
    dom.selectedEmojiDescription.textContent = description;
  }

  // Toggle active state - find all emoji buttons in all categories
  if (dom.emojiList) {
    const allButtons = dom.emojiList.querySelectorAll('.emoji-btn');
    allButtons.forEach(btn => btn.classList.remove('active'));
  }
  if (btnEl) btnEl.classList.add('active');

  // Extract RGB color data based on selected matrix size
  const matrixSize = parseInt(dom.matrixSize?.value || '16');
  const colors = renderEmojiToRGB(emoji, matrixSize);
  setPreviewFromColors(colors, emoji);

  if (dom.sendEmojiBtn) dom.sendEmojiBtn.disabled = !isConnected;
}

async function sendEmoji() {
  if (!selectedEmojiHex) {
    log('Pick an emoji first', 'error');
    return;
  }
  if (!isConnected) {
    log('Not connected', 'error');
    return;
  }
  if (sendInProgress) return;

  // RGB format: RGBMOJI:<1536 hex chars> (256 pixels × 3 bytes RGB)
  const payload = `RGBMOJI:${selectedEmojiHex}`;
  const byteLen = encoder.encode(payload).length;

  log(`Sending colorized emoji (${byteLen} bytes)`, 'info');

  // Always use chunked transfer for RGB (too large for single packet)
  await sendChunked(payload);
}

function log(msg, type = 'info') {
  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  div.textContent = `${timestamp()} ${msg}`;
  dom.logContainer.appendChild(div);
  dom.logContainer.scrollTop = dom.logContainer.scrollHeight;
}

function clearLog() {
  dom.logContainer.innerHTML = '';
  log('Log cleared');
}

function clearStats() {
  cumulative.tests = 0;
  cumulative.bytes = 0;
  cumulative.chunks = 0;
  cumulative.retries = 0;
  cumulative.time = 0;
  cumulative.minSpeed = Infinity;
  cumulative.maxSpeed = 0;
  cumulative.minRetries = Infinity;
  cumulative.maxRetries = 0;
  cumulative.maxRetryPerChunk = 0;
  log('Stats cleared', 'success');
}

function getLogText() {
  return Array.from(dom.logContainer.children).map(d => d.textContent).join('\n');
}

async function copyLog() {
  await navigator.clipboard.writeText(getLogText());
  log('Logs copied to clipboard', 'success');
}

function exportLog() {
  const blob = new Blob([getLogText()], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'microbit-log.txt';
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════════════════════════
function setConnected(connected) {
  isConnected = connected;
  dom.statusText.textContent = connected ? 'Connected' : 'Disconnected';
  dom.statusDot.classList.toggle('connected', connected);
  dom.statusPill.classList.toggle('connected', connected);
  dom.connectBtn.disabled = connected;
  dom.disconnectBtn.disabled = !connected;
  dom.sendBtn.disabled = !connected;
  if (dom.sendEmojiBtn) dom.sendEmojiBtn.disabled = !connected || !selectedEmojiHex;
  if (dom.testBtn) dom.testBtn.disabled = !connected;
}

// ═══════════════════════════════════════════════════════════════════
// SERIAL CONNECTION
// ═══════════════════════════════════════════════════════════════════
async function connect() {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: CONFIG.baudRate });
  writer = port.writable.getWriter();
  readLoop();
  rxBuffer = '';
  setConnected(true);
  log('Connected', 'success');
  
  // Send initial MODE command based on selected matrix size
  const matrixSize = parseInt(dom.matrixSize?.value || '16');
  await delay(100); // Small delay to let connection stabilize
  await sendMode(matrixSize);
}

async function disconnect() {
  isConnected = false;
  if (writer) { await writer.close().catch(() => {}); writer = null; }
  if (reader) { await reader.cancel().catch(() => {}); reader = null; }
  if (port) { await port.close().catch(() => {}); port = null; }
  setConnected(false);
  abortAck('Disconnected');
  log('Disconnected', 'error');
}

async function readLoop() {
  while (port && port.readable) {
    reader = port.readable.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) processRxData(value);
      }
    } catch (error) {
      if (isConnected) log('Read error: ' + error.message, 'error');
    } finally {
      reader.releaseLock();
      reader = null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// RX PROCESSING
// ═══════════════════════════════════════════════════════════════════
function processRxData(data) {
  rxBuffer += decoder.decode(data).replace(/\r/g, '');

  let nl;
  while ((nl = rxBuffer.indexOf('\n')) !== -1) {
    const line = rxBuffer.slice(0, nl).trim();
    rxBuffer = rxBuffer.slice(nl + 1);
    if (!line) continue;

    log('← ' + line, 'rx');

    if (line.startsWith('>')) {
      tryResolveAck(line.slice(1));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// TX / ACK
// ═══════════════════════════════════════════════════════════════════
async function sendRaw(msg) {
  await writer.write(encoder.encode(msg + '\n'));
  log('→ ' + msg, 'tx');
}

function abortAck(reason) {
  if (awaitingTimer) clearTimeout(awaitingTimer);
  if (awaitingReject) awaitingReject(new Error(reason));
  awaitingPayload = awaitingResolve = awaitingReject = null;
}

function waitForAck(payload) {
  return new Promise((resolve, reject) => {
    awaitingPayload = payload;
    awaitingResolve = resolve;
    awaitingReject = reject;
    awaitingTimer = setTimeout(() => {
      abortAck('ACK timeout');
      reject(new Error('ACK timeout'));
    }, CONFIG.ackTimeout);
  });
}

function tryResolveAck(echoed) {
  if (!awaitingResolve || !awaitingPayload) return;
  
  // Exact match (best case)
  if (echoed === awaitingPayload) {
    clearTimeout(awaitingTimer);
    const resolve = awaitingResolve;
    awaitingPayload = awaitingResolve = awaitingReject = null;
    resolve(true);
    return;
  }
  
  // Lenient match for RGB data - check sequence number and start of payload
  // Format: "seq|RGBMOJI:..." or "seq|data..."
  const barIdx = awaitingPayload.indexOf('|');
  if (barIdx > 0) {
    const expectedSeq = awaitingPayload.substring(0, barIdx);
    const expectedStart = awaitingPayload.substring(0, Math.min(barIdx + 20, awaitingPayload.length));
    
    // Check if echo starts with same sequence and partial payload
    if (echoed.startsWith(expectedSeq + '|') && echoed.substring(0, expectedStart.length) === expectedStart) {
      clearTimeout(awaitingTimer);
      const resolve = awaitingResolve;
      awaitingPayload = awaitingResolve = awaitingReject = null;
      resolve(true);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// CHUNKED TRANSFER
// ═══════════════════════════════════════════════════════════════════
function maxDataLenForSeq(seq) {
  const seqLen = String(seq).length;
  return Math.max(1, CONFIG.chunkSize - 1 - seqLen - 1);
}

async function sendChunked(msg) {
  sendInProgress = true;
  stats.retries = 0;
  stats.chunks = 0;
  stats.maxRetryPerChunk = 0;

  try {
    let seq = 0;
    let i = 0;

    while (i < msg.length) {
      const dataLen = maxDataLenForSeq(seq);
      const payload = `${seq}|${msg.slice(i, i + dataLen)}`;

      let success = false;
      let chunkRetries = 0;
      for (let retry = 0; retry < CONFIG.maxRetries && !success; retry++) {
        if (retry > 0) {
          chunkRetries++;
          stats.retries++;
          log(`Retry ${retry} for chunk ${seq}`, 'error');
          rxBuffer = '';
          await delay(CONFIG.retryDelay);
        }
        await sendRaw(payload);
        try {
          await waitForAck(payload);
          success = true;
          stats.maxRetryPerChunk = Math.max(stats.maxRetryPerChunk, chunkRetries);
        } catch (e) {
          if (retry === CONFIG.maxRetries - 1) throw e;
        }
      }

      i += dataLen;
      seq = (seq + 1) % (CONFIG.maxSeq + 1);
      stats.chunks++;
    }
  } finally {
    // Always reset sendInProgress, even if there was an error
    sendInProgress = false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SEND MESSAGE
// ═══════════════════════════════════════════════════════════════════
async function sendMessage() {
  const msg = dom.messageInput.value;
  if (!msg) return;

  const byteLen = encoder.encode(msg).length;

  if (byteLen < CONFIG.chunkSize) {
    await sendRaw(msg);
  } else {
    if (/\s/.test(msg)) {
      log('Long messages must contain NO SPACES', 'error');
      return;
    }
    if (sendInProgress) return;
    await sendChunked(msg);
  }

  dom.messageInput.value = '';
}

// ═══════════════════════════════════════════════════════════════════
// TEST
// ═══════════════════════════════════════════════════════════════════
function makeTestString() {
  let s = '';
  for (let i = 0; i <= 1000; i++) s += i;
  return s;
}

async function runTest() {
  const testData = makeTestString();
  log(`TEST #${cumulative.tests + 1} start (${testData.length} chars)`, 'info');

  const t0 = performance.now();
  await sendChunked(testData);
  const elapsed = (performance.now() - t0) / 1000;

  // Calculate stats
  const speed = testData.length / elapsed;
  const attempts = stats.chunks + stats.retries;
  const successRate = ((stats.chunks / attempts) * 100).toFixed(1);

  // Update cumulative
  cumulative.tests++;
  cumulative.bytes += testData.length;
  cumulative.chunks += stats.chunks;
  cumulative.retries += stats.retries;
  cumulative.time += elapsed;
  cumulative.minSpeed = Math.min(cumulative.minSpeed, speed);
  cumulative.maxSpeed = Math.max(cumulative.maxSpeed, speed);
  cumulative.minRetries = Math.min(cumulative.minRetries, stats.retries);
  cumulative.maxRetries = Math.max(cumulative.maxRetries, stats.retries);
  cumulative.maxRetryPerChunk = Math.max(cumulative.maxRetryPerChunk, stats.maxRetryPerChunk);

  // Calculate cumulative stats
  const cumAttempts = cumulative.chunks + cumulative.retries;
  const cumSuccessRate = ((cumulative.chunks / cumAttempts) * 100).toFixed(1);
  const avgSpeed = cumulative.bytes / cumulative.time;
  const avgRetries = cumulative.retries / cumulative.tests;

  // Display results
  log(`════════════════════════════════════════`, 'info');
  log(`TEST #${cumulative.tests} COMPLETE`, 'success');
  log(`────────────────────────────────────────`, 'info');
  log(`  Chunks: ${stats.chunks} | Retries: ${stats.retries} | Max retry: ${stats.maxRetryPerChunk} | Success: ${successRate}%`, 'info');
  log(`  Time: ${elapsed.toFixed(2)}s | Speed: ${speed.toFixed(1)} B/s`, 'info');
  log(`════════════════════════════════════════`, 'info');
  log(`CUMULATIVE STATS (${cumulative.tests} tests)`, 'success');
  log(`────────────────────────────────────────`, 'info');
  log(`  Total: ${cumulative.bytes} bytes | ${cumulative.chunks} chunks | ${cumulative.retries} retries`, 'info');
  log(`  Success rate: ${cumSuccessRate}%`, 'info');
  log(`  Speed: min=${cumulative.minSpeed.toFixed(0)} avg=${avgSpeed.toFixed(0)} max=${cumulative.maxSpeed.toFixed(0)} B/s`, 'info');
  log(`  Retries/test: min=${cumulative.minRetries} avg=${avgRetries.toFixed(1)} max=${cumulative.maxRetries}`, 'info');
  log(`  Max retries for single chunk: ${cumulative.maxRetryPerChunk}`, 'info');
  log(`  Total time: ${cumulative.time.toFixed(2)}s`, 'info');
  log(`════════════════════════════════════════`, 'info');
}

// ═══════════════════════════════════════════════════════════════════
// EVENT LISTENERS (init after DOM is ready)
// ═══════════════════════════════════════════════════════════════════

function initUI() {
  // Core buttons
  if (dom.connectBtn) dom.connectBtn.onclick = connect;
  if (dom.disconnectBtn) dom.disconnectBtn.onclick = disconnect;
  if (dom.sendBtn) dom.sendBtn.onclick = sendMessage;
  if (dom.messageInput) dom.messageInput.onkeypress = e => { if (e.key === 'Enter') sendMessage(); };
  if (dom.testBtn) dom.testBtn.onclick = runTest;
  if (dom.clearStatsBtn) dom.clearStatsBtn.onclick = clearStats;
  if (dom.clearLogBtn) dom.clearLogBtn.onclick = clearLog;
  if (dom.copyLogBtn) dom.copyLogBtn.onclick = copyLog;
  if (dom.exportLogBtn) dom.exportLogBtn.onclick = exportLog;

  // Build emoji picker + preview grid
  buildEmojiPicker();
  ensureEmojiMatrixGrid();
  initEditablePreview();

  // Emoji send
  if (dom.sendEmojiBtn) dom.sendEmojiBtn.onclick = sendEmoji;

  // Preview controls
  if (dom.clearPreviewBtn) dom.clearPreviewBtn.onclick = clearPreview;
  if (dom.testRedBtn) dom.testRedBtn.onclick = () => fillPreview(255, 0, 0);
  if (dom.testGreenBtn) dom.testGreenBtn.onclick = () => fillPreview(0, 255, 0);
  if (dom.testBlueBtn) dom.testBlueBtn.onclick = () => fillPreview(0, 0, 255);
  if (dom.testWhiteBtn) dom.testWhiteBtn.onclick = () => fillPreview(255, 255, 255);
}

// Make preview editable (click/drag paint + toggle)
let currentBrushColor = { r: 255, g: 0, b: 0 }; // Default red
let previewColors = []; // per-pixel RGB
let previewIsPainting = false;
let previewDragMode = 'paint'; // 'paint' | 'erase'
let previewLastIndex = -1;

function getMatrixSize() {
  return parseInt(dom.matrixSize?.value || '16');
}

function ensurePreviewColorsSize() {
  const size = getMatrixSize();
  const n = size * size;
  if (!Array.isArray(previewColors) || previewColors.length !== n) {
    previewColors = Array.from({ length: n }, () => ({ r: 0, g: 0, b: 0 }));
  }
}

function setPreviewFromColors(colors, label = null) {
  previewColors = colors.map(c => ({ r: c.r|0, g: c.g|0, b: c.b|0 }));
  paintEmojiMatrix(previewColors);
  selectedEmojiHex = rgbToHex(previewColors);
  if (label && dom.selectedEmojiText) dom.selectedEmojiText.textContent = label;
}

function updateHexFromPreview() {
  selectedEmojiHex = rgbToHex(previewColors);
}

function isPixelOn(color) {
  return (color.r|0) > 10 || (color.g|0) > 10 || (color.b|0) > 10;
}

function setPixel(index, color) {
  if (index < 0 || index >= previewColors.length) return;
  previewColors[index] = { r: color.r|0, g: color.g|0, b: color.b|0 };

  // Update just that cell for snappy painting
  const cell = dom.emojiMatrix?.children?.[index];
  if (!cell) return;
  const on = isPixelOn(previewColors[index]);
  cell.classList.toggle('on', on);
  if (on) {
    cell.style.background = `rgb(${previewColors[index].r}, ${previewColors[index].g}, ${previewColors[index].b})`;
    cell.style.boxShadow = `0 0 8px rgba(${previewColors[index].r}, ${previewColors[index].g}, ${previewColors[index].b}, 0.8)`;
    
    // 🎨 FUN BOUNCY ANIMATION FOR KIDS!
    cell.classList.add('just-painted');
    cell.classList.add('painted-active');
    
    // Remove animation classes after animation completes
    setTimeout(() => {
      cell.classList.remove('just-painted');
    }, 500);
    setTimeout(() => {
      cell.classList.remove('painted-active');
    }, 800);
  } else {
    cell.style.background = '';
    cell.style.boxShadow = '';
  }
}

function getCellIndexAtPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return -1;
  const cell = el.closest?.('.pixel-cell');
  if (!cell || !dom.emojiMatrix?.contains(cell)) return -1;
  const idx = parseInt(cell.dataset.index || '-1', 10);
  return Number.isFinite(idx) ? idx : -1;
}

function applyToggle(index) {
  const current = previewColors[index] || { r: 0, g: 0, b: 0 };
  if (isPixelOn(current)) {
    setPixel(index, { r: 0, g: 0, b: 0 });
  } else {
    setPixel(index, currentBrushColor);
  }
  updateHexFromPreview();
  selectedEmoji = null;
  if (dom.selectedEmojiText) dom.selectedEmojiText.textContent = 'Custom';
  if (dom.selectedEmojiDescription) dom.selectedEmojiDescription.textContent = 'Your custom creation';
}

function initEditablePreview() {
  if (!dom.emojiMatrix) return;
  if (dom.emojiMatrix.dataset.editableInit === "1") return;
  dom.emojiMatrix.dataset.editableInit = "1";


  // Brush color picker
  if (dom.brushColor) {
    const setFromHex = (hex) => {
      const h = (hex || '').replace('#','');
      if (h.length === 6) {
        currentBrushColor = {
          r: parseInt(h.slice(0,2),16) || 0,
          g: parseInt(h.slice(2,4),16) || 0,
          b: parseInt(h.slice(4,6),16) || 0,
        };
      }
    };
    setFromHex(dom.brushColor.value);
    dom.brushColor.addEventListener('input', (e) => setFromHex(e.target.value));
    
    // Add fun color button functionality
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const color = btn.getAttribute('data-color');
        dom.brushColor.value = color;
        setFromHex(color);
        // Fun animation feedback
        btn.style.transform = 'scale(1.3) rotate(15deg)';
        setTimeout(() => {
          btn.style.transform = '';
        }, 200);
      });
    });
  }

  dom.emojiMatrix.addEventListener('contextmenu', (e) => e.preventDefault());

  dom.emojiMatrix.addEventListener('pointerdown', (e) => {
    ensureEmojiMatrixGrid();
    ensurePreviewColorsSize();

    const idx = getCellIndexAtPoint(e.clientX, e.clientY);
    if (idx < 0) return;

    const erase = e.shiftKey || e.altKey || e.button === 2;
    previewDragMode = erase ? 'erase' : 'paint';
    previewIsPainting = true;
    previewLastIndex = -1;

    // Click toggles (only for paint mode). Erase always erases.
    if (previewDragMode === 'erase') {
      setPixel(idx, { r: 0, g: 0, b: 0 });
      updateHexFromPreview();
    } else {
      applyToggle(idx);
    }

    dom.emojiMatrix.setPointerCapture?.(e.pointerId);
  });

  dom.emojiMatrix.addEventListener('pointermove', (e) => {
    if (!previewIsPainting) return;
    const idx = getCellIndexAtPoint(e.clientX, e.clientY);
    if (idx < 0 || idx === previewLastIndex) return;
    previewLastIndex = idx;

    if (previewDragMode === 'erase') {
      setPixel(idx, { r: 0, g: 0, b: 0 });
    } else {
      // Drag paints (no toggle during drag)
      setPixel(idx, currentBrushColor);
    }

    updateHexFromPreview();
    selectedEmoji = null;
    if (dom.selectedEmojiText) dom.selectedEmojiText.textContent = 'Custom';
    if (dom.selectedEmojiDescription) dom.selectedEmojiDescription.textContent = 'Your custom creation';
  });

  const stop = () => {
    previewIsPainting = false;
    previewLastIndex = -1;
  };
  dom.emojiMatrix.addEventListener('pointerup', stop);
  dom.emojiMatrix.addEventListener('pointercancel', stop);
  dom.emojiMatrix.addEventListener('pointerleave', stop);
}

function clearPreview() {
  const size = getMatrixSize();
  const n = size * size;
  const colors = Array.from({ length: n }, () => ({ r: 0, g: 0, b: 0 }));
  setPreviewFromColors(colors, 'Custom');
  selectedEmoji = null;
  log('Preview cleared', 'info');
}

function fillPreview(r, g, b) {
  const size = getMatrixSize();
  const n = size * size;
  const colors = Array.from({ length: n }, () => ({ r: r|0, g: g|0, b: b|0 }));
  setPreviewFromColors(colors, 'Test Pattern');
  selectedEmoji = null;
  log(`Test pattern: RGB(${r},${g},${b})`, 'info');
}

// Matrix size selector
if (dom.matrixSize) {
  dom.matrixSize.onchange = async function() {
    const matrixSize = parseInt(this.value);
    
    // Send MODE command to micro:bit
    if (isConnected) {
      await sendMode(matrixSize);
    }
    
    // Rebuild the preview grid with new size
    ensureEmojiMatrixGrid();
    
    // Re-render the currently selected emoji with new size
    if (selectedEmoji) {
      const colors = renderEmojiToRGB(selectedEmoji, matrixSize);
      setPreviewFromColors(colors);
      log(`Matrix size changed to ${matrixSize}×${matrixSize}`, 'info');
    }
  };
}

async function sendMode(size) {
  if (!isConnected) {
    log('Not connected', 'error');
    return;
  }
  
  const payload = `MODE:${size}`;
  log(`Setting matrix mode to ${size}×${size}`, 'info');
  await sendRaw(payload);
}

// Brightness control
if (dom.brightnessSlider && dom.brightnessValue) {
  console.log('Brightness control initialized');
  
  dom.brightnessSlider.oninput = function() {
    console.log('Brightness slider moved:', this.value);
    dom.brightnessValue.textContent = this.value;
  };
  
  dom.brightnessSlider.onchange = async function() {
    console.log('Brightness slider released:', this.value, 'Connected:', isConnected);
    if (isConnected) {
      const brightness = parseInt(this.value);
      await sendBrightness(brightness);
    } else {
      log('Connect to micro:bit first', 'warning');
    }
  };
} else {
  console.error('Brightness slider not found!', {
    slider: dom.brightnessSlider,
    value: dom.brightnessValue
  });
}

async function sendBrightness(brightness) {
  if (!isConnected) {
    log('Not connected', 'error');
    return;
  }
  
  const payload = `BRIGHTNESS:${brightness}`;
  log(`Setting brightness to ${brightness}`, 'info');
  await sendRaw(payload);
}

// ═══════════════════════════════════════════════════════════════════
//  💾 SAVE / LOAD DESIGNS
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'bitmoji-saved-designs';

function getSavedDesigns() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error loading saved designs:', e);
    return [];
  }
}

function saveDesign(name, colors) {
  try {
    const designs = getSavedDesigns();
    const newDesign = {
      id: Date.now(),
      name: name || `Design ${designs.length + 1}`,
      colors: colors,
      timestamp: new Date().toISOString()
    };
    designs.push(newDesign);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
    return true;
  } catch (e) {
    console.error('Error saving design:', e);
    return false;
  }
}

function deleteDesign(id) {
  try {
    const designs = getSavedDesigns();
    const filtered = designs.filter(d => d.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (e) {
    console.error('Error deleting design:', e);
    return false;
  }
}

function loadDesignIntoPreview(colors) {
  ensureEmojiMatrixGrid(); // Make sure the grid exists
  ensurePreviewColorsSize();
  // Use setPreviewFromColors to properly update the visual display
  setPreviewFromColors(colors);
  updateHexFromPreview();
}

function renderSavedDesigns() {
  const designs = getSavedDesigns();
  
  if (designs.length === 0) {
    dom.savedDesignsList.style.display = 'none';
    dom.noSavedDesigns.style.display = 'block';
    return;
  }
  
  dom.savedDesignsList.style.display = 'grid';
  dom.noSavedDesigns.style.display = 'none';
  dom.savedDesignsList.innerHTML = '';
  
  designs.reverse().forEach(design => {
    const card = document.createElement('div');
    card.style.cssText = `
      background: linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,41,59,0.9));
      border: 1px solid rgba(148,163,184,0.3);
      border-radius: 12px;
      padding: 8px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    
    // Mini preview canvas
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    canvas.style.cssText = `
      width: 100%;
      height: auto;
      border-radius: 6px;
      margin-bottom: 6px;
      image-rendering: pixelated;
      border: 1px solid rgba(148,163,184,0.2);
    `;
    const ctx = canvas.getContext('2d');
    
    // Draw mini preview
    for (let i = 0; i < 256; i++) {
      const x = i % 16;
      const y = Math.floor(i / 16);
      const color = design.colors[i] || { r: 0, g: 0, b: 0 };
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      ctx.fillRect(x, y, 1, 1);
    }
    
    // Name
    const nameDiv = document.createElement('div');
    nameDiv.textContent = design.name;
    nameDiv.style.cssText = `
      font-size: 0.7rem;
      color: #e5e7eb;
      text-align: center;
      margin-bottom: 6px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    
    // Buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.style.cssText = 'display: flex; gap: 4px;';
    
    const loadBtn = document.createElement('button');
    loadBtn.textContent = '📥 Load';
    loadBtn.className = 'secondary small';
    loadBtn.style.cssText = 'flex: 1; font-size: 0.65rem; padding: 4px 6px;';
    loadBtn.onclick = (e) => {
      e.stopPropagation();
      loadDesignIntoPreview(design.colors);
      log(`✨ Loaded: ${design.name}`, 'success');
      
      // Visual feedback animation
      card.style.transform = 'scale(1.1)';
      card.style.boxShadow = '0 0 30px rgba(34,197,94,0.8)';
      setTimeout(() => {
        card.style.transform = '';
        card.style.boxShadow = '';
      }, 300);
    };
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '🗑️';
    deleteBtn.className = 'secondary small';
    deleteBtn.style.cssText = 'font-size: 0.65rem; padding: 4px 8px; background: rgba(239,68,68,0.2);';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${design.name}"?`)) {
        deleteDesign(design.id);
        renderSavedDesigns();
        log(`Deleted: ${design.name}`, 'info');
      }
    };
    
    buttonsDiv.appendChild(loadBtn);
    buttonsDiv.appendChild(deleteBtn);
    
    card.appendChild(canvas);
    card.appendChild(nameDiv);
    card.appendChild(buttonsDiv);
    
    // Hover effects
    card.onmouseenter = () => {
      card.style.transform = 'translateY(-2px) scale(1.02)';
      card.style.boxShadow = '0 0 20px rgba(34,197,94,0.4)';
    };
    card.onmouseleave = () => {
      card.style.transform = '';
      card.style.boxShadow = '';
    };
    
    // Click to load
    card.onclick = () => {
      loadDesignIntoPreview(design.colors);
      log(`✨ Loaded: ${design.name}`, 'success');
      
      // Visual feedback animation
      card.style.transform = 'scale(1.1)';
      card.style.boxShadow = '0 0 30px rgba(34,197,94,0.8)';
      setTimeout(() => {
        card.style.transform = '';
        card.style.boxShadow = '';
      }, 300);
    };
    
    dom.savedDesignsList.appendChild(card);
  });
}

// Save button handler
if (dom.saveDesignBtn) {
  dom.saveDesignBtn.addEventListener('click', () => {
    const name = dom.saveNameInput.value.trim() || `Design ${Date.now()}`;
    ensurePreviewColorsSize();
    
    if (saveDesign(name, previewColors)) {
      log(`✨ Saved: ${name}`, 'success');
      dom.saveNameInput.value = '';
      renderSavedDesigns();
      
      // Fun animation
      dom.saveDesignBtn.style.transform = 'scale(1.2) rotate(360deg)';
      setTimeout(() => {
        dom.saveDesignBtn.style.transform = '';
      }, 300);
    } else {
      log('Failed to save design', 'error');
    }
  });
}

// Load saved designs on startup
renderSavedDesigns();

// Boot (after all functions + state are defined)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUI);
} else {
  initUI();
}
