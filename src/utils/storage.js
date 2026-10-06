'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { imageSize } = require('image-size');

const config = require('../config');

/** สร้างโฟลเดอร์ uploads ถ้ายังไม่มี */
function ensureUploadsDir() {
  fs.mkdirSync(config.paths.uploads, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureUploadsDir();
    cb(null, config.paths.uploads);
  },
  filename(req, file, cb) {
    // สุ่มชื่อไฟล์ใหม่ทุกครั้ง ป้องกันชื่อซ้ำและ path traversal
    const ext = config.upload.allowedMimeTypes[file.mimetype] || '.bin';
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, unique);
  },
});

/** กรองชนิดไฟล์ : อนุญาตเฉพาะรูปภาพ */
function fileFilter(req, file, cb) {
  if (config.upload.allowedMimeTypes[file.mimetype]) {
    return cb(null, true);
  }
  const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file');
  error.message = 'รองรับเฉพาะไฟล์รูปภาพ (.jpg, .png, .gif, .webp)';
  return cb(error);
}

/** ตัวรับไฟล์อัปโหลด : รับ 1 ไฟล์ ชื่อฟิลด์ "file" ไม่เกิน 5 MB */
const uploadPhoto = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxFileSizeBytes, files: 1 },
}).single('file');

/**
 * ครอบ multer เพื่อแปลง error ให้เป็นข้อความภาษาไทยที่เข้าใจง่าย
 * และรับกรณีผู้ใช้ส่งไฟล์ผิดชนิด (เช่น .exe) ก่อนเขียนลงดิสก์
 */
function withUpload(handler) {
  return function wrapped(req, res, next) {
    uploadPhoto(req, res, (err) => {
      if (!err) return handler(req, res, next);

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(Object.assign(new Error('ไฟล์ใหญ่เกินไป (สูงสุด 5 MB)'), { status: 400 }));
        }
        return next(Object.assign(new Error(err.message || 'อัปโหลดไฟล์ไม่สำเร็จ'), { status: 400 }));
      }
      return next(err);
    });
  };
}

/** ลบไฟล์รูปที่อยู่ใน uploads (กันหลุดจากโฟลเดอร์ด้วย path.resolve) */
function deleteUploadedFile(fileName) {
  if (!fileName) return false;
  try {
    const target = path.resolve(config.paths.uploads, path.basename(fileName));
    if (!target.startsWith(path.resolve(config.paths.uploads))) return false;
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      return true;
    }
  } catch (error) {
    console.error('[storage] ลบไฟล์ไม่สำเร็จ:', error.message);
  }
  return false;
}

/** อ่านขนาดภาพ (px) จากไฟล์ที่อัปโหลด */
function readImageInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  const size = imageSize(buffer);
  return { width: size.width || null, height: size.height || null };
}

module.exports = {
  ensureUploadsDir,
  uploadPhoto,
  withUpload,
  deleteUploadedFile,
  readImageInfo,
};