'use strict';

/**
 * PhotoPrism REST API v1
 * ---------------------------------------------------------------
 * กลุ่ม endpoint สำหรับทดสอบผ่าน REST Client (VS Code) / curl
 *   POST   /api/v1/register           สมัครสมาชิกใหม่ (ได้สิทธิ์ user)
 *   POST   /api/v1/session            เข้าสู่ระบบ -> คืน token + sessionId
 *   GET    /api/v1/session            ดูผู้ใช้ปัจจุบัน (ตรวจว่า token ใช้ได้)
 *   DELETE /api/v1/session            ออกจากระบบ (ลบ token + session)
 *   GET    /api/v1/my-uploads         ดูรูปที่ตัวเองเป็นคนอัปโหลด (ต้อง Login)
 *   PATCH  /api/v1/account/password   เปลี่ยนรหัสผ่านของตัวเอง
 *
 * ส่วน Photos / Albums ใช้ handler ชุดเดิมของ apiRoutes
 * โดย mount apiRoutes ที่ prefix /api/v1 เพิ่มใน src/app.js (ไม่เขียนซ้ำ)
 */

const express = require('express');

const config = require('../config');
const authService = require('../services/authService');
const tokenService = require('../services/tokenService');
const userService = require('../services/userService');
const photoService = require('../services/photoService');
const { logAction } = require('../services/logService');
const { validateLogin, validateRegister, validatePasswordChange } = require('../services/validation');
const { bearerToken, requireAuthApi } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------
// Register — POST /api/v1/register
// รับ { username, email, password, confirmPassword, fullName? }
// สมัครได้เองจาก REST Client โดยไม่ต้องเข้าเว็บ
// หมายเหตุ: role ถูกบังคับเป็น 'user' เสมอ (ไม่รับ role จาก body)
// ---------------------------------------------------------------
router.post('/register', async (req, res, next) => {
  try {
    const { isValid, errors, values } = validateRegister(req.body);
    if (!isValid) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง', details: errors });

    const clash = userService.existsByUsernameOrEmail(values);
    if (clash === 'username') return res.status(409).json({ error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' });
    if (clash === 'email') return res.status(409).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });

    const created = await userService.createUser(
      { ...values, role: 'user', status: 'active' },
      { id: null, username: 'register' }
    );

    return res.status(200).json({ message: 'สมัครสมาชิกสำเร็จ', user: created });
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------
// Login — POST /api/v1/session
// รับ { username, password } แล้วคืน token + sessionId
// ---------------------------------------------------------------
router.post('/session', async (req, res, next) => {
  try {
    const { isValid, errors, values } = validateLogin(req.body);
    if (!isValid) return res.status(400).json({ error: 'ข้อมูลไม่ครบ', details: errors });

    const result = await authService.authenticate(values.username, values.password);
    if (!result.ok) return res.status(401).json({ error: result.reason });

    // เปิด session (เผื่อไคลเอนต์ใช้ cookie) แล้วออก token สำหรับ API
    await authService.startSession(req, result.user);
    const token = tokenService.issue(result.user, req.sessionID);

    return res.json({
      message: 'เข้าสู่ระบบสำเร็จ',
      token,
      tokenType: 'Bearer',
      sessionId: req.sessionID,
      expiresIn: Math.floor(config.sessionMaxAgeMs / 1000),
      user: req.session.user,
    });
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------
// Current Session — GET /api/v1/session
// ---------------------------------------------------------------
router.get('/session', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized: ยังไม่ได้เข้าสู่ระบบ' });
  return res.json({ user: req.user });
});

// ---------------------------------------------------------------
// Logout — DELETE /api/v1/session
// ---------------------------------------------------------------
router.delete('/session', async (req, res, next) => {
  try {
    const token = bearerToken(req);
    if (token) tokenService.revoke(token);

    if (req.session && req.session.user) {
      // ยืนยันด้วย cookie -> ให้ endSession บันทึก Log และทำลาย session
      await authService.endSession(req);
    } else if (req.user) {
      // ยืนยันด้วย token เท่านั้น -> บันทึก Log เอง
      logAction(req.user, 'LOGOUT', req.user.username);
    }

    return res.json({ message: 'ออกจากระบบแล้ว' });
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------
// My Uploads — GET /api/v1/my-uploads
// ---------------------------------------------------------------
// แสดงรูปทั้งหมดที่ "ผู้ใช้ที่ Login อยู่" เป็นคนอัปโหลด
//
// สำคัญ : ไม่รับ userId จากฝั่ง Client เด็ดขาด
//         ระบบจะเอา owner_id จาก session/token ที่ฝั่ง Backend
//         ตรวจสอบแล้วเท่านั้น จึงดูรูปของคนอื่นด้วย endpoint นี้ไม่ได้
//
// สำหรับผู้ใช้ทั่วไป -> เห็นเฉพาะรูปของตัวเอง (รวมที่ตั้ง private)
// สำหรับ Admin      -> ใช้สิทธิ์เดิมของโปรเจกต์ คือเห็นรูปของทุกคน
//
// วันที่อัปโหลดอ่านจากคอลัมน์ photos.created_at ที่มีอยู่แล้วใน schema
// (ค่าเริ่มต้นคือ datetime('now', 'localtime') ตอนที่อัปโหลด ไม่ต้องเพิ่ม field ใหม่)
// ---------------------------------------------------------------
router.get('/my-uploads', requireAuthApi, (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';

    // ใช้ photoService ชุดเดิมของโปรเจกต์ ไม่เขียน query ใหม่เอง
    const result = photoService.listPhotos({
      user: req.user,
      scope: isAdmin ? 'all' : 'mine',
      page: 1,
      perPage: 1000,
    });

    const photos = result.photos.map((photo) => ({
      id: photo.id,
      filename: photo.original_name || photo.file_name,
      fileUrl: `/uploads/${photo.file_name}`,
      title: photo.title,
      visibility: photo.visibility,
      owner: photo.owner_username,
      uploadedAt: photo.created_at,
    }));

    return res.json({
      success: true,
      username: req.user.username,
      scope: isAdmin ? 'all' : 'mine',
      total: photos.length,
      photos,
    });
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------
// Change Password — PATCH /api/v1/account/password
// รับ { currentPassword, newPassword, confirmPassword }
// ต้อง Login ก่อน (ใช้ token จาก /api/v1/session)
// ---------------------------------------------------------------
router.patch('/account/password', requireAuthApi, async (req, res, next) => {
  try {
    const { isValid, errors, values } = validatePasswordChange(req.body);
    if (!isValid) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง', details: errors });

    await userService.changeOwnPassword(
      req.user.id,
      values.currentPassword,
      values.newPassword,
      req.user
    );

    return res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
