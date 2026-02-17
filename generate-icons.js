/**
 * PNG Icon Generator for NA Flute Learner PWA
 * Creates simple placeholder icons
 * 
 * Run with: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// CRC32 implementation
function makeCRCTable() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
    }
    return table;
}

const crcTable = makeCRCTable();

function crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    
    const typeBuffer = Buffer.from(type, 'ascii');
    
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = crc32(crcData);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc >>> 0, 0);
    
    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function createMinimalPNG(size) {
    const width = size;
    const height = size;
    
    // PNG signature
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    // IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8;  // bit depth
    ihdrData[9] = 2;  // color type (RGB)
    ihdrData[10] = 0; // compression
    ihdrData[11] = 0; // filter
    ihdrData[12] = 0; // interlace
    
    const ihdrChunk = createChunk('IHDR', ihdrData);
    
    // Create simple brown image data
    const rowSize = 1 + width * 3;
    const rawData = Buffer.alloc(height * rowSize);
    
    // Fill with brown color (#8B4513)
    for (let y = 0; y < height; y++) {
        const rowStart = y * rowSize;
        rawData[rowStart] = 0;
        for (let x = 0; x < width; x++) {
            const pixelStart = rowStart + 1 + x * 3;
            rawData[pixelStart] = 0x8B;
            rawData[pixelStart + 1] = 0x45;
            rawData[pixelStart + 2] = 0x13;
        }
    }
    
    const compressed = zlib.deflateSync(rawData);
    const idatChunk = createChunk('IDAT', compressed);
    
    const iendChunk = createChunk('IEND', Buffer.alloc(0));
    
    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function main() {
    const iconsDir = path.join(__dirname, 'icons');
    
    if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir, { recursive: true });
    }
    
    console.log('🎨 Generating PWA icons...');
    
    for (const size of sizes) {
        const filename = `icon-${size}.png`;
        const filepath = path.join(iconsDir, filename);
        
        try {
            const pngData = createMinimalPNG(size);
            fs.writeFileSync(filepath, pngData);
            console.log(`✅ Created ${filename} (${pngData.length} bytes)`);
        } catch (err) {
            console.error(`❌ Failed to create ${filename}:`, err.message);
        }
    }
    
    console.log('\n🎉 Icon generation complete!');
    console.log('\n📝 Note: These are placeholder brown square icons.');
    console.log('   For production, replace with proper icons using:');
    console.log('   - https://realfavicongenerator.net/');
    console.log('   - https://www.pwabuilder.com/imageGenerator');
    console.log('   - Or convert icons/icon.svg to PNG');
}

main();
