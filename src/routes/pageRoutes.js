'use strict';

/**
 * Route: หน้าเว็บสำหรับผู้ใช้ทั่วไป (User) + ผู้ที่ยังไม่ Login (Guest)
 *   /                 แกลเลอรี (ค้นหา / กรองได้)
 *   /photo/:id        รายละเอียดรูปภาพ + Metadata
 *   /upload           อัปโหลดรูป                (ต้อง Login)
 *   /photos/:id/edit  แก้ไขข้อมูลรูป            (เจ้าของ หรือ Admin)
 *   /photos/:id/delete ลบรูป                   (เจ้าของ หรือ Admin)
 *   /my/photos        รูปของฉัน                (ต้อง Login)
 *   /albums           จัดการ Album ของฉัน     (ต้อง Login)
 *   /albums/:id       รายละเอียด Album
 *   /api-demo         หน้าทดสอบสิทธิ์ผ่าน API  (ต้อง Login)
 */

const express = require('express');

const config = require('../config');
const photoService = require('../services/photoService');
const albumService = require('../services/albumService');
const { validateAlbum, validatePhoto, toInt } = require('../services/validation');
const { requireAuthPage } = require('../middleware/auth');
const { withUpload, deleteUploadedFile } = require('../utils/storage');
const { DEMO_ENDPOINTS } = require('./demoEndpoints');

const router = express.Router();

function flash(req, type, message) {
  req.session.flash = { type, message };
}

function createError(status, message) {
  return Object.assign(new Error(message), { status });
}

// ---------------------------------------------------------------
// แกลเลอรี + ค้นหา
// ---------------------------------------------------------------
router.get('/', (req, res) => {
  const keyword = typeof req.query.q === 'string' ? req.query.q : '';
  const scope = ['all', 'mine', 'public', 'private'].includes(req.query.scope) ? req.query.scope : 'all';
  const page = Math.max(1, toInt(req.query.page) || 1);

  const result = photoService.listPhotos({
    user: req.user,
    keyword,
    scope,
    page,
    perPage: config.pagination.photosPerPage,
  });

  res.render('pages/gallery', {
    title: keyword ? `ค้นหา: ${keyword}` : 'แกลเลอรีรูปภาพ',
    ...result,
  });
});

// เปิด /search แล้วให้ทำงานเหมือนค้นหาจากหน้าแกลเลอรี
router.get('/search', (req, res) => {
  const q = encodeURIComponent(req.query.q || '');
  res.redirect(q ? `/?q=${q}` : '/');
});

// ---------------------------------------------------------------
// รายละเอียดรูปภาพ
// ---------------------------------------------------------------
router.get('/photo/:id', (req, res, next) => {
  const photo = photoService.findById(req.params.id);
  if (!photo) return next(createError(404, 'ไม่พบรูปภาพที่ต้องการ'));

  if (!photoService.canViewPhoto(req.user, photo)) {
    return next(
      createError(
        403,
        'รูปภาพนี้เป็นรูปส่วนตัว (private) — เฉพาะเจ้าของและผู้ดูแลระบบเท่านั้นที่ดูได้'
      )
    );
  }

  return res.render('pages/photoDetail', {
    title: photo.title,
    photo,
    canManage: photoService.canManagePhoto(req.user, photo),
    related: photoService.relatedPhotos(photo, req.user),
  });
});

// ---------------------------------------------------------------
// อัปโหลดรูป
// ---------------------------------------------------------------
router.get('/upload', requireAuthPage, (req, res) => {
  const { albums } = albumService.listAlbums(req.user);
  const albumId = toInt(req.query.album);
  res.render('pages/upload', {
    title: 'อัปโหลดรูปภาพ',
    errors: {},
    values: {
      visibility: 'public',
      // preselect Album เมื่อเข้ามาจากปุ่มในหน้า Album
      albumId: albumId && albums.some((a) => a.id === albumId) ? albumId : '',
    },
    albums,
  });
});

router.post(
  '/upload',
  requireAuthPage,
  withUpload(async (req, res, next) => {
    try {
      // multer เก็บไฟล์ไว้ที่ req.file จึงต้องส่งแยกให้ validator
      const { isValid, errors, values } = validatePhoto(req.body, { file: req.file });

      if (!isValid) {
        // ถ้ามีไฟล์ถูกอัปโหลดแล้วแต่ข้อมูลไม่ผ่าน ให้ลบไฟล์ทิ้ง ไม่ให้เป็นไฟล์กรอก
        if (req.file) deleteUploadedFile(req.file.filename);
        const { albums } = albumService.listAlbums(req.user);
        return res.status(400).render('pages/upload', {
          title: 'อัปโหลดรูปภาพ',
          errors,
          values,
          albums,
        });
      }

      const photo = photoService.createPhoto(req.user, { file: req.file, values });
      flash(req, 'success', `อัปโหลดรูป "${photo.title}" สำเร็จ`);
      return res.redirect(`/photo/${photo.id}`);
    } catch (error) {
      return next(error);
    }
  })
);

// ---------------------------------------------------------------
// แก้ไข / ลบรูปภาพ (เจ้าของหรือ Admin เท่านั้น — service ตรวจซ้ำอีกชั้น)
// ---------------------------------------------------------------
router.get('/photos/:id/edit', requireAuthPage, (req, res, next) => {
  const photo = photoService.findById(req.params.id);
  if (!photo) return next(createError(404, 'ไม่พบรูปภาพที่ต้องการ'));

  if (!photoService.canManagePhoto(req.user, photo)) {
    return next(createError(403, photoService.forbiddenMessage(req.user, photo)));
  }

  const { albums } = albumService.listAlbums(req.user);
  return res.render('pages/editPhoto', { title: 'แก้ไขรูปภาพ', photo, errors: {}, values: photo, albums });
});

router.post('/photos/:id/edit', requireAuthPage, (req, res, next) => {
  try {
    // ตรวจสิทธิ์ก่อนตรวจข้อมูล : ไม่ให้บอกรายละเอียดของข้อมูลที่ไม่มีสิทธิ์
    const existing = photoService.findById(req.params.id);
    if (!existing) return next(createError(404, 'ไม่พบรูปภาพที่ต้องการ'));
    if (!photoService.canManagePhoto(req.user, existing)) {
      return next(createError(403, photoService.forbiddenMessage(req.user, existing)));
    }

    const { isValid, errors, values } = validatePhoto(req.body, { requireFile: false });

    if (!isValid) {
      const photo = existing;
      const { albums } = albumService.listAlbums(req.user);
      return res.status(400).render('pages/editPhoto', {
        title: 'แก้ไขรูปภาพ',
        photo,
        values,
        errors,
        albums,
      });
    }

    const photo = photoService.updatePhoto(req.params.id, req.user, values);
    flash(req, 'success', `บันทึกการแก้ไขรูป "${photo.title}" เรียบร้อย`);
    return res.redirect(`/photo/${photo.id}`);
  } catch (error) {
    return next(error);
  }
});

router.post('/photos/:id/delete', requireAuthPage, (req, res, next) => {
  try {
    const photo = photoService.deletePhoto(req.params.id, req.user);
    flash(req, 'success', `ลบรูป "${photo.title}" เรียบร้อยแล้ว`);
    return res.redirect(req.body.redirect || '/');
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------
// รูปของฉัน
// ---------------------------------------------------------------
router.get('/my/photos', requireAuthPage, (req, res) => {
  const page = Math.max(1, toInt(req.query.page) || 1);
  const result = photoService.listPhotos({
    user: req.user,
    scope: 'mine',
    keyword: typeof req.query.q === 'string' ? req.query.q : '',
    page,
    perPage: config.pagination.photosPerPage,
  });
  res.render('pages/myPhotos', { title: 'รูปภาพของฉัน', ...result });
});

// ---------------------------------------------------------------
// Album
// ---------------------------------------------------------------
router.get('/albums', requireAuthPage, (req, res) => {
  const scope = req.query.scope === 'all' && req.user.role === 'admin' ? 'all' : 'mine';
  const { albums, total } = albumService.listAlbums(req.user, { scope });
  res.render('pages/albums', { title: 'Album ของฉัน', albums, total, albumScope: scope, errors: {}, values: {} });
});

router.post('/albums', requireAuthPage, (req, res, next) => {
  try {
    const { isValid, errors, values } = validateAlbum(req.body);

    if (!isValid) {
      const { albums, total } = albumService.listAlbums(req.user);
      return res.status(400).render('pages/albums', {
        title: 'Album ของฉัน',
        albums,
        total,
        albumScope: 'mine',
        errors,
        values,
      });
    }

    const album = albumService.createAlbum(req.user, values);
    flash(req, 'success', `สร้าง Album "${album.name}" สำเร็จ`);
    return res.redirect('/albums');
  } catch (error) {
    return next(error);
  }
});

router.get('/albums/:id', requireAuthPage, (req, res, next) => {
  const album = albumService.findById(req.params.id);
  if (!album) return next(createError(404, 'ไม่พบ Album ที่ต้องการ'));

  if (!albumService.canViewAlbum(req.user, album)) {
    return next(createError(403, `ไม่มีสิทธิ์เข้าถึง Album นี้ (Album ของ ${album.owner_username})`));
  }

  const result = photoService.listPhotos({
    user: req.user,
    albumId: album.id,
    page: Math.max(1, toInt(req.query.page) || 1),
    perPage: config.pagination.photosPerPage,
  });

  return res.render('pages/albumDetail', {
    title: album.name,
    album,
    ...result,
    canManage: albumService.canManageAlbum(req.user, album),
  });
});

router.post('/albums/:id/edit', requireAuthPage, (req, res, next) => {
  try {
    // ตรวจสิทธิ์ก่อนตรวจข้อมูล
    const existing = albumService.findById(req.params.id);
    if (!existing) return next(createError(404, 'ไม่พบ Album ที่ต้องการ'));
    if (!albumService.canManageAlbum(req.user, existing)) {
      return next(createError(403, `ไม่มีสิทธิ์จัดการ Album นี้ (Album ของ ${existing.owner_username})`));
    }

    const { isValid, errors, values } = validateAlbum(req.body);
    if (!isValid) {
      flash(req, 'danger', errors.name || errors.description || 'ข้อมูลไม่ถูกต้อง');
      return res.redirect(`/albums/${req.params.id}`);
    }

    const album = albumService.updateAlbum(req.params.id, req.user, values);
    flash(req, 'success', `แก้ไข Album "${album.name}" เรียบร้อย`);
    return res.redirect(`/albums/${album.id}`);
  } catch (error) {
    return next(error);
  }
});

router.post('/albums/:id/delete', requireAuthPage, (req, res, next) => {
  try {
    const album = albumService.deleteAlbum(req.params.id, req.user);
    flash(req, 'success', `ลบ Album "${album.name}" เรียบร้อยแล้ว (รูปภาพยังอยู่ในระบบ)`);
    return res.redirect('/albums');
  } catch (error) {
    return next(error);
  }
});

// ---------------------------------------------------------------
// หน้าทดสอบสิทธิ์ผ่าน API
// ---------------------------------------------------------------
router.get('/api-demo', requireAuthPage, (req, res) => {
  const { albums } = albumService.listAlbums(req.user);
  res.render('pages/apiDemo', {
    title: 'ทดสอบสิทธิ์ระบบ (API)',
    endpoints: DEMO_ENDPOINTS,
    albums,
  });
});

module.exports = router;