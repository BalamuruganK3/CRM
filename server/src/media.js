import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|avif|svg|heic|heif)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|m4v|mpeg|mpg|ogv)$/i;

export function isImageFile(file) {
  return String(file.mimetype || '').startsWith('image/') || IMAGE_EXT.test(file.originalname || '');
}

export function isVideoFile(file) {
  return String(file.mimetype || '').startsWith('video/') || VIDEO_EXT.test(file.originalname || '');
}

function webpOriginalName(name) {
  const base = path.basename(String(name || 'file'), path.extname(name || ''));
  return `${base || 'file'}.webp`;
}

function storedWebpName() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}.webp`;
}

function keepOriginal(file) {
  return {
    original_name: file.originalname,
    stored_name: file.filename,
    mime: file.mimetype,
    size: file.size,
  };
}

function runFfmpeg(src, dest) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('ffmpeg missing'));
      return;
    }
    const child = spawn(ffmpegPath, [
      '-y',
      '-i', src,
      '-t', '12',
      '-an',
      '-vf', "scale='min(1280,iw)':-2:flags=lanczos,fps=8",
      dest,
    ], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(dest)) resolve();
      else reject(new Error(stderr || `ffmpeg exited ${code}`));
    });
  });
}

export async function persistAsWebp(file, uploadDir) {
  if (!isImageFile(file) && !isVideoFile(file)) return keepOriginal(file);

  const storedName = storedWebpName();
  const dest = path.join(uploadDir, storedName);
  try {
    if (isImageFile(file)) {
      await sharp(file.path, { animated: true, limitInputPixels: false })
        .rotate()
        .webp({ quality: 80, effort: 4 })
        .toFile(dest);
    } else {
      await runFfmpeg(file.path, dest);
    }
    fs.unlink(file.path, () => {});
    const size = fs.statSync(dest).size;
    return {
      original_name: webpOriginalName(file.originalname),
      stored_name: storedName,
      mime: 'image/webp',
      size,
    };
  } catch {
    fs.unlink(dest, () => {});
    return keepOriginal(file);
  }
}
