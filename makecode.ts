/**
 * micro:bit 16x16 RGB Emoji Receiver
 * - Supports full RGB color emoji display
 * - Protocol: RGBMOJI:<1536-hex-chars> (256 pixels × 3 bytes RGB)
 * - RX/TX buffer size = 200
 * - Echoes immediately for ACK
 * - Displays on 16x16 NeoPixel (256 LEDs) on P0
 */

const LED_PIN = DigitalPin.P0
const W = 16
const H = 16
const N = W * H

let strip = neopixel.create(LED_PIN, N, NeoPixelMode.RGB)
strip.setBrightness(80)  // Reduced from 100 to save power
strip.clear()
strip.show()

serial.redirectToUSB()
serial.setRxBufferSize(250)  // Increased from 200
serial.setTxBufferSize(250)  // Increased from 200

// Reassembly buffer
let emojiBuf = ""
let lastChunkSeq = -1  // Track last processed chunk sequence

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

// Draw RGB emoji
function drawRGBEmoji(hex1536: string) {
    strip.clear()
    
    // 256 pixels × 6 hex chars per pixel (RRGGBB)
    for (let pixelIdx = 0; pixelIdx < N; pixelIdx++) {
        let hexOffset = pixelIdx * 6
        if (hexOffset + 5 >= hex1536.length) break
        
        let r = hexToByte(hex1536, hexOffset)
        let g = hexToByte(hex1536, hexOffset + 2)
        let b = hexToByte(hex1536, hexOffset + 4)
        
        if (r > 0 || g > 0 || b > 0) {
            let x = pixelIdx % W
            let y = Math.idiv(pixelIdx, W)
            strip.setPixelColor(xyToIndex(x, y), neopixel.rgb(r, g, b))
        }
    }
    
    strip.show()
    basic.showIcon(IconNames.Yes)  // Quick confirmation
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
        const needLen = 8 + 1536 // "RGBMOJI:" + 1536 hex chars = 1544 total
        if (rgbIdx > 0) emojiBuf = emojiBuf.substr(rgbIdx)
        
        if (emojiBuf.length >= needLen) {
            // Extract exactly 1536 hex characters after "RGBMOJI:"
            let hex1536 = emojiBuf.substr(8, 1536)
            emojiBuf = ""  // Clear buffer immediately
            basic.showIcon(IconNames.Heart)
            drawRGBEmoji(hex1536)
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
})
