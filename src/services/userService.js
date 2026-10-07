'use strict';

/**
 * UserService : จัดการผู้ใช้ (ใช้หน้า Admin User Management)
 * มีกฎป้องกันระบบเสียหาย:
 *   - ลบ/ปิดบัญชี/ลดสิทธิ์ของ Admin คนสุดท้ายไม่ได้
 *   - Admin ไม่สามารถเปลี่ยนสิทธิ์หรือปิดบัญชีตัวเองได้
 */

const db = require('../db/database');
const { hashPassword, verifyPassword, toPublicUser } = require('./authService');
const { logAction } = require('./logService');

class ServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const SELECT_USER = `
  SELECT u.*,
         (SELECT COUNT(*) FROM photos p WHERE p.owner_id = u.id) AS photo_count,
         (SELECT COUNT(*) FROM albums a WHERE a.user_id = u.id) AS album_count
  FROM users u
`;

function findById(id) {
  return db.get(`${SELECT_USER} WHERE u.id = :id`, { id: Number(id) });
}

function existsByUsernameOrEmail({ username, email, excludeId = null }) {
  const clash = db.get(
    `SELECT id, username, email FROM users
     WHERE (username = :username OR email = :email)
       AND (:excludeId IS NULL OR id != :excludeId)`,
    { username, email, excludeId: excludeId === null ? null : Number(excludeId) }
  );
  if (!clash) return null;
  return clash.username === username ? 'username' : 'email';
}

function toAdminUser(row) {
  const user = toPublicUser(row);
  if (!user) return null;
  // หน้า Admin ต้องการจำนวนรูป/Album ด้วย (photoCount / albumCount)
  return {
    ...user,
    photoCount: Number(row.photo_count || 0),
    albumCount: Number(row.album_count || 0),
  };
}

/** รายชื่อผู้ใช้ทั้งหมด (พร้อมตัวกรอง + แบ่งหน้า) */
function listUsers({ keyword = '', role = '', status = '', page = 1, perPage = 10 } = {}) {
  const conditions = [];
  const params = {};

  if (keyword) {
    conditions.push('(u.username LIKE :kw OR u.email LIKE :kw OR u.full_name LIKE :kw)');
    params.kw = `%${keyword}%`;
  }
  if (role) {
    conditions.push('u.role = :role');
    params.role = role;
  }
  if (status) {
    conditions.push('u.status = :status');
    params.status = status;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageParams = { ...params, limit: perPage, offset: (page - 1) * perPage };

  const rows = db.all(
    `${SELECT_USER} ${where}
     ORDER BY CASE u.role WHEN 'admin' THEN 0 ELSE 1 END, u.created_at DESC
     LIMIT :limit OFFSET :offset`,
    pageParams
  );

  const total = db.get(`SELECT COUNT(*) AS total FROM users u ${where}`, params).total;

  return { users: rows.map(toAdminUser), total, page, perPage };
}

async function createUser(values, actor) {
  const clash = existsByUsernameOrEmail(values);
  if (clash === 'username') throw new ServiceError('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว', 409);
  if (clash === 'email') throw new ServiceError('อีเมลนี้ถูกใช้งานแล้ว', 409);

  const passwordHash = await hashPassword(values.password);

  const result = db.run(
    `INSERT INTO users (username, email, password_hash, full_name, role, status)
     VALUES (:username, :email, :passwordHash, :fullName, :role, :status)`,
    {
      username: values.username,
      email: values.email,
      passwordHash,
      fullName: values.fullName || values.username,
      role: values.role,
      status: values.status,
    }
  );

  const created = toPublicUser(findById(Number(result.lastInsertRowid)));
  logAction(actor, 'ADMIN_CREATE_USER', `${created.username} (${created.role})`);
  return created;
}

function countAdmins() {
  return db.get(`SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND status = 'active'`).total;
}

/**
 * ตรวจว่าการเปลี่ยนแปลงนี้จะทำให้ระบบไม่เหลือผู้ดูแลระบบหรือไม่
 * (ผู้ดูแลที่ถูกระงับอยู่แล้วไม่นับ เพราะการแก้ไขเขาไม่ทำให้ระบบเสียหาย)
 */
function wouldRemoveLastAdmin(target) {
  return target.role === 'admin' && target.status === 'active' && countAdmins() <= 1;
}

const LAST_ADMIN_MESSAGE = 'ระบบต้องมีผู้ดูแลอย่างน้อย 1 บัญชี (สิทธิ์ Admin) ที่ใช้งานได้';

/** เปลี่ยนสิทธิ์ (User <-> Admin) */
function changeRole(id, role, actor) {
  const target = findById(id);
  if (!target) throw new ServiceError('ไม่พบผู้ใช้', 404);

  if (actor && Number(actor.id) === Number(target.id)) {
    throw new ServiceError('ไม่สามารถเปลี่ยนสิทธิ์ของตัวเองได้');
  }
  if (role !== 'admin' && wouldRemoveLastAdmin(target)) {
    throw new ServiceError(LAST_ADMIN_MESSAGE);
  }

  db.run(`UPDATE users SET role = :role WHERE id = :id`, { role, id: Number(id) });
  logAction(actor, 'ADMIN_CHANGE_ROLE', `${target.username}: ${target.role} -> ${role}`);
  return toPublicUser(findById(id));
}

/** ปิด / เปิด การใช้งานบัญชี */
function changeStatus(id, status, actor) {
  const target = findById(id);
  if (!target) throw new ServiceError('ไม่พบผู้ใช้', 404);

  if (actor && Number(actor.id) === Number(target.id)) {
    throw new ServiceError('ไม่สามารถเปลี่ยนสถานะของบัญชีตัวเองได้');
  }
  if (status !== 'active' && wouldRemoveLastAdmin(target)) {
    throw new ServiceError(LAST_ADMIN_MESSAGE);
  }

  db.run(`UPDATE users SET status = :status WHERE id = :id`, { status, id: Number(id) });
  logAction(actor, status === 'active' ? 'ADMIN_ACTIVATE_USER' : 'ADMIN_SUSPEND_USER', target.username);
  return toPublicUser(findById(id));
}

/**
 * ผู้ใช้แก้โปรไฟล์ของตัวเอง (ชื่อผู้ใช้ + ชื่อ-นามสกุล)
 * ตรวจชื่อซ้ำกับผู้อื่นที่ Server เสมอ
 */
async function updateProfile(id, values, actor) {
  const target = findById(id);
  if (!target) throw new ServiceError('ไม่พบผู้ใช้', 404);

  const clash = existsByUsernameOrEmail({
    username: values.username,
    email: target.email,
    excludeId: Number(id),
  });
  if (clash === 'username') throw new ServiceError('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว', 409);

  db.run(
    `UPDATE users SET username = :username, full_name = :fullName WHERE id = :id`,
    { username: values.username, fullName: values.fullName, id: Number(id) }
  );

  logAction(actor, 'UPDATE_PROFILE', `${target.username} -> ${values.username}`);
  return toPublicUser(findById(id));
}

/**
 * อัปเดตรูปโปรไฟล์ของตัวเอง
 * @returns {{ user: object, previous: string }} user ที่อัปเดตแล้ว + ชื่อไฟล์รูปเดิม (ให้ route ลบไฟล์เก่า)
 */
function updateAvatar(id, avatar, actor) {
  const target = findById(id);
  if (!target) throw new ServiceError('ไม่พบผู้ใช้', 404);

  const previous = target.avatar || '';

  db.run(`UPDATE users SET avatar = :avatar WHERE id = :id`, {
    avatar: avatar || '',
    id: Number(id),
  });

  logAction(actor, avatar ? 'UPDATE_AVATAR' : 'REMOVE_AVATAR', target.username);
  return { user: toPublicUser(findById(id)), previous };
}

/**
 * เปลี่ยนรหัสผ่านของตัวเอง — ต้องทราบรหัสปัจจุบันก่อน
 * (ต่างจาก Admin reset ที่ไม่ต้องใช้รหัสเก่า)
 */
async function changeOwnPassword(id, currentPassword, newPassword, actor) {
  const target = findById(id);
  if (!target) throw new ServiceError('ไม่พบผู้ใช้', 404);

  const match = await verifyPassword(currentPassword, target.password_hash);
  if (!match) throw new ServiceError('รหัสผ่านปัจจุบันไม่ถูกต้อง', 400);

  const passwordHash = await hashPassword(newPassword);
  db.run(`UPDATE users SET password_hash = :passwordHash WHERE id = :id`, {
    passwordHash,
    id: Number(id),
  });

  logAction(actor, 'CHANGE_PASSWORD', target.username);
  return toPublicUser(findById(id));
}

/**
 * Admin แก้บัญชีผู้อื่น — เปลี่ยนชื่อผู้ใช้ / ชื่อ-นามสกุล / รีเซ็ตรหัสผ่าน
 * ป้องกัน: แก้บัญชีตัวเองผ่านหน้านี้ไม่ได้ (ต้องใช้หน้าโปรไฟล์)
 */
async function adminUpdateUser(id, values, actor) {
  const target = findById(id);
  if (!target) throw new ServiceError('ไม่พบผู้ใช้', 404);

  if (actor && Number(actor.id) === Number(target.id)) {
    throw new ServiceError('แก้ไขบัญชีของตัวเองผ่านหน้านี้ไม่ได้ กรุณาใช้หน้าโปรไฟล์');
  }

  const clash = existsByUsernameOrEmail({
    username: values.username,
    email: target.email,
    excludeId: Number(id),
  });
  if (clash === 'username') throw new ServiceError('ชื่อผู้ใช้นี้ถูกใช้งานแล้ว', 409);

  const passwordHash = values.password ? await hashPassword(values.password) : null;

  db.run(
    `UPDATE users
        SET username = :username,
            full_name = :fullName,
            password_hash = COALESCE(:passwordHash, password_hash)
      WHERE id = :id`,
    {
      username: values.username,
      fullName: values.fullName,
      passwordHash,
      id: Number(id),
    }
  );

  logAction(
    actor,
    'ADMIN_EDIT_USER',
    `${target.username} -> ${values.username}${values.password ? ' (รีเซ็ตรหัสผ่าน)' : ''}`
  );
  return toPublicUser(findById(id));
}

/** ลบผู้ใช้ (รูปภาพและ Album ของเขาจะถูกลบตาม ON DELETE CASCADE) */
function deleteUser(id, actor) {
  const target = findById(id);
  if (!target) throw new ServiceError('ไม่พบผู้ใช้', 404);

  if (actor && Number(actor.id) === Number(target.id)) {
    throw new ServiceError('ไม่สามารถลบบัญชีตัวเองได้');
  }
  if (wouldRemoveLastAdmin(target)) {
    throw new ServiceError(LAST_ADMIN_MESSAGE);
  }

  const photos = db.all(`SELECT file_name FROM photos WHERE owner_id = :id`, { id: Number(id) });

  db.transaction(() => {
    db.run(`DELETE FROM photos WHERE owner_id = :id`, { id: Number(id) });
    db.run(`DELETE FROM albums WHERE user_id = :id`, { id: Number(id) });
    db.run(`DELETE FROM users WHERE id = :id`, { id: Number(id) });
  });

  logAction(actor, 'ADMIN_DELETE_USER', target.username);
  return { username: target.username, deletedPhotos: photos.length, files: photos };
}

/** สรุปตัวเลขสำหรับหน้า Admin Dashboard */
function getStats() {
  const users = db.get(`
    SELECT
      COUNT(*)                                                   AS total_users,
      SUM(CASE WHEN role = 'admin'  THEN 1 ELSE 0 END)           AS total_admins,
      SUM(CASE WHEN role = 'user'   THEN 1 ELSE 0 END)           AS total_regular,
      SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END)     AS suspended_users
    FROM users
  `);

  const photos = db.get(`
    SELECT
      COUNT(*)                                                AS total_photos,
      SUM(CASE WHEN visibility = 'private' THEN 1 ELSE 0 END) AS private_photos,
      COALESCE(SUM(file_size), 0)                             AS total_size
    FROM photos
  `);

  return {
    users: users.total_users,
    admins: users.total_admins,
    regularUsers: users.total_regular,
    suspendedUsers: users.suspended_users,
    photos: photos.total_photos,
    privatePhotos: photos.private_photos,
    totalSize: photos.total_size,
    albums: db.get(`SELECT COUNT(*) AS total FROM albums`).total,
    logs: db.get(`SELECT COUNT(*) AS total FROM activity_logs`).total,
  };
}

/** รายการ Activity Log แบบแบ่งหน้า */
function listLogs({ page = 1, perPage = 15, action = '' } = {}) {
  const params = {};
  const where = action ? 'WHERE action LIKE :kw' : '';
  if (action) params.kw = `%${action}%`;

  const pageParams = { ...params, limit: perPage, offset: (page - 1) * perPage };

  const logs = db.all(
    `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset`,
    pageParams
  );
  const total = db.get(`SELECT COUNT(*) AS total FROM activity_logs ${where}`, params).total;

  return { logs, total, page, perPage };
}

/** ผู้ใช้ที่มีรูปมากที่สุด (ใช้ใน Admin Dashboard) */
function topOwners(limit = 5) {
  return db.all(
    `SELECT u.id, u.username, u.full_name, u.role,
            COUNT(p.id) AS photo_count
     FROM users u
     LEFT JOIN photos p ON p.owner_id = u.id
     GROUP BY u.id
     ORDER BY photo_count DESC, u.username ASC
     LIMIT :limit`,
    { limit: Number(limit) }
  );
}

module.exports = {
  ServiceError,
  findById,
  existsByUsernameOrEmail,
  toPublicUser,
  toAdminUser,
  listUsers,
  createUser,
  changeRole,
  changeStatus,
  updateProfile,
  updateAvatar,
  changeOwnPassword,
  adminUpdateUser,
  deleteUser,
  countAdmins,
  getStats,
  listLogs,
  topOwners,
};