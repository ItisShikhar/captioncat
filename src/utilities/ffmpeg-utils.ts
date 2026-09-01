import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { runFfmpeg } from './ffmpeg-runner';

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const value of input) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(chunkType: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const type = Buffer.from(chunkType, 'utf8');
  const chunkData = Buffer.concat([length, type, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(chunkData.subarray(4)), 0);
  return Buffer.concat([chunkData, crc]);
}

export function addPngTextMetadata(pngBuffer: Buffer, metadata: Readonly<Record<string, string>>): Buffer {
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!pngBuffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error('Cannot add PNG metadata to an invalid PNG buffer.');
  }

  const textChunks = Object.entries(metadata).map(([keyword, value]) => {
    if (!/^[\x20-\x7e]{1,79}$/.test(keyword)) {
      throw new Error(`PNG metadata keyword must contain 1 to 79 printable ASCII characters: ${keyword}`);
    }
    return pngChunk('tEXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')]));
  });

  if (textChunks.length === 0) {
    return pngBuffer;
  }

  let offset = pngSignature.length;
  while (offset + 12 <= pngBuffer.length) {
    const dataLength = pngBuffer.readUInt32BE(offset);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > pngBuffer.length) {
      throw new Error('Cannot add PNG metadata to a truncated PNG buffer.');
    }
    const chunkType = pngBuffer.toString('ascii', offset + 4, offset + 8);
    if (chunkType === 'IDAT') {
      return Buffer.concat([pngBuffer.subarray(0, offset), ...textChunks, pngBuffer.subarray(offset)]);
    }
    offset = chunkEnd;
  }

  throw new Error('Cannot add PNG metadata because the PNG has no IDAT chunk.');
}

function createPngBuffer(width: number, height: number, color: { r: number; g: number; b: number; a: number }): Buffer {
  const rowBytes = width * 4;
  const rawData = Buffer.alloc(height * rowBytes + height);
  let offset = 0;

  for (let y = 0; y < height; y += 1) {
    rawData[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      rawData[offset] = color.r;
      rawData[offset + 1] = color.g;
      rawData[offset + 2] = color.b;
      rawData[offset + 3] = color.a;
      offset += 4;
    }
  }

  const compressed = deflateSync(rawData);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);

  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = pngChunk('IHDR', ihdr);
  const idatChunk = pngChunk('IDAT', compressed);
  const iendChunk = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk]);
}

async function writePngFile(
  outputPath: string,
  width: number,
  height: number,
  color: { r: number; g: number; b: number; a: number },
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const pngBuffer = createPngBuffer(width, height, color);
  await fs.promises.writeFile(outputPath, pngBuffer);
}

export async function createTransparentBlankPng(outputPath: string, width: number, height: number): Promise<void> {
  await writePngFile(outputPath, width, height, { r: 0, g: 0, b: 0, a: 0 });
}

export async function createSolidColorVideo(
  outputPath: string,
  options: { width: number; height: number; duration: number; fps?: number; pixelFormat?: string },
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const tempImagePath = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath, path.extname(outputPath))}-solid.png`,
  );
  await writePngFile(tempImagePath, options.width, options.height, { r: 0, g: 0, b: 0, a: 255 });

  await runFfmpeg([
    '-y',
    '-loop',
    '1',
    '-i',
    tempImagePath,
    '-t',
    String(options.duration),
    '-c:v',
    'libx264',
    '-r',
    String(options.fps ?? 30),
    '-pix_fmt',
    options.pixelFormat ?? 'yuv420p',
    outputPath,
  ]);

  await fs.promises.rm(tempImagePath, { force: true }).catch(() => undefined);
}
