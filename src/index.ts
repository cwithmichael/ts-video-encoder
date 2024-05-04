import zlib from "zlib";
import * as fs from "fs";
import { parseArgs } from "node:util";

// cat video.rgb24 | npm run start -- --width 384 --height 216
const {
  values: { width, height },
} = parseArgs({
  options: {
    width: {
      type: "string",
      short: "w",
      default: "384",
    },
    height: {
      type: "string",
      short: "h",
      default: "216",
    },
  },
});

function main() {
  let w = Number(width!);
  let h = Number(height!);
  getFrames(process.stdin, w, h, (frames: any, rawSize: number) => {
    convertToYUV420p(frames, rawSize, w, h);
    writeFile("encoded.yuv", frames);
    // The run length encoding is more of an exercise in compression
    // Doesn't affect the final output
    runLengthEncode(frames, rawSize);
    const deflated = deflateEncoding(frames, rawSize);
    const decodedFrames = decode(deflated, w, h);
    writeFile("decoded.yuv", decodedFrames);
    convertYUVToRGB(decodedFrames, w, h);
    writeFile("decoded.rgb24", decodedFrames);
  });
}

/**
 * Writes data to a file.
 * @param filename - The name of the file to write to.
 * @param data - The data to write to the file.
 */
function writeFile(filename: string, data: any) {
  fs.writeFileSync(filename, Buffer.concat(data), {
    encoding: "binary",
    mode: 0o644,
  });
  console.log("Wrote %s", filename);
}

/**
 * Calculates the total size of a sequence of strings or buffers.
 *
 * @param seq - The sequence of strings or buffers.
 * @returns The total size of the sequence.
 */
function size(seq: (string | Buffer)[]) {
  return seq.reduce((acc, frame) => acc + frame.length, 0);
}

/**
 * Retrieves frames from a readable stream and returns them in an array.
 *
 * @param stream - The readable stream to retrieve frames from.
 * @param width - The width of each frame.
 * @param height - The height of each frame.
 * @param cb - The callback function to be called with the frames and raw size.
 * @returns The readable stream with an "end" event listener attached.
 */
function getFrames(
  stream: NodeJS.ReadableStream,
  width: number,
  height: number,
  cb: any
) {
  const frames: (string | Buffer)[] = [];
  stream.on("readable", () => {
    let chunk;
    while (null !== (chunk = stream.read(width * height * 3))) {
      frames.push(chunk);
    }
  });
  return stream.on("end", () => {
    const rawSize = size(frames);
    console.log("Raw size: %d bytes", rawSize);
    cb(frames, rawSize);
  });
}

/**
 * Downsamples the U and V arrays based on the specified width and height.
 *
 * @param U - The U array.
 * @param V - The V array.
 * @param width - The width of the image.
 * @param height - The height of the image.
 * @returns An array containing the downsampled U and V arrays.
 */
function downsample(U: any[], V: any[], width: number, height: number) {
  const uDownsampled = Buffer.alloc((width * height) / 4);
  const vDownsampled = Buffer.alloc((width * height) / 4);
  for (let x = 0; x < height; x += 2) {
    for (let y = 0; y < width; y += 2) {
      let u =
        (U[x * width + y] +
          U[x * width + y + 1] +
          U[(x + 1) * width + y] +
          U[(x + 1) * width + y + 1]) /
        4;
      let v =
        (V[x * width + y] +
          V[x * width + y + 1] +
          V[(x + 1) * width + y] +
          V[(x + 1) * width + y + 1]) /
        4;
      uDownsampled[(x / 2) * (width / 2) + y / 2] = u;
      vDownsampled[(x / 2) * (width / 2) + y / 2] = v;
    }
  }
  return [uDownsampled, vDownsampled];
}

/**
 * Converts an array of RGB frames to YUV420p format.
 *
 * @param frames - An array of RGB frames represented as strings or Buffers.
 * @param rawSize - The size of the raw frames in bytes.
 * @param width - The width of each frame in pixels.
 * @param height - The height of each frame in pixels.
 */
function convertToYUV420p(
  frames: (string | Buffer)[],
  rawSize: number,
  width: number,
  height: number
) {
  frames.forEach((frame, i) => {
    const Y = Buffer.alloc(width * height);
    const U = Array(width * height).fill(0);
    const V = Array(width * height).fill(0);
    for (let j = 0; j < width * height; j++) {
      // Convert the pixel from RGB to YUV
      const [r, g, b] = [
        Number(frame[j * 3]),
        Number(frame[j * 3 + 1]),
        Number(frame[j * 3 + 2]),
      ];
      // These coefficients are from the ITU-R standard.
      // See https://en.wikipedia.org/wiki/YUV#Y%E2%80%B2UV444_to_RGB888_conversion
      // for more information.
      let y = +0.299 * r + 0.587 * g + 0.114 * b;
      let u = -0.169 * r - 0.331 * g + 0.449 * b + 128;
      let v = 0.499 * r - 0.418 * g - 0.0813 * b + 128;

      Y[j] = y;
      U[j] = u;
      V[j] = v;
    }
    const [uDownsampled, vDownsampled] = downsample(U, V, width, height);
    const yuv420p = Buffer.concat([
      Buffer.from(Y),
      Buffer.from(uDownsampled),
      Buffer.from(vDownsampled),
    ]);
    frames[i] = yuv420p;
  });
  console.log(
    "YUV420p size: %d bytes (%f% original size)",
    size(frames),
    ((100 * size(frames)) / rawSize).toFixed(2)
  );
}

/**
 * Encodes an array of frames using the Run-Length Encoding (RLE) algorithm.
 * @param frames - An array of frames to be encoded. Each frame can be a string or a Buffer.
 * @param rawSize - The size of the original frames before encoding.
 */
function runLengthEncode(frames: (string | Buffer)[], rawSize: number) {
  const encoded = Array(frames.length);
  for (let i = 0; i < frames.length; i++) {
    if (i == 0) {
      encoded[i] = frames[i];
      continue;
    }
    const delta = Buffer.alloc(frames[i].length);
    for (let j = 0; j < delta.length; j++) {
      delta[j] = Number(frames[i][j]) - Number(frames[i - 1][j]);
    }

    let rle = [];
    for (let j = 0; j < delta.length; ) {
      let count = 0;
      for (count = 0; count < 255 && j + count < delta.length; count++) {
        if (delta[j + count] != delta[j]) {
          break;
        }
      }
      rle.push(count);
      rle.push(delta[j]);
      j += count;
    }
    encoded[i] = rle;
  }

  const rleSize = size(encoded);
  console.log(
    "RLE size: %d bytes (%f% original size)",
    rleSize,
    ((100 * rleSize) / rawSize).toFixed(2)
  );
}

/**
 * Deflates the encoding of video frames.
 *
 * @param frames - An array of video frames, each frame can be a string or a Buffer.
 * @param rawSize - The size of the original video data in bytes.
 * @returns The deflated video encoding as a Buffer.
 */
function deflateEncoding(frames: (string | Buffer)[], rawSize: number) {
  let deflated = Buffer.alloc(0);
  for (let i = 0; i < frames.length; i++) {
    if (i == 0) {
      deflated = zlib.gzipSync(frames[i]);
      continue;
    }
    const delta = Buffer.alloc(frames[i].length);
    for (let j = 0; j < delta.length; j++) {
      delta[j] = Number(frames[i][j]) - Number(frames[i - 1][j]);
    }
    deflated = Buffer.concat([deflated, zlib.gzipSync(delta)]);
  }
  console.log(
    "Deflated size: %d bytes (%f% original size)",
    deflated.length,
    ((100 * deflated.length) / rawSize).toFixed(2)
  );

  return deflated;
}

/**
 * Decodes the deflated video frames and returns an array of decoded frames.
 *
 * @param deflated - The deflated video frames.
 * @param width - The width of the video frames.
 * @param height - The height of the video frames.
 * @returns An array of decoded frames.
 */
function decode(deflated: any, width: number, height: number) {
  const inflated = zlib.gunzipSync(deflated);
  const decodedFrames = [];
  let idx = 0;
  while (idx < inflated.length) {
    const frame = Buffer.copyBytesFrom(inflated, idx, (width * height * 3) / 2);
    decodedFrames.push(frame);
    idx += (width * height * 3) / 2;
  }
  for (let i = 0; i < decodedFrames.length; i++) {
    if (i == 0) {
      continue;
    }
    for (let j = 0; j < decodedFrames[i].length; j++) {
      decodedFrames[i][j] += decodedFrames[i - 1][j];
    }
  }
  return decodedFrames;
}

/**
 * Clamps a number between a minimum and maximum value.
 * @param x The number to clamp.
 * @param min The minimum value.
 * @param max The maximum value.
 * @returns The clamped value.
 */
function clamp(x: number, min: number, max: number) {
  return Math.min(Math.max(x, min), max);
}

/**
 * Converts YUV frames to RGB frames.
 *
 * @param decodedFrames - An array of YUV frames to be converted.
 * @param width - The width of the frames.
 * @param height - The height of the frames.
 */
function convertYUVToRGB(
  decodedFrames: Buffer[],
  width: number,
  height: number
) {
  decodedFrames.forEach((frame, idx) => {
    const Y = frame.subarray(0, width * height);
    const U = frame.subarray(
      width * height,
      Math.floor(width * height + (width * height) / 4)
    );
    const V = frame.subarray(Math.floor(width * height + (width * height) / 4));

    const rgb = Buffer.alloc(width * height * 3);
    for (let j = 0; j < height; j++) {
      for (let k = 0; k < width; k++) {
        const y = Y[j * width + k];
        const u =
          U[Math.floor(j / 2) * Math.floor(width / 2) + Math.floor(k / 2)] -
          128;
        const v =
          V[Math.floor(j / 2) * Math.floor(width / 2) + Math.floor(k / 2)] -
          128;

        const r = clamp(y + 1.402 * v, 0, 255);
        const g = clamp(y - 0.344136 * u - 0.714 * v, 0, 255);
        const b = clamp(y + 1.772 * u, 0, 255);
        rgb[j * width * 3 + k * 3] = r;
        rgb[j * width * 3 + k * 3 + 1] = g;
        rgb[j * width * 3 + k * 3 + 2] = b;
      }
    }
    decodedFrames[idx] = rgb;
  });
}

main();
