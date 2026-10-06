'use strict';

/**
 * PhotoService : ระบบจัดการรูปภาพ + กติกาสิทธิ์ของรูปภาพ
 *
 * กติกา:
 *   - Guest (ยังไม่ Login)  : ดูได้เฉพาะรูป public
 *   - User                  : ดูได้รูป public + รูป private ของตัวเอง,
 *                            แก้/ลบได้เฉพาะรูปของตัวเอง
 *   - Admin                 : ดู/แก้/ลบได้ทุกใบ (รวมรูป private ของผู้อื่น)
 */

const db = require('../db/database');
const config = require('../config');
const { logAction } = require('./logService');
const { deleteUploadedFile, readImageInfo } = require('../utils/storage');
const { normalizeKeyword } = require('./validation');

class ServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const SELECT_PHOTO = `
  SELECT p.*,
         u.username      AS owner_username,
         u.full_name      AS owner_name,
         a.name           AS album_name,
         (SELECT COUNT(*) FROM photos x WHERE x.album_id = p.album_id) AS album_photo_count
  FROM photos p
  JOIN users u        ON u.id = p.owner_id
  LEFT JOIN albums a  ON a.id = p.album_id
`;

function findById(id) {
  return db.get(`${SELECT_PHOTO} WHERE p.id = :id`, { id: Number(id) });
}

function isAdmin(user) {
  return Boolean(user && user.role === 'admin');
}

/** ตรวจสิทธิ์ "ดูรูป" */
function canViewPhoto(user, photo) {
  if (!photo) return false;
  if (isAdmin(user)) return true;
  if (photo.visibility === 'public') return true;
  return Boolean(user && Number(user.id) === Number(photo.owner_id));
}

/** ตรวจสิทธิ์ "แก้ไข / ลบรูป" : เจ้าของ หรือ Admin */
function canManagePhoto(user, photo) {
  if (!user || !photo) return false;
  if (isAdmin(user)) return true;
  return Number(user.id) === Number(photo.owner_id);
}

function forbiddenMessage(user, photo) {
  return isAdmin(user)
    ? 'ไม่พบรูปภาพที่ต้องการ'
    : `ไม่มีสิทธิ์จัดการรูปภาพนี้ (เจ้าของคือ ${photo.owner_username}) รูปภาพส่วนตัวสามารถแก้ไขได้เฉพาะเจ้าของหรือผู้ดูแลระบบ`;
}

/**
 * เงื่อนไข WHERE ตามสิทธิ์ของผู้ใช้ที่กำลังดู
 * @param {boolean} and ใช้เมื่อต่อกับเงื่อนไขเดิม (ขึ้นต้นด้วย AND)
 */
function buildVisibilityCondition(user, params, { and = false } = {}) {
  const lead = and ? ' AND ' : '';
  if (isAdmin(user)) return `${lead}1 = 1`;
  if (user) {
    params.viewerId = Number(user.id);
    return `${lead}(p.visibility = 'public' OR p.owner_id = :viewerId)`;
  }
  return `${lead}p.visibility = 'public'`;
}

/**
 * ค้นหา / แสดงรูปภาพ (คืนเฉพาะรูปที่ผู้ใช้คนนี้ "มีสิทธิ์" เห็น)
 * @param {object} options
 * @param {object} options.user      ผู้ที่กำลังค้นหา (null = guest)
 * @param {string} options.keyword   คำค้นหา (title / description / tags / camera)
 * @param {number} options.albumId   กรองตาม Album
 * @param {string} options.scope     'all' | 'mine' | 'public' | 'private'
 */
function listPhotos({
  user = null,
  keyword = '',
  albumId = null,
  scope = 'all',
  page = 1,
  perPage = config.pagination.photosPerPage,
} = {}) {
  const params = {};
  const conditions = [buildVisibilityCondition(user, params)];

  const kw = normalizeKeyword(keyword);
  if (kw) {
    conditions.push('(p.title LIKE :kw OR p.description LIKE :kw OR p.tags LIKE :kw OR p.camera LIKE :kw OR u.username LIKE :kw)');
    params.kw = `%${kw}%`;
  }

  if (albumId) {
    conditions.push('p.album_id = :albumId');
    params.albumId = Number(albumId);
  }

  if (scope === 'mine' && user) {
    conditions.push('p.owner_id = :ownerId');
    params.ownerId = Number(user.id);
  } else if (scope === 'public') {
    conditions.push(`p.visibility = 'public'`);
  } else if (scope === 'private') {
    conditions.push(`p.visibility = 'private'`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  // แยก parameter ของ LIMIT/OFFSET ออกจาก parameter ของเงื่อนไขกรอง
  const pageParams = { ...params, limit: perPage, offset: (page - 1) * perPage };

  const photos = db.all(
    `${SELECT_PHOTO} ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT :limit OFFSET :offset`,
    pageParams
  );

  const total = db.get(
    `SELECT COUNT(*) AS total FROM photos p JOIN users u ON u.id = p.owner_id ${where}`,
    params
  ).total;

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  return {
    photos,
    total,
    page: currentPage,
    totalPages,
    perPage,
    keyword: kw,
    albumId: albumId ? Number(albumId) : null,
    photoScope: scope,
  };
}

/** สร้างรูปใหม่ (ผู้อัปโหลด = เจ้าของรูป) */
function createPhoto(actor, { file, values }) {
  if (!file) throw new ServiceError('ไม่พบไฟล์รูปภาพ', 400);

  let info = { width: null, height: null };
  try {
    info = readImageInfo(file.path) || info;
  } catch {
    // อ่านขนาดไฟล์ไม่ได้ ไม่เป็นไร ปล่อยเป็น NULL ไป
  }

  // ตรวจว่า Album ที่เลือกต้องเป็นของตัวเองเท่านั้น (Admin ก็เลือกได้แค่ Album ตัวเอง)
  if (values.albumId) {
    const album = db.get(`SELECT id, user_id FROM albums WHERE id = :id`, { id: values.albumId });
    if (!album) throw new ServiceError('ไม่พบ Album ที่เลือก', 404);
    if (Number(album.user_id) !== Number(actor.id)) {
      throw new ServiceError('สามารถเพิ่มรูปลง Album ของตัวเองเท่านั้น', 403);
    }
  }

  const result = db.run(
    `INSERT INTO photos
       (owner_id, album_id, title, description, tags, camera,
        file_name, original_name, mime_type, file_size, width, height, visibility)
     VALUES
       (:ownerId, :albumId, :title, :description, :tags, :camera,
        :fileName, :originalName, :mimeType, :fileSize, :width, :height, :visibility)`,
    {
      ownerId: Number(actor.id),
      albumId: values.albumId || null,
      title: values.title,
      description: values.description || '',
      tags: values.tags || '',
      camera: values.camera || '',
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      width: info.width,
      height: info.height,
      visibility: values.visibility,
    }
  );

  const photo = findById(Number(result.lastInsertRowid));
  logAction(actor, 'UPLOAD_PHOTO', photo.title);
  return photo;
}

/**
 * แก้ไขข้อมูลรูป (ต้องผ่านการตรวจสิทธิ์ก่อน)
 * @param {boolean} patch true = แก้เฉพาะ field ที่ส่งมา (PATCH), false = แทนที่ทั้งชุด (ฟอร์มเว็บ)
 */
function updatePhoto(id, actor, values, { patch = false } = {}) {
  const photo = findById(id);
  if (!photo) throw new ServiceError('ไม่พบรูปภาพที่ต้องการ', 404);
  if (!canManagePhoto(actor, photo)) {
    throw new ServiceError(forbiddenMessage(actor, photo), 403);
  }

  // รวมค่าเดิมของรูปไว้ก่อน แล้วค่อยทับด้วยค่าที่ส่งมา
  const merged = {
    title: photo.title,
    description: photo.description,
    tags: photo.tags,
    camera: photo.camera,
    visibility: photo.visibility,
    albumId: photo.album_id,
  };

  if (patch) {
    Object.assign(merged, values);
  } else {
    Object.assign(merged, {
      title: values.title,
      description: values.description || '',
      tags: values.tags || '',
      camera: values.camera || '',
      visibility: values.visibility,
      albumId: values.albumId || null,
    });
  }

  // ตรวจสิทธิ์ของ Album เฉพาะเมื่อ "เปลี่ยน" Album จริง ๆ
  // (ผู้ดูแลระบบที่แก้รูปของผู้ใช้ ต้องไม่ติด error เพราะรูปนั้นอยู่ใน Album ของผู้ใช้)
  const albumChanged = Number(merged.albumId || 0) !== Number(photo.album_id || 0);

  if (merged.albumId && albumChanged) {
    const album = db.get(`SELECT id, user_id FROM albums WHERE id = :id`, { id: merged.albumId });
    if (!album) throw new ServiceError('ไม่พบ Album ที่เลือก', 404);
    if (Number(album.user_id) !== Number(actor.id)) {
      throw new ServiceError('สามารถย้ายรูปเข้า Album ของตัวเองเท่านั้น', 403);
    }
  }

  db.run(
    `UPDATE photos
     SET album_id = :albumId, title = :title, description = :description,
         tags = :tags, camera = :camera, visibility = :visibility
     WHERE id = :id`,
    {
      albumId: merged.albumId || null,
      title: merged.title,
      description: merged.description,
      tags: merged.tags,
      camera: merged.camera,
      visibility: merged.visibility,
      id: Number(id),
    }
  );

  const updated = findById(id);
  logAction(actor, 'UPDATE_PHOTO', updated.title);
  return updated;
}

/** ลบรูป (ไฟล์จริงใน uploads ถูกลบด้วย) */
function deletePhoto(id, actor) {
  const photo = findById(id);
  if (!photo) throw new ServiceError('ไม่พบรูปภาพที่ต้องการ', 404);
  if (!canManagePhoto(actor, photo)) {
    throw new ServiceError(forbiddenMessage(actor, photo), 403);
  }

  db.run(`DELETE FROM photos WHERE id = :id`, { id: Number(id) });
  deleteUploadedFile(photo.file_name);
  logAction(actor, 'DELETE_PHOTO', photo.title);
  return photo;
}

/** ใช้ในหน้ารายละเอียด : รูปอื่นของเจ้าของเดียวกัน */
function relatedPhotos(photo, user, limit = 4) {
  if (!photo) return [];

  // ต้องส่ง params ตัวเดียวกันที่ใช้ buildVisibilityCondition เขียน :viewerId ลงไปด้วย
  const params = { ownerId: Number(photo.owner_id), id: Number(photo.id), limit: Number(limit) };

  return db.all(
    `${SELECT_PHOTO}
     WHERE p.owner_id = :ownerId AND p.id != :id
       ${buildVisibilityCondition(user, params, { and: true })}
     ORDER BY p.created_at DESC LIMIT :limit`,
    params
  );
}

module.exports = {
  ServiceError,
  findById,
  canViewPhoto,
  canManagePhoto,
  forbiddenMessage,
  listPhotos,
  createPhoto,
  updatePhoto,
  deletePhoto,
  relatedPhotos,
};