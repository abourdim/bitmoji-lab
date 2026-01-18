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
  sendEmojiBtn: document.getElementById('sendEmojiBtn'),
  brightnessSlider: document.getElementById('brightnessSlider'),
  brightnessValue: document.getElementById('brightnessValue'),
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
let selectedEmojiHex = null; // 64 hex chars for 16x16

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
  ]
};

function ensureEmojiMatrixGrid() {
  if (!dom.emojiMatrix) return;
  if (dom.emojiMatrix.childElementCount === 256) return;

  dom.emojiMatrix.innerHTML = '';
  for (let i = 0; i < 256; i++) {
    const cell = document.createElement('div');
    cell.className = 'pixel-cell';
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
function renderEmojiToRGB16(emoji) {
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
  const colors = []; // Array of {r, g, b} for 256 pixels

  const cell = 4;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let totalR = 0, totalG = 0, totalB = 0, totalA = 0;
      let count = 0;

      // Average the 4x4 block
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
    for (let i = 0; i < 256 && i < data.length; i++) {
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
    for (let i = 0; i < 256; i++) {
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
}

function selectEmoji(emoji, btnEl) {
  selectedEmoji = emoji;
  if (dom.selectedEmojiText) dom.selectedEmojiText.textContent = emoji;

  // Toggle active state - find all emoji buttons in all categories
  if (dom.emojiList) {
    const allButtons = dom.emojiList.querySelectorAll('.emoji-btn');
    allButtons.forEach(btn => btn.classList.remove('active'));
  }
  if (btnEl) btnEl.classList.add('active');

  // Extract RGB color data
  const colors = renderEmojiToRGB16(emoji);
  paintEmojiMatrix(colors);
  selectedEmojiHex = rgbToHex(colors);

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

  sendInProgress = false;
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
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════
dom.connectBtn.onclick = connect;
dom.disconnectBtn.onclick = disconnect;
dom.sendBtn.onclick = sendMessage;
dom.messageInput.onkeypress = e => { if (e.key === 'Enter') sendMessage(); };
if (dom.testBtn) dom.testBtn.onclick = runTest;
if (dom.clearStatsBtn) dom.clearStatsBtn.onclick = clearStats;
dom.clearLogBtn.onclick = clearLog;
dom.copyLogBtn.onclick = copyLog;
dom.exportLogBtn.onclick = exportLog;

// Emoji UI wiring
buildEmojiPicker();
if (dom.sendEmojiBtn) dom.sendEmojiBtn.onclick = sendEmoji;

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
