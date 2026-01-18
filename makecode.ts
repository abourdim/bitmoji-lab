/**
 * micro:bit RGB Emoji Receiver - UNIVERSAL VERSION
 * - Automatically supports both 8×8 and 16×16 NeoPixel matrices
 * - Detects matrix size from incoming data
 * - Connect your matrix to P0
 */

const LED_PIN = DigitalPin.P0

// Current matrix configuration (will be auto-detected from data)
let W = 16
let H = 16
let N = 256

// Create strip for maximum size (256 LEDs)
let strip = neopixel.create(LED_PIN, 256, NeoPixelMode.RGB)
strip.setBrightness(80)
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
        const needLen = 8 + (N * 6)  // "RGBMOJI:" + (pixels × 6 hex chars)

        if (emojiBuf.length >= needLen) {
            let hexData = emojiBuf.substr(8, N * 6)
            emojiBuf = ""
            basic.showIcon(IconNames.Heart)
            drawRGBEmoji(hexData)
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
