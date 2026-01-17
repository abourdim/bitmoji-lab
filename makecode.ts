/**
 * micro:bit 16x16 Emoji Receiver (ACK-first, chunk-safe)
 * - RX/TX buffer size = 200 (as requested)
 * - Echoes immediately for ACK (keeps your web timing unchanged)
 * - Buffers ONLY emoji chunks (so Test 0..1000 still works)
 * - Displays on 16x16 NeoPixel (256 LEDs) on P0
 */

const LED_PIN = DigitalPin.P0
const W = 16
const H = 16
const N = W * H

let strip = neopixel.create(LED_PIN, N, NeoPixelMode.RGB)
strip.setBrightness(40)
strip.clear()
strip.show()

serial.redirectToUSB()
serial.setRxBufferSize(200)
serial.setTxBufferSize(200)

// Reassembly buffer (only used for emoji)
let emojiBuf = ""

// Serpentine mapping (common 16x16 panels)
function xyToIndex(x: number, y: number): number {
    if (y % 2 == 0) return y * W + x
    return y * W + (W - 1 - x)
}

function hexToNibble(c: string): number {
    if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48
    if (c >= "A" && c <= "F") return c.charCodeAt(0) - 55
    if (c >= "a" && c <= "f") return c.charCodeAt(0) - 87
    return 0
}

function drawEmoji(hex64: string) {
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

    // NeoPixel show can be slow-ish → DO NOT do this before ACK
    strip.show()
}

function tryConsumeEmojiBuffer() {
    // Need: "EMOJI:" + 64 hex chars
    const needLen = 6 + 64

    // Resync if needed
    let idx = emojiBuf.indexOf("EMOJI:")
    if (idx > 0) emojiBuf = emojiBuf.substr(idx)
    if (idx == -1) {
        if (emojiBuf.length > 200) emojiBuf = ""
        return
    }

    if (emojiBuf.length >= needLen) {
        let hex64 = emojiBuf.substr(6, 64)
        emojiBuf = ""          // reset buffer BEFORE drawing
        drawEmoji(hex64)
    }
}

basic.showIcon(IconNames.Yes)

serial.onDataReceived(serial.delimiters(Delimiters.NewLine), function () {
    let line = serial.readUntil(serial.delimiters(Delimiters.NewLine)).trim()
    if (line.length == 0) return

    // ✅ ACK FIRST (critical)
    serial.writeString(">" + line + "\n")

    // Chunk format: "seq|payload"
    let bar = line.indexOf("|")
    if (bar != -1) {
        let payload = line.substr(bar + 1)

        // ✅ Buffer ONLY emoji chunks:
        // - start buffering if chunk begins with EMOJI:
        // - or continue buffering if already in emoji mode
        if (payload.indexOf("EMOJI:") == 0 || emojiBuf.length > 0) {
            emojiBuf = emojiBuf + payload
            tryConsumeEmojiBuffer()
        }
        return
    }

    // Non-chunk emoji: "EMOJI:<hex64>"
    if (line.indexOf("EMOJI:") == 0) {
        emojiBuf = line
        tryConsumeEmojiBuffer()
        return
    }

    // Anything else (like Test 0..1000 chunks) is ignored here,
    // but was already echoed for ACK above.
})

