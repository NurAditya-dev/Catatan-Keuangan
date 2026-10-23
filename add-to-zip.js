const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 Table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function appendToZip(zipPath, entryFileName, entryFilePath) {
  const zipBuf = fs.readFileSync(zipPath);
  const entryData = fs.readFileSync(entryFilePath);

  // Cari End of Central Directory (EOCD)
  // EOCD signature: 0x06054b50
  let eocdOffset = -1;
  for (let i = zipBuf.length - 22; i >= 0; i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('EOCD tidak ditemukan di dalam APK');
  }

  const numEntries = zipBuf.readUInt16LE(eocdOffset + 10);
  const cdSize = zipBuf.readUInt32LE(eocdOffset + 12);
  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);

  // Ambil isi Central Directory lama
  const oldCdBuf = zipBuf.slice(cdOffset, cdOffset + cdSize);
  const beforeCdBuf = zipBuf.slice(0, cdOffset);

  // Kompresi entry baru (metode 0 = STORED untuk unaligned, nanti zipalign yang merapikan)
  const entryCrc = crc32(entryData);
  const fileNameBuf = Buffer.from(entryFileName, 'utf8');

  // Buat Local File Header (30 byte + nama file)
  const lfh = Buffer.alloc(30);
  lfh.writeUInt32LE(0x04034b50, 0); // Local header signature
  lfh.writeUInt16LE(20, 4);         // Version needed to extract (2.0)
  lfh.writeUInt16LE(0, 6);          // General purpose bit flag
  lfh.writeUInt16LE(0, 8);          // Compression method (0 = Stored)
  lfh.writeUInt16LE(0, 10);         // Last mod file time
  lfh.writeUInt16LE(0, 12);         // Last mod file date
  lfh.writeUInt32LE(entryCrc, 14);  // CRC-32
  lfh.writeUInt32LE(entryData.length, 18); // Compressed size
  lfh.writeUInt32LE(entryData.length, 22); // Uncompressed size
  lfh.writeUInt16LE(fileNameBuf.length, 26); // File name length
  lfh.writeUInt16LE(0, 28);         // Extra field length

  const localFileOffset = beforeCdBuf.length;
  const newFileSection = Buffer.concat([lfh, fileNameBuf, entryData]);

  // Buat Central Directory Header (46 byte + nama file)
  const cdh = Buffer.alloc(46);
  cdh.writeUInt32LE(0x02014b50, 0); // Central header signature
  cdh.writeUInt16LE(20, 4);         // Version made by
  cdh.writeUInt16LE(20, 6);         // Version needed to extract
  cdh.writeUInt16LE(0, 8);          // General purpose bit flag
  cdh.writeUInt16LE(0, 10);         // Compression method (Stored)
  cdh.writeUInt16LE(0, 12);         // Last mod time
  cdh.writeUInt16LE(0, 14);         // Last mod date
  cdh.writeUInt32LE(entryCrc, 16);  // CRC-32
  cdh.writeUInt32LE(entryData.length, 20); // Compressed size
  cdh.writeUInt32LE(entryData.length, 24); // Uncompressed size
  cdh.writeUInt16LE(fileNameBuf.length, 28); // File name length
  cdh.writeUInt16LE(0, 30);         // Extra field length
  cdh.writeUInt16LE(0, 32);         // File comment length
  cdh.writeUInt16LE(0, 34);         // Disk number start
  cdh.writeUInt16LE(0, 36);         // Internal file attributes
  cdh.writeUInt32LE(0, 38);         // External file attributes
  cdh.writeUInt32LE(localFileOffset, 42); // Relative offset of local header

  const newCdEntry = Buffer.concat([cdh, fileNameBuf]);
  const newCdBuf = Buffer.concat([oldCdBuf, newCdEntry]);

  // Buat EOCD baru (22 byte)
  const newEocd = Buffer.alloc(22);
  newEocd.writeUInt32LE(0x06054b50, 0);
  newEocd.writeUInt16LE(0, 4);      // Number of this disk
  newEocd.writeUInt16LE(0, 6);      // Disk where central directory starts
  newEocd.writeUInt16LE(numEntries + 1, 8);  // Number of central directory records on this disk
  newEocd.writeUInt16LE(numEntries + 1, 10); // Total number of central directory records
  newEocd.writeUInt32LE(newCdBuf.length, 12); // Size of central directory
  newEocd.writeUInt32LE(beforeCdBuf.length + newFileSection.length, 16); // Offset of start of central directory
  newEocd.writeUInt16LE(0, 20);     // Comment length

  const finalZip = Buffer.concat([beforeCdBuf, newFileSection, newCdBuf, newEocd]);
  fs.writeFileSync(zipPath, finalZip);
  console.log(`Berhasil menambahkan '${entryFileName}' ke dalam APK!`);
}

const [,, zipArg, entryNameArg, entryFileArg] = process.argv;
if (!zipArg || !entryNameArg || !entryFileArg) {
  console.error('Usage: node add-to-zip.js <apkPath> <entryName> <filePath>');
  process.exit(1);
}

appendToZip(zipArg, entryNameArg, entryFileArg);
