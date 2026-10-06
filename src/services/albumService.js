'use strict';

/**
 * AlbumService : Album เป็นของผู้ใช้แต่ละคน
 *   - User : สร้าง / แก้ / ลบ ได้เฉพาะ Album ของตัวเอง
 *   - Admin : ดู Album ทั้งระบบ และจัดการได้ทุก Album
 */

const db = require('../db/database');
const { logAction } = require('./logService');

class ServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const SELECT_ALBUM = `
  SELECT a.*,
         u.username AS owner_username,
         u.full_name AS owner_name,
         (SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id) AS photo_count
  FROM albums a
  JOIN users u ON u.id = a.user_id
`;

function isAdmin(user) {
  return Boolean(user && user.role === 'admin');
}

function findById(id) {
  return db.get(`${SELECT_ALBUM} WHERE a.id = :id`, { id: Number(id) });
}

function canViewAlbum(user, album) {
  if (!album) return false;
  return isAdmin(user) || Boolean(user && Number(user.id) === Number(album.user_id));
}

function canManageAlbum(user, album) {
  if (!user || !album) return false;
  return isAdmin(user) || Number(user.id) === Number(album.user_id);
}

/**
 * รายการ Album
 *  - Admin : เห็นทั้งระบบ
 *  - User  : เห็นของตัวเอง
 *  - Guest : ไม่เห็นเลย (ต้อง Login ก่อน)
 */
function listAlbums(user, { scope = 'mine' } = {}) {
  if (!user) return { albums: [], total: 0 };

  const params = {};
  let where = '';

  if (isAdmin(user) && scope === 'all') {
    where = '';
  } else {
    where = 'WHERE a.user_id = :ownerId';
    params.ownerId = Number(user.id);
  }

  const albums = db.all(`${SELECT_ALBUM} ${where} ORDER BY a.created_at DESC, a.id DESC`, params);
  return { albums, total: albums.length };
}

function createAlbum(actor, values) {
  const result = db.run(
    `INSERT INTO albums (user_id, name, description) VALUES (:userId, :name, :description)`,
    { userId: Number(actor.id), name: values.name, description: values.description || '' }
  );

  const album = findById(Number(result.lastInsertRowid));
  logAction(actor, 'CREATE_ALBUM', album.name);
  return album;
}

function updateAlbum(id, actor, values) {
  const album = findById(id);
  if (!album) throw new ServiceError('ไม่พบ Album ที่ต้องการ', 404);
  if (!canManageAlbum(actor, album)) {
    throw new ServiceError(
      isAdmin(actor)
        ? 'ไม่พบ Album ที่ต้องการ'
        : `ไม่มีสิทธิ์จัดการ Album นี้ (เป็นของ ${album.owner_username})`,
      403
    );
  }

  db.run(`UPDATE albums SET name = :name, description = :description WHERE id = :id`, {
    name: values.name,
    description: values.description || '',
    id: Number(id),
  });

  const updated = findById(id);
  logAction(actor, 'UPDATE_ALBUM', updated.name);
  return updated;
}

/** ลบ Album (รูปใน Album ไม่ถูกลบ แต่ album_id จะถูกตั้งเป็น NULL ตาม ON DELETE SET NULL) */
function deleteAlbum(id, actor) {
  const album = findById(id);
  if (!album) throw new ServiceError('ไม่พบ Album ที่ต้องการ', 404);
  if (!canManageAlbum(actor, album)) {
    throw new ServiceError(
      isAdmin(actor) ? 'ไม่พบ Album ที่ต้องการ' : `ไม่มีสิทธิ์จัดการ Album นี้ (เป็นของ ${album.owner_username})`,
      403
    );
  }

  db.run(`DELETE FROM albums WHERE id = :id`, { id: Number(id) });
  logAction(actor, 'DELETE_ALBUM', album.name);
  return album;
}

module.exports = {
  ServiceError,
  findById,
  canViewAlbum,
  canManageAlbum,
  listAlbums,
  createAlbum,
  updateAlbum,
  deleteAlbum,
};