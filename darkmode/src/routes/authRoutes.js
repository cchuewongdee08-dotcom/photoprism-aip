'use strict';

/**
 * Route: การยืนยันตัวตน (Authentication)
 *   GET  /login    แสดงหน้า Login
 *   POST /login    ตรวจชื่อผู้ใช้ + รหัสผ่าน แล้วสร้าง Session
 *   GET  /register แสดงหน้าสมัครบัญชี
 *   POST /register สมัครบัญชีใหม่ (บังคับ role = 'user' เสมอ)
 *   POST /logout   ออกจากระบบและลบ Session
 */

const express = require('express');

const authService = require('../services/authService');
const userService = require('../services/userService');
const { validateLogin, validateRegister } = require('../services/validation');
const { logAction } = require('../services/logService');

const router = express.Router();

/** ถ้า Login อยู่แล้ว ไม่ต้องเห็นหน้า Login */
function redirectIfLoggedIn(req, res, next) {
  if (req.user) return res.redirect('/');
  return next();
}

/** กัน open redirect: ยอมรับเฉพาะ path ภายในเว็บ */
function safeNextPath(raw) {
  const value = typeof raw === 'string' ? raw : '';
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

// ---------------------------------------------------------------
// Login
// ---------------------------------------------------------------
router.get('/login', redirectIfLoggedIn, (req, res) => {
  res.render('pages/login', {
    title: 'เข้าสู่ระบบ',
    errors: {},
    values: {},
    next: safeNextPath(req.query.next),
  });
});

router.post('/login', redirectIfLoggedIn, async (req, res, next) => {
  try {
    const { isValid, errors, values } = validateLogin(req.body);

    if (!isValid) {
      return res.status(400).render('pages/login', {
        title: 'เข้าสู่ระบบ',
        errors,
        values: { username: values.username },
        next: safeNextPath(req.body.next),
      });
    }

    const result = await authService.authenticate(values.username, values.password);

    if (!result.ok) {
      return res.status(401).render('pages/login', {
        title: 'เข้าสู่ระบบ',
        errors: { form: result.reason },
        values: { username: values.username },
        next: safeNextPath(req.body.next),
      });
    }

    await authService.startSession(req, result.user);
    return res.redirect(safeNextPath(req.body.next));
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------
// Register (สมัครบัญชีใหม่)
// ---------------------------------------------------------------
router.get('/register', redirectIfLoggedIn, (req, res) => {
  res.render('pages/register', { title: 'สมัครบัญชี', errors: {}, values: {} });
});

router.post('/register', redirectIfLoggedIn, async (req, res, next) => {
  try {
    const { isValid, errors, values } = validateRegister(req.body);

    if (!isValid) {
      return res.status(400).render('pages/register', { title: 'สมัครบัญชี', errors, values });
    }

    const clash = userService.existsByUsernameOrEmail(values);
    if (clash === 'username') {
      return res.status(409).render('pages/register', {
        title: 'สมัครบัญชี',
        errors: { username: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' },
        values,
      });
    }
    if (clash === 'email') {
      return res.status(409).render('pages/register', {
        title: 'สมัครบัญชี',
        errors: { email: 'อีเมลนี้ถูกใช้งานแล้ว' },
        values,
      });
    }

    // role ถูกกำหนดเป็น 'user' ตายตัวฝั่ง Server ไม่รับค่า role จากฟอร์ม
    await userService.createUser(
      { ...values, role: 'user', status: 'active' },
      { id: null, username: 'register' }
    );

    req.session.flash = { type: 'success', message: `สมัครบัญชี "${values.username}" สำเร็จ กรุณาเข้าสู่ระบบ` };
    return res.redirect('/login');
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------
// Logout
// ---------------------------------------------------------------
router.post('/logout', async (req, res, next) => {
  try {
    await authService.endSession(req);
    return res.redirect('/login');
  } catch (error) {
    return next(error);
  }
});

module.exports = router;