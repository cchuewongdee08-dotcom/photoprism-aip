'use strict';

const userService = require('../services/userService');
const authService = require('../services/authService');

/**
 * Middleware ระบบสิทธิ์ (Authorization)
 * ------------------------------------------------------
 * หลักการสำคัญ: ทุก Route ที่เป็นสิทธิ์เฉพาะ ต้องผ่าน middleware นี้
 * ฝั่ง Server จะเป็นคนตัดสิน ไม่ใช่ซ่อนปุ่มหน้าเว็บอย่างเดียว
 * ดังนั้นผู้ใช้ที่แก้ URL หรือยิง API ตรง ๆ ก็ถูกปฏิเสธเช่นกัน
 */

/**
 * ผูกข้อมูลผู้ใช้ไว้ที่ req.user (ใช้ในทุกหน้า)
 *
 * สำคัญ : ไม่เชื่อข้อมูล role/status ที่เก็บไว้ใน session อย่างเดียว
 * แต่จะอ่านค่าล่าสุดจากฐานข้อมูลทุกครั้งที่มี request
 * ผลคือ เมื่อ Admin ระงับบัญชี หรือลดสิทธิ์ผู้ใช้ ผู้ใช้คนนั้นจะเสียสิทธิ์ทันที
 * โดยไม่ต้องรอให้เขา Logout ออกจากระบบ
 */
function attachUser(req, res, next) {
  req.user = null;

  if (req.session && req.session.user) {
    const fresh = userService.findById(req.session.user.id);

    // บัญชีถูกลบออกจากระบบไปแล้ว
    if (!fresh) return dropSession(req, res, next, 'บัญชีนี้ไม่มีอยู่ในระบบแล้ว กรุณาเข้าสู่ระบบใหม่');

    // บัญชีถูกระงับระหว่างที่ยัง Login อยู่ -> ตัดสิทธิ์ทันที
    if (fresh.status !== 'active') {
      return dropSession(req, res, next, 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
    }

    // ซิงก์ role/status ล่าสุดจากฐานข้อมูล (กันกรณีถูกเปลี่ยนสิทธิ์ระหว่างที่ยัง Login อยู่)
    req.session.user = authService.toPublicUser(fresh);
    req.user = req.session.user;
  }

  res.locals.currentUser = req.user;
  res.locals.isAdmin = Boolean(req.user && req.user.role === 'admin');
  return next();
}

/** ล้าง session เดิมแล้วออกใหม่ พร้อมแจ้งเหตุผล (ป้องกัน session เก่ายังถูกใช้ต่อได้) */
function dropSession(req, res, next, message) {
  return req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.flash = { type: 'danger', message };

    // บังคับบันทึกทันที เพื่อให้ข้อความแจ้งเตือนไม่หายก่อนผู้ใช้เห็น
    return req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      if (wantsJson(req)) {
        return res.status(403).json({ error: message });
      }
      return res.redirect('/login');
    });
  });
}

/** ต้อง Login ก่อน (สำหรับหน้าเว็บ) -> ย้ายไปหน้า Login */
function requireAuthPage(req, res, next) {
  if (req.user) return next();

  if (wantsJson(req)) {
    return res.status(401).json({ error: 'Unauthorized: กรุณาเข้าสู่ระบบก่อน' });
  }
  const next_ = encodeURIComponent(req.originalUrl || '/');
  return res.redirect(`/login?next=${next_}`);
}

/** ต้องเป็น Admin เท่านั้น (สำหรับหน้าเว็บ) -> 403 */
function requireAdminPage(req, res, next) {
  if (!req.user) {
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl || '/')}`);
  }
  if (req.user.role !== 'admin') {
    return res.status(403).render('pages/error', {
      title: 'ไม่มีสิทธิ์เข้าถึง',
      statusCode: 403,
      message: 'หน้านี้สงวนไว้สำหรับผู้ดูแลระบบ (Admin) เท่านั้น',
      detail:
        `คุณกำลังเข้าสู่ระบบด้วยบัญชี "${req.user.username}" ซึ่งมีสิทธิ์ระดับ ` +
        `"${req.user.role}" — การตรวจสอบนี้เกิดขึ้นที่ Server (middleware requireAdminPage) ` +
        'ไม่ใช่การซ่อนเมนูในหน้าเว็บ',
    });
  }
  return next();
}

/** ต้องเป็น Admin เท่านั้น (สำหรับ REST API) -> 403 JSON */
function requireAdminApi(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: กรุณาเข้าสู่ระบบก่อน' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden: ต้องเป็นผู้ดูแลระบบ (Admin) เท่านั้น',
      yourRole: req.user.role,
      requiredRole: 'admin',
    });
  }
  return next();
}

/** บังคับให้ Login (สำหรับ REST API) -> 401 JSON */
function requireAuthApi(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: กรุณาเข้าสู่ระบบก่อน' });
  }
  return next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * ป้องกัน CSRF อย่างง่าย (Cross-Site Request Forgery)
 * ------------------------------------------------------
 * เบราว์เซอร์จะส่ง header Origin มาทุกครั้งที่ยิงคำขอจากเว็บไซต์อื่น (ข้ามโดเมน)
 * ถ้า Origin ไม่ตรงกับเว็บไซต์เรา แสดงว่าเป็นคำขอจากเว็บภายนอก -> ปฏิเสธ
 * ถ้าไม่มี Origin (เช่น โปรแกรมยิง API ตรง ๆ อย่าง curl / Postman) จะไม่บล็อก
 */
function requireSameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (!origin) return next();

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return forbiddenOrigin(req, res, origin);
  }

  if (originHost !== req.get('host')) {
    return forbiddenOrigin(req, res, origin);
  }
  return next();
}

function forbiddenOrigin(req, res, origin) {
  const message = `ปฏิเสธคำขอจากเว็บไซต์ภายนอก (Origin: ${origin})`;
  if (wantsJson(req)) {
    return res.status(403).json({ error: 'Forbidden: ' + message });
  }
  return res.status(403).render('pages/error', {
    title: 'ไม่มีสิทธิ์เข้าถึง',
    statusCode: 403,
    message,
    detail: 'ระบบตรวจสอบที่มาของคำขอที่ฝั่ง Server เพื่อป้องกันการร้องขอจากเว็บไซต์ภายนอก',
  });
}

function wantsJson(req) {
  return req.path.startsWith('/api') || (req.get('accept') || '').includes('application/json');
}

module.exports = {
  attachUser,
  requireAuthPage,
  requireAdminPage,
  requireAuthApi,
  requireAdminApi,
  requireSameOrigin,
};