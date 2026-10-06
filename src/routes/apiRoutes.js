'use strict';

/**
 * REST API ของ PhotoPrism (JSON)
 * ---------------------------------------------------------------
 * ทุก route ที่เป็นสิทธิ์เฉพาะ จะผ่าน middleware requireAuthApi / requireAdminApi
 * ตัวอย่างที่ User ยิงมาจะได้ 401 หรือ 403 เสมอ ไม่ว่าจะเปลี่ยน URL หรือส่ง body มาแบบไหน
 */

const express = require('express');

const config = require('../config');
const authService = require('../services/authService');
const userService = require('../services/userService');
const photoService = require('../services/photoService');
const albumService = require('../services/albumService');
const { validateLogin, validatePhoto, validatePhotoPatch, validateAlbum, validateUserCreate, validateRole, validateStatus, toInt } = require('../services/validation');
const { requireAuthApi, requireAdminApi } = require('../middleware/auth');
const { withUpload, deleteUploadedFile } = require('../utils/storage');

const router = express.Router();

/** แปลงข้อมูลรูปเป็น JSON ที่ส่งออกปลอดภัย */
function serializePhoto(photo) {
  return {
    id: photo.id,
    title: photo.title,
    description: photo.description,
    tags: photo.tags,
    camera: photo.camera,
    visibility: photo.visibility,
    fileUrl: `/uploads/${photo.file_name}`,
    originalName: photo.original_name,
    mimeType: photo.mime_type,
    fileSize: photo.file_size,
    width: photo.width,
    height: photo.height,
    album: photo.album_id ? { id: photo.album_id, name: photo.album_name } : null,
    owner: {
      id: photo.owner_id,
      username: photo.owner_username,
      fullName: photo.owner_name,
    },
    createdAt: photo.created_at,
  };
}

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName || user.full_name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt || user.created_at,
    photoCount: user.photo_count ?? user.photoCount,
    albumCount: user.album_count ?? user.albumCount,
  };
}

// ===============================================================
// Authentication
// ===============================================================
router.post('/auth/login', async (req, res, next) => {
  try {
    const { isValid, errors, values } = validateLogin(req.body);
    if (!isValid) return res.status(400).json({ error: 'ข้อมูลไม่ครบ', details: errors });

    const result = await authService.authenticate(values.username, values.password);
    if (!result.ok) return res.status(401).json({ error: result.reason });

    await authService.startSession(req, result.user);
    return res.json({ message: 'เข้าสู่ระบบสำเร็จ', user: req.session.user });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/logout', async (req, res, next) => {
  try {
    await authService.endSession(req);
    return res.json({ message: 'ออกจากระบบแล้ว' });
  } catch (error) {
    return next(error);
  }
});

router.get('/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized: ยังไม่ได้เข้าสู่ระบบ' });
  return res.json({ user: req.user });
});

// ===============================================================
// Photos
// ===============================================================
router.get('/photos', (req, res) => {
  const result = photoService.listPhotos({
    user: req.user,
    keyword: req.query.q || '',
    scope: req.query.scope || 'all',
    albumId: toInt(req.query.albumId),
    page: Math.max(1, toInt(req.query.page) || 1),
    perPage: Math.min(30, toInt(req.query.limit) || config.pagination.photosPerPage),
  });

  return res.json({
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    viewer: req.user ? { id: req.user.id, role: req.user.role } : { role: 'guest' },
    photos: result.photos.map((photo) => ({
      ...serializePhoto(photo),
      canManage: photoService.canManagePhoto(req.user, photo),
    })),
  });
});

router.get('/photos/:id', (req, res) => {
  const photo = photoService.findById(req.params.id);
  if (!photo) return res.status(404).json({ error: 'ไม่พบรูปภาพที่ต้องการ' });

  if (!photoService.canViewPhoto(req.user, photo)) {
    return res.status(403).json({
      error: 'Forbidden: รูปภาพนี้เป็นส่วนตัว (private) เฉพาะเจ้าของและผู้ดูแลระบบเท่านั้น',
    });
  }

  return res.json({
    photo: { ...serializePhoto(photo), canManage: photoService.canManagePhoto(req.user, photo) },
  });
});

router.post(
  '/photos',
  requireAuthApi,
  withUpload(async (req, res, next) => {
    try {
      const { isValid, errors, values } = validatePhoto(req.body, { file: req.file });
      if (!isValid) {
        if (req.file) deleteUploadedFile(req.file.filename);
        return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง', details: errors });
      }

      const photo = photoService.createPhoto(req.user, { file: req.file, values });
      return res.status(201).json({
        message: 'อัปโหลดสำเร็จ',
        photo: { ...serializePhoto(photo), canManage: true },
      });
    } catch (error) {
      return next(error);
    }
  })
);

router.patch('/photos/:id', requireAuthApi, (req, res, next) => {
  try {
    // ตรวจสิทธิ์ก่อนตรวจข้อมูล : ถ้าไม่มีสิทธิ์จะไม่บอกรายละเอียดของรูปนั้นเลย
    const existing = photoService.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'ไม่พบรูปภาพที่ต้องการ' });
    if (!photoService.canManagePhoto(req.user, existing)) {
      return res.status(403).json({
        error: photoService.forbiddenMessage(req.user, existing),
        photoId: existing.id,
        owner: existing.owner_username,
        yourId: req.user.id,
      });
    }

    // PATCH = แก้เฉพาะ field ที่ส่งมา field ที่ไม่ได้ส่งจะยังคงค่าเดิมไว้
    const { isValid, errors, values } = validatePhotoPatch(req.body);
    if (!isValid) return res.status(400).json({ error: errors.form || 'ข้อมูลไม่ถูกต้อง', details: errors });

    const photo = photoService.updatePhoto(req.params.id, req.user, values, { patch: true });
    return res.json({ message: 'แก้ไขสำเร็จ', photo: { ...serializePhoto(photo), canManage: true } });
  } catch (error) {
    return next(error);
  }
});

router.delete('/photos/:id', requireAuthApi, (req, res, next) => {
  try {
    const photo = photoService.deletePhoto(req.params.id, req.user);
    return res.json({ message: `ลบรูป "${photo.title}" แล้ว`, id: photo.id });
  } catch (error) {
    return next(error);
  }
});

// ===============================================================
// Albums
// ===============================================================
router.get('/albums', requireAuthApi, (req, res) => {
  const scope = req.user.role === 'admin' && req.query.scope === 'all' ? 'all' : 'mine';
  const { albums, total } = albumService.listAlbums(req.user, { scope });
  return res.json({ total, scope, albums });
});

router.post('/albums', requireAuthApi, (req, res, next) => {
  try {
    const { isValid, errors, values } = validateAlbum(req.body);
    if (!isValid) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง', details: errors });

    const album = albumService.createAlbum(req.user, values);
    return res.status(201).json({ message: 'สร้าง Album สำเร็จ', album });
  } catch (error) {
    return next(error);
  }
});

router.patch('/albums/:id', requireAuthApi, (req, res, next) => {
  try {
    const existing = albumService.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'ไม่พบ Album ที่ต้องการ' });
    if (!albumService.canManageAlbum(req.user, existing)) {
      return res.status(403).json({
        error: `ไม่มีสิทธิ์จัดการ Album นี้ (Album ของ ${existing.owner_username})`,
      });
    }

    const { isValid, errors, values } = validateAlbum(req.body);
    if (!isValid) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง', details: errors });

    const album = albumService.updateAlbum(req.params.id, req.user, values);
    return res.json({ message: 'แก้ไข Album สำเร็จ', album });
  } catch (error) {
    return next(error);
  }
});

router.delete('/albums/:id', requireAuthApi, (req, res, next) => {
  try {
    const album = albumService.deleteAlbum(req.params.id, req.user);
    return res.json({ message: `ลบ Album "${album.name}" แล้ว`, id: album.id });
  } catch (error) {
    return next(error);
  }
});

// ===============================================================
// Admin  —  ต้องเป็น Admin เท่านั้น (ทั้งหมด)
// ===============================================================
router.get('/admin/stats', requireAdminApi, (req, res) => {
  res.json({ stats: userService.getStats(), topOwners: userService.topOwners(5) });
});

router.get('/admin/users', requireAdminApi, (req, res) => {
  const result = userService.listUsers({
    keyword: req.query.q || '',
    role: req.query.role || '',
    status: req.query.status || '',
    page: Math.max(1, toInt(req.query.page) || 1),
    perPage: config.pagination.usersPerPage,
  });

  res.json({ total: result.total, page: result.page, users: result.users.map(serializeUser) });
});

router.post('/admin/users', requireAdminApi, async (req, res, next) => {
  try {
    const { isValid, errors, values } = validateUserCreate(req.body);
    if (!isValid) return res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง', details: errors });

    const created = await userService.createUser(values, req.user);
    return res.status(201).json({ message: 'สร้างผู้ใช้สำเร็จ', user: serializeUser(created) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/admin/users/:id', requireAdminApi, (req, res, next) => {
  try {
    let updated;

    if (req.body.role !== undefined) {
      const check = validateRole(req.body);
      if (!check.isValid) return res.status(400).json({ error: check.errors.role });
      updated = userService.changeRole(req.params.id, check.values.role, req.user);
    }

    if (req.body.status !== undefined) {
      const check = validateStatus(req.body);
      if (!check.isValid) return res.status(400).json({ error: check.errors.status });
      updated = userService.changeStatus(req.params.id, check.values.status, req.user);
    }

    if (!updated) return res.status(400).json({ error: 'ไม่ได้ระบุ field ที่ต้องการแก้ไข (role / status)' });

    return res.json({ message: 'แก้ไขผู้ใช้สำเร็จ', user: serializeUser(updated) });
  } catch (error) {
    return next(error);
  }
});

router.delete('/admin/users/:id', requireAdminApi, (req, res, next) => {
  try {
    const result = userService.deleteUser(req.params.id, req.user);
    for (const photo of result.files) deleteUploadedFile(photo.file_name);

    return res.json({
      message: `ลบผู้ใช้ "${result.username}" แล้ว`,
      deletedPhotos: result.deletedPhotos,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;