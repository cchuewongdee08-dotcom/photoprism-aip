'use strict';

/**
 * จัดการ error ที่หลุดรอดจาก route
 * - error ที่มี status ใช้ตามนั้น (403 / 404 / 400 ...)
 * - error อื่น ๆ ถือเป็น 500
 */

function notFound(req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: `ไม่พบ API ที่ ${req.method} ${req.originalUrl}` });
  }
  return res.status(404).render('pages/error', {
    title: 'ไม่พบหน้าที่คุณค้นหา',
    statusCode: 404,
    message: 'ไม่พบหน้านี้ในระบบ PhotoPrism',
    detail: `URL: ${req.method} ${req.originalUrl}`,
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    console.error('[error]', err);
  }

  if (req.path.startsWith('/api')) {
    return res.status(status).json({
      error: status >= 500 ? 'Internal Server Error' : err.message,
    });
  }

  // ถ้าไฟล์ถูกอัปโหลดมาแล้วเกิด error ควรลบทิ้งไม่ให้เป็นไฟล์กรอก
  if (req.file) {
    try {
      require('../utils/storage').deleteUploadedFile(req.file.filename);
    } catch {
      /* ignore */
    }
  }

  return res.status(status).render('pages/error', {
    title: status === 403 ? 'ไม่มีสิทธิ์เข้าถึง' : 'เกิดข้อผิดพลาด',
    statusCode: status,
    message: status >= 500 ? 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง' : err.message,
    detail: status >= 500 ? (process.env.NODE_ENV === 'production' ? '' : err.stack) : '',
  });
}

module.exports = { notFound, errorHandler };