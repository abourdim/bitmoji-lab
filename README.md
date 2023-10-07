# 🎨 BITMOJI-LAB 🚀

### Welcome to the Coolest LED Matrix Controller Ever! 🌟

Turn your emojis into glowing LED art on your micro:bit! Pick any emoji, paint it with rainbow colors, and watch it light up on your LED matrix! 

---

## 🎯 What Does This Do?

This amazing project lets you:
- 😄 Pick from 100+ emojis
- 🎨 Paint them with ANY color you want
- 📡 Send them wirelessly to your micro:bit
- ✨ Watch them glow on an 8×8 or 16×16 LED matrix
- 💾 Save your favorite designs
- 🎬 Watch cool animations and demos

---

## 🛠️ What You Need

### Hardware (The Physical Stuff):
1. **🔷 BBC micro:bit** - Your tiny computer brain!
2. **💡 NeoPixel LED Matrix** - Either:
   - 8×8 matrix (64 colorful LEDs)
   - 16×16 matrix (256 colorful LEDs)
3. **🔌 USB Cable** - To connect micro:bit to your computer
4. **⚡ Power Supply** - To power your LEDs (they're hungry!)

### Software (The Computer Stuff):
1. **🌐 Google Chrome or Microsoft Edge** browser (for Web Serial)
2. **💻 This Web App** - Just open `index.html`!

---

## 📦 Step-by-Step Setup Guide

### Part 1: 🔧 Building Your LED Matrix

#### 🔌 Wiring Your NeoPixels

1. **Connect your LED Matrix to micro:bit:**
   ```
   LED Matrix → micro:bit
   ────────────────────────
   VCC (Red)   → 3V or External Power ⚡
   GND (Black) → GND (Ground) 🌍
   DIN (Data)  → Pin P0 📍
   ```

2. **⚠️ SUPER IMPORTANT:** 
   - If you have more than 8 LEDs, use **external power** (like a battery pack or USB power bank)
   - Don't power 64 or 256 LEDs from the micro:bit alone - it will get sad! 😢

#### 🎨 LED Matrix Types

**8×8 Matrix (Beginner Friendly):**
- 64 LEDs total
- Perfect for starting out
- Easier to see each pixel
- Uses less power

**16×16 Matrix (Advanced):**
- 256 LEDs total
- Super detailed images
- Needs more power
- Looks AMAZING! ✨

---

### Part 2: 💾 Programming Your micro:bit

#### Option A: Using MakeCode (Easiest!)

1. Go to [makecode.microbit.org](https://makecode.microbit.org)
2. Click "New Project"
3. Click "JavaScript" at the top
4. Delete everything and paste this code:

```typescript
/**
 * micro:bit RGB Emoji Receiver - UNIVERSAL VERSION
 * - Automatically supports both 8×8 and 16×16 NeoPixel matrices
 * - Detects matrix size from incoming data
 * - Connect your matrix to P0
 */

const LED_PIN = DigitalPin.P0

// Current matrix configuration (will be auto-detected from data)
let W = 8
let H = 8
let N = 64

// Create strip for maximum size (256 LEDs)
let strip = neopixel.create(LED_PIN, 256, NeoPixelMode.RGB)
strip.setBrightness(13)  // 5% brightness (13/255)
strip.clear()
strip.show()

serial.redirectToUSB()
serial.setRxBufferSize(200)
serial.setTxBufferSize(200)

// Reassembly buffer
let emojiBuf = ""
let lastChunkSeq = -1
let lastChunkTime = 0  // Track when last chunk arrived

// Serpentine mapping (common 16x16 panels)
function xyToIndex(x: number, y: number): number {
    if (y % 2 == 0) return y * W + x
    return y * W + (W - 1 - x)
}

// Linear mapping (uncomment this if serpentine doesn't work)
// function xyToIndex(x: number, y: number): number {
//     return y * W + x
// }

function hexToNibble(c: string): number {
    if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48
    if (c >= "A" && c <= "F") return c.charCodeAt(0) - 55
    if (c >= "a" && c <= "f") return c.charCodeAt(0) - 87
    return 0
}

function hexToByte(hex: string, offset: number): number {
    return (hexToNibble(hex.charAt(offset)) << 4) | hexToNibble(hex.charAt(offset + 1))
}

// Draw RGB emoji (using configured W, H, N from MODE command)
function drawRGBEmoji(hexData: string) {
    strip.clear()

    // Draw pixels (6 hex chars per pixel = RRGGBB)
    for (let pixelIdx = 0; pixelIdx < N; pixelIdx++) {
        let hexOffset = pixelIdx * 6
        if (hexOffset + 5 >= hexData.length) break

        let r = hexToByte(hexData, hexOffset)
        let g = hexToByte(hexData, hexOffset + 2)
        let b = hexToByte(hexData, hexOffset + 4)

        if (r > 0 || g > 0 || b > 0) {
            let x = pixelIdx % W
            let y = Math.idiv(pixelIdx, W)
            strip.setPixelColor(xyToIndex(x, y), neopixel.rgb(r, g, b))
        }
    }

    strip.show()
    basic.showIcon(IconNames.Yes)
}

// Legacy monochrome emoji (backward compatible)
function drawMonoEmoji(hex64: string) {
    strip.clear()

    let bitIndex = 0
    for (let i = 0; i < hex64.length; i++) {
        let nib = hexToNibble(hex64.charAt(i))
        for (let b = 3; b >= 0; b--) {
            if (bitIndex >= N) break

            let on = (nib & (1 << b)) != 0
            if (on) {
                let x = bitIndex % W
                let y = Math.idiv(bitIndex, W)
                strip.setPixelColor(xyToIndex(x, y), neopixel.colors(NeoPixelColors.White))
            }
            bitIndex++
        }
    }

    strip.show()
}

function tryConsumeEmojiBuffer() {
    // Check for RGB format first
    let rgbIdx = emojiBuf.indexOf("RGBMOJI:")
    if (rgbIdx != -1) {
        if (rgbIdx > 0) emojiBuf = emojiBuf.substr(rgbIdx)

        // Use the configured size (set by MODE command)
        const needLen = 8 + (N * 6) + 3  // "RGBMOJI:" + (pixels × 6 hex chars) + "|XX" checksum

        if (emojiBuf.length >= needLen) {
            let hexData = emojiBuf.substr(8, N * 6)
            
            // Verify checksum (simple: sum all hex nibbles mod 256)
            let checksum = 0
            for (let i = 0; i < hexData.length; i++) {
                checksum = (checksum + hexToNibble(hexData.charAt(i))) % 256
            }
            let expectedChecksum = hexToByte(emojiBuf, 8 + N * 6 + 1)
            
            if (checksum == expectedChecksum) {
                emojiBuf = ""
                basic.showIcon(IconNames.Heart)
                // Convert to hex manually
                let checksumHex = ""
                let high = Math.idiv(checksum, 16)
                let low = checksum % 16
                checksumHex = "0123456789ABCDEF".charAt(high) + "0123456789ABCDEF".charAt(low)
                serial.writeString("STATUS:OK|" + checksumHex + "\n")
                drawRGBEmoji(hexData)
            } else {
                // Checksum failed - discard
                emojiBuf = ""
                basic.showIcon(IconNames.No)
                // Convert both checksums to hex manually
                let calcHigh = Math.idiv(checksum, 16)
                let calcLow = checksum % 16
                let calcHex = "0123456789ABCDEF".charAt(calcHigh) + "0123456789ABCDEF".charAt(calcLow)
                let expHigh = Math.idiv(expectedChecksum, 16)
                let expLow = expectedChecksum % 16
                let expHex = "0123456789ABCDEF".charAt(expHigh) + "0123456789ABCDEF".charAt(expLow)
                serial.writeString("STATUS:BAD|" + calcHex + "|" + expHex + "\n")
            }
            return
        }
    }

    // Check for legacy monochrome format
    let monoIdx = emojiBuf.indexOf("EMOJI:")
    if (monoIdx != -1) {
        const needLen = 6 + 64
        if (monoIdx > 0) emojiBuf = emojiBuf.substr(monoIdx)

        if (emojiBuf.length >= needLen) {
            let hex64 = emojiBuf.substr(6, 64)
            emojiBuf = ""
            drawMonoEmoji(hex64)
            return
        }
    }

    // Clear buffer if too large (corrupted)
    if (emojiBuf.length > 2000) {
        emojiBuf = ""
    }
}

basic.showIcon(IconNames.Yes)

serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let line = serial.readUntil(serial.delimiters(Delimiters.NewLine)).trim()
    if (line.length == 0) return

    // ✅ ACK FIRST (critical) - must be immediate, no delays
    serial.writeString(">" + line + "\n")

    // Chunk format: "seq|payload"
    let bar = line.indexOf("|")
    if (bar != -1) {
        let seqStr = line.substr(0, bar)
        let seq = parseInt(seqStr)
        let payload = line.substr(bar + 1)

        // Check if this is emoji-related
        let isRGBStart = payload.indexOf("RGBMOJI:") == 0
        let isMonoStart = payload.indexOf("EMOJI:") == 0
        let isContinuation = emojiBuf.length > 0

        if (isRGBStart || isMonoStart || isContinuation) {
            // Update timestamp when receiving chunks
            lastChunkTime = control.millis()

            // For new emoji, reset everything
            if (isRGBStart || isMonoStart) {
                emojiBuf = payload
                lastChunkSeq = seq
            }
            // For continuation chunks, check sequence
            else if (seq == lastChunkSeq + 1) {
                emojiBuf = emojiBuf + payload
                lastChunkSeq = seq
            }
            // Ignore out-of-order or duplicate chunks

            tryConsumeEmojiBuffer()
        }
        return
    }

    // Non-chunk emoji
    if (line.indexOf("RGBMOJI:") == 0 || line.indexOf("EMOJI:") == 0) {
        emojiBuf = line
        lastChunkSeq = -1
        tryConsumeEmojiBuffer()
        return
    }

    // Brightness command: "BRIGHTNESS:value"
    if (line.indexOf("BRIGHTNESS:") == 0) {
        let brightnessStr = line.substr(11)
        let brightness = parseInt(brightnessStr)
        if (brightness >= 10 && brightness <= 255) {
            strip.setBrightness(brightness)
            strip.show()  // Update display with new brightness
            basic.showIcon(IconNames.Yes)
        }
        return
    }

    // Matrix mode command: "MODE:8" or "MODE:16"
    if (line.indexOf("MODE:") == 0) {
        let modeStr = line.substr(5)
        let mode = parseInt(modeStr)
        if (mode == 8) {
            W = 8
            H = 8
            N = 64
            serial.writeString("Mode set to 8x8\n")
            basic.showLeds(`
                . . # . .
                . # . # .
                # . . . #
                . # . # .
                . . # . .
            `)
            basic.pause(500)
            basic.clearScreen()
        } else if (mode == 16) {
            W = 16
            H = 16
            N = 256
            serial.writeString("Mode set to 16x16\n")
            basic.showLeds(`
                # # # # #
                # . . . #
                # . . . #
                # . . . #
                # # # # #
            `)
            basic.pause(500)
            basic.clearScreen()
        }
        return
    }
})
```

5. **Click "Download"** - It will save a `.hex` file
6. **Drag the `.hex` file** onto your micro:bit drive (it shows up like a USB drive!)
7. **Wait for the yellow light** on the micro:bit to stop flashing
8. **You should see a ✅ checkmark** on the micro:bit screen - you're ready! 🎉

#### 🔍 What Does This Code Do?

- 📡 **Listens** for messages from your computer over USB
- 🎨 **Converts** emoji data into LED colors
- 💡 **Lights up** the NeoPixel matrix
- 🔄 **Switches** between 8×8 and 16×16 mode automatically
- ⚡ **Controls** brightness to save power

---

### Part 3: 🌐 Using the Web App

#### 🚀 Getting Started

1. **Open the Web App:**
   - Double-click `index.html`
   - Or drag it into Chrome/Edge browser

2. **Connect to Your micro:bit:**
   - Plug micro:bit into USB
   - Click **"🔗 Connect"** button
   - Select **"BBC micro:bit CMSIS-DAP"** from the list
   - Click **"Connect"**
   - Status should turn GREEN! 🟢

3. **Choose Your Matrix Size:**
   - Click the **"📐 Matrix Size"** dropdown
   - Select either **8×8** or **16×16**
   - The app will tell your micro:bit!

---

## 🎨 How to Create Emoji Art

### Method 1: 😄 Pick a Pre-Made Emoji

1. **Browse the Emoji Library** 
   - Scroll through categories:
     - 😀 Basic (faces, hearts, stars)
     - 🤖 Robots (tech stuff!)
     - 🚗 Vehicles (cars, rockets)
     - 🔧 Tools (geeky things)
     - 🔴 Symbols (shapes and colors)
     - 🏴 Flags (countries!)
     - 🛑 Road Signs (stop, warning)

2. **Click an Emoji** you like

3. **See the Preview** light up! 👀

4. **Click "🚀 SEND TO MICRO:BIT!"**

5. **Watch the Magic!** ✨
   - Your emoji appears on the LED matrix!
   - The micro:bit shows a ❤️ when it's done!

### Method 2: 🖌️ Paint Your Own Masterpiece

1. **Click to expand "🖌️ Magic Paintbrush"**

2. **Choose a Color:**
   - Click a preset color button (🍓 Red, 🦊 Orange, ⭐ Yellow, etc.)
   - OR pick your own with the color picker! 🌈

3. **Start Painting:**
   - **Click** on pixels to paint them
   - **Click and drag** to paint multiple pixels
   - **Hold SHIFT + Click** to erase pixels

4. **Try the Quick Test Buttons:**
   - **🔴 Test Red** - Fill with red
   - **🟢 Test Green** - Fill with green
   - **🔵 Test Blue** - Fill with blue
   - **⚪ Test White** - Fill with white

5. **Save Your Creation:**
   - Type a name (like "My Awesome Robot")
   - Click **"💾 Save Design"**
   - Find it later in **"📚 My Saved Designs"**!

---

## 🎬 Cool Demos to Try

Click **"🎬 Demos & Animations"** to expand, then try:

1. **🏴 Waving Flag** - A flag that waves in the wind!
2. **🚦 Traffic Light** - Red → Yellow → Green, just like a real one!
3. **💓 Heart Beat** - A beating heart! (So romantic! 💕)
4. **⭐ Spinning Star** - A star that spins around!
5. **🌈 Rainbow Wave** - Colors flowing across the screen!
6. **😄 Happy Face** - A smiling face animation!
7. **⏳ Loading Bar** - Watch it fill up!
8. **🎆 Fireworks** - Boom! Sparkles everywhere!
9. **🏎️ Racing Car** - Vroom vroom across the matrix!

**To Stop:** Click **"Stop Demo"** button

---

## 🎛️ Advanced Features

### 💡 Brightness Control

- Move the **"💡 Brightness"** slider
- Goes from **10 to 255** (4% to 100%)
- **Tip:** Lower brightness = longer battery life! 🔋
- Default is **5%** to protect your eyes! 👀

### 🎨 Simple Mode

- Check the **"🎨 Simple Mode"** box
- Removes fancy gradients
- Shows **flat, solid colors**
- Easier to see what's "on" vs "off"

### 📨 Send Custom Messages

1. Expand **"🔌 Connection & Message"**
2. Type anything in the message box
3. Click **"📨 Send"**
4. Watch it appear in the Communication Log! 📜

### 🧪 Test Connection Speed

- Click **"🧪 Test 0..1000"**
- Sends 1000 messages super fast!
- See how fast your connection is!
- Great for testing if everything's working!

---

## 🐛 Troubleshooting (When Things Go Wrong)

### 😢 Problem: Can't Connect to micro:bit

**Try this:**
- ✅ Make sure you're using **Chrome or Edge** (not Firefox or Safari!)
- ✅ Check USB cable is plugged in properly
- ✅ Try a **different USB cable** (some only charge, not data!)
- ✅ Try a **different USB port**
- ✅ Restart your browser
- ✅ Unplug micro:bit, wait 5 seconds, plug back in

### 🌈 Problem: LEDs Show Wrong Colors

**Try this:**
- 🔧 Check your wiring (especially the **Data pin** to P0!)
- 🔧 Make sure you selected the right matrix size (8×8 or 16×16)
- 🔧 Try adjusting brightness
- 🔧 Check if your LED matrix is **RGB** (most NeoPixels are!)

### 🔲 Problem: Some Pixels Don't Light Up

**Try this:**
- ⚡ Use **external power** (battery pack or USB power)
- ⚡ Check if the first LED is getting power
- ⚡ Try lowering brightness
- 🔧 Check if a wire is loose

### 🤔 Problem: Emoji Looks Weird or Scrambled

**Try this:**
- 🎯 Some emojis look better at **16×16** than **8×8**
- 🎯 Try a simpler emoji (like ❤️ or ⭐)
- 🎯 Check if you're using the right **wiring mode** (serpentine vs linear)
- 🔄 Click **"🔄 Clear Preview"** and try again

### 📡 Problem: micro:bit Shows ❌ Instead of ❤️

**This means:**
- The data didn't arrive correctly
- Try sending again
- Check your USB connection
- Make sure the Communication Log shows messages being received

---

## 🧠 How Does It Work? (The Science!)

### 🎨 Step 1: Emoji to Pixels

When you click an emoji:
1. Your browser draws the emoji **HUGE** on an invisible canvas
2. It shrinks it down to 8×8 or 16×16 pixels
3. For each pixel, it reads the **Red, Green, and Blue** values
4. It creates a long string of color codes (like `FF0000` for red)

### 📡 Step 2: Sending Over USB

1. The color data is **too big** to send all at once!
2. So we chop it into **small chunks** (50 characters each)
3. Each chunk gets a **number** (0, 1, 2, 3...)
4. We send them one at a time
5. The micro:bit **acknowledges** each chunk with a `>`
6. If a chunk gets lost, we **send it again**!

### 💡 Step 3: Lighting the LEDs

1. micro:bit receives all the chunks
2. It puts them back together like a puzzle! 🧩
3. It checks a **checksum** to make sure nothing's broken
4. It converts color codes to LED commands
5. It sends signals to the NeoPixel strip
6. The LEDs light up! ✨

### 🌀 Step 4: Serpentine Mapping

Most LED matrices are wired in a **snake pattern**:
```
→ → → → →
        ↓
← ← ← ← ←
↓
→ → → → →
```

The code converts `(x, y)` coordinates to the actual LED number!

---

## 📚 Cool Things to Learn More About

### 🎓 Topics This Project Teaches:

- **💻 Web Programming:** HTML, CSS, JavaScript
- **📡 Serial Communication:** How computers talk to devices
- **🎨 Graphics:** How images become pixels
- **⚡ Electronics:** LEDs, power, circuits
- **🔢 Binary & Hex:** How computers store colors
- **🧮 Checksums:** How to detect errors in data
- **🎮 User Interfaces:** How to make apps easy to use

### 🌟 Ideas to Extend This Project:

1. **📱 Add more emojis** to the library
2. **🎵 Make emojis react to music** (add a microphone!)
3. **🎮 Create a game** (like Snake or Pong on the matrix!)
4. **⏰ Make a clock** that shows time with colored pixels
5. **🌡️ Add a temperature sensor** and show hot/cold colors
6. **📸 Take photos** and display them on the matrix
7. **🔊 Add sound effects** when sending emojis
8. **🌙 Night mode** with auto-brightness based on time

---

## 🏆 Challenge Yourself!

### 🥉 Beginner Challenges:
- [ ] Light up your first emoji! ✨
- [ ] Try all the demo animations
- [ ] Create a simple smiley face 😊
- [ ] Save 3 different designs

### 🥈 Intermediate Challenges:
- [ ] Paint a picture using all 8 preset colors
- [ ] Make your own animation with 3+ frames
- [ ] Change the brightness based on time of day
- [ ] Create a "loading bar" that fills up

### 🥇 Advanced Challenges:
- [ ] Write code to scroll text across the matrix
- [ ] Make emojis fade in and out smoothly
- [ ] Create a simple game (Tic-Tac-Toe?)
- [ ] Connect multiple matrices together!
- [ ] Add button controls on the micro:bit
- [ ] Make a music visualizer (LEDs dance to beats!)

---

## 💡 Fun Facts!

- 🌈 **NeoPixels** can show **16.7 million colors** (256 × 256 × 256)!
- ⚡ Each LED uses about **60 milliamps** at full brightness
- 🎨 An 8×8 matrix = **64 pixels** = same as the first computers!
- 📱 Your phone screen has **MILLIONS** of pixels!
- 🔢 We use **hexadecimal** (base 16) to write colors efficiently
- 🚀 USB can send data at **12 million bits per second**!

---

## 🎉 Credits & Thanks

**Created by:** The awesome micro:bit community! 💪

**Technologies Used:**
- 🟦 BBC micro:bit (TypeScript/MakeCode)
- 🌐 Web Serial API (JavaScript)
- 💡 NeoPixel/WS2812B LEDs
- 🎨 HTML Canvas for emoji rendering

**Special Thanks To:**
- All the kids who tested this and gave feedback! 🙌
- The micro:bit Educational Foundation 📚
- Adafruit for amazing NeoPixel libraries 🌈

---

## 📞 Need Help?

**If you get stuck:**
1. Read the **🐛 Troubleshooting** section above
2. Check the **Communication Log** for error messages
3. Try unplugging everything and starting over
4. Ask a parent, teacher, or friend to help!
5. Remember: Every mistake is a **learning opportunity**! 🧠

---

## 🎊 Have Fun Creating!

Remember:
- 🌟 **There's no "wrong" way** to be creative!
- 🎨 **Experiment** and try new things!
- 🤝 **Share** your creations with friends!
- 📖 **Learn** something new every day!
- 💪 **Never give up** when things get tricky!

**Now go make something AMAZING!** 🚀✨

---

**Version:** v1.1 • 20 Jan 2026  
**Made with ❤️ for young makers and creators!**

🎨🚀💡🌈✨🎉
