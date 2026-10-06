'use strict';

/**
 * Route: ส่วนของผู้ดูแลระบบ (Admin)
 * ---------------------------------------------------------------
 * จุดสำคัญ: router.use(requireAdminPage) ครอบทั้งไฟล์นี้
 * ทำให้ทุก URL ใต้ /admin ถูกตรวจสิทธิ์ที่ Server โดยอัตโนมัติ
 * ไม่มีทางหลุดเข้ามาได้แม้ผู้ใช้พิมพ์ URL เอง
 */

const express = require('express');

const config = require('../config');
const userService = require('../services/userService');
const photoService = require('../services/photoService');
const { validateUserCreate, validateRole, validateStatus, toInt } = require('../services/validation');
const { requireAuthPage, requireAdminPage } = require('../middleware/auth');

const router = express.Router();

// ==== ด่านตรวจสิทธิ์ระดับ router (ใช้กับทุก route ในไฟล์นี้) ====
router.use(requireAuthPage, requireAdminPage);

function flash(req, type, message) {
  req.session.flash = { type, message };
}

// ---------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------
router.get('/', (req, res) => {
  const page = Math.max(1, toInt(req.query.page) || 1);
  const { logs, total } = userService.listLogs({ page, perPage: 8 });

  res.render('admin/dashboard', {
    title: 'แดชบอร์ดผู้ดูแลระบบ',
    stats: userService.getStats(),
    topOwners: userService.topOwners(5),
    logs,
    logTotal: total,
    logPage: page,
  });
});

// ---------------------------------------------------------------
// จัดการผู้ใช้
// ---------------------------------------------------------------
router.get('/users', (req, res) => {
  const page = Math.max(1, toInt(req.query.page) || 1);
  const filters = {
    keyword: typeof req.query.q === 'string' ? req.query.q : '',
    role: typeof req.query.role === 'string' ? req.query.role : '',
    status: typeof req.query.status === 'string' ? req.query.status : '',
    page,
    perPage: config.pagination.usersPerPage,
  };

  const result = userService.listUsers(filters);

  res.render('admin/users', {
    title: 'จัดการผู้ใช้',
    ...result,
    filters,
    errors: {},
    values: {},
  });
});

router.post('/users', async (req, res, next) => {
  try {
    const { isValid, errors, values } = validateUserCreate(req.body);

    if (!isValid) {
      const result = userService.listUsers({ page: 1, perPage: config.pagination.usersPerPage });
      return res.status(400).render('admin/users', {
        title: 'จัดการผู้ใช้',
        ...result,
        filters: { keyword: '', role: '', status: '', page: 1, perPage: config.pagination.usersPerPage },
        errors,
        values,
      });
    }

    const created = await userService.createUser(values, req.user);
    flash(req, 'success', `สร้างผู้ใช้ "${created.username}" (สิทธิ์ ${created.role}) สำเร็จ`);
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
});

router.post('/users/:id/role', (req, res, next) => {
  try {
    const { isValid, errors, values } = validateRole(req.body);
    if (!isValid) {
      flash(req, 'danger', errors.role || 'สิทธิ์ไม่ถูกต้อง');
      return res.redirect('/admin/users');
    }

    const updated = userService.changeRole(req.params.id, values.role, req.user);
    flash(req, 'success', `เปลี่ยนสิทธิ์ของ "${updated.username}" เป็น ${values.role} แล้ว`);
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
});

router.post('/users/:id/status', (req, res, next) => {
  try {
    const { isValid, errors, values } = validateStatus(req.body);
    if (!isValid) {
      flash(req, 'danger', errors.status || 'สถานะไม่ถูกต้อง');
      return res.redirect('/admin/users');
    }

    const updated = userService.changeStatus(req.params.id, values.status, req.user);
    flash(
      req,
      'success',
      `${values.status === 'active' ? 'เปิด' : 'ระงับ'}การใช้งานบัญชี "${updated.username}" แล้ว`
    );
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
});

router.post('/users/:id/delete', (req, res, next) => {
  try {
    const result = userService.deleteUser(req.params.id, req.user);

    // ลบไฟล์รูปของผู้ใช้ที่ถูกลบด้วย
    const { deleteUploadedFile } = require('../utils/storage');
    for (const photo of result.files) deleteUploadedFile(photo.file_name);

    flash(req, 'success', `ลบผู้ใช้ "${result.username}" และรูป ${result.deletedPhotos} รูปเรียบร้อยแล้ว`);
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------
// จัดการรูปทั้งระบบ
// ---------------------------------------------------------------
router.get('/photos', (req, res) => {
  const page = Math.max(1, toInt(req.query.page) || 1);
  const result = photoService.listPhotos({
    user: req.user, // Admin => เห็นทุกรูป รวมรูป private
    keyword: typeof req.query.q === 'string' ? req.query.q : '',
    page,
    perPage: config.pagination.photosPerPage,
  });

  res.render('admin/photos', { title: 'จัดการรูปทั้งระบบ', ...result });
});

router.post('/photos/:id/delete', (req, res, next) => {
  try {
    const photo = photoService.deletePhoto(req.params.id, req.user);
    flash(req, 'success', `ลบรูป "${photo.title}" (เจ้าของ ${photo.owner_username}) เรียบร้อยแล้ว`);
    return res.redirect('/admin/photos');
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------
router.get('/logs', (req, res) => {
  const page = Math.max(1, toInt(req.query.page) || 1);
  const action = typeof req.query.action === 'string' ? req.query.action : '';

  res.render('admin/logs', {
    title: 'บันทึกการกระทำ',
    ...userService.listLogs({ page, action, perPage: config.pagination.logsPerPage }),
    action,
  });
});

module.exports = router;