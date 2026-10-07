'use strict';

/**
 * Authentication : ตรวจรหัสผ่าน และจัดการ Session
 * - รหัสผ่านถูกเก็บเป็น bcrypt hash เท่านั้น
 * - Session เก็บเฉพาะ { id, username, role, fullName } ไม่เก็บรหัสผ่าน
 */

const bcrypt = require('bcryptjs');

const db = require('../db/database');
const { logAction } = require('./logService');

const SALT_ROUNDS = 10;

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** ค้นหาผู้ใช้จาก username (ใช้ตอน Login) */
function findByUsername(username) {
  return db.get(`SELECT * FROM users WHERE username = :username`, { username });
}

/** คืนค่าข้อมูลผู้ใช้ที่ปลอดภัย (ตัด password_hash ออก) */
function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * ตรวจสอบ username + password
 * @returns {{ok: true, user: object} | {ok: false, reason: string}}
 */
async function authenticate(username, password) {
  const user = findByUsername(username);

  // ข้อความเดียวกันทั้ง "ไม่พบผู้ใช้" และ "รหัสผิด" ป้องกันการเดา username
  const invalid = { ok: false, reason: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };

  if (!user) {
    await bcrypt.compare(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    return invalid;
  }

  const passwordMatch = await verifyPassword(password, user.password_hash);
  if (!passwordMatch) return invalid;

  if (user.status !== 'active') {
    return { ok: false, reason: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' };
  }

  return { ok: true, user };
}

/** เปิด session ใหม่แบบปลอดภัย (ป้องกัน Session Fixation) */
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = toPublicUser(user);
      logAction(toPublicUser(user), 'LOGIN', user.username);
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve(req.session.user)));
    });
  });
}

/** ปิด session และลบข้อมูลผู้ใช้ออกจาก session */
function endSession(req) {
  const user = req.session.user;
  return new Promise((resolve) => {
    if (!user) return resolve();
    logAction(user, 'LOGOUT', user.username);
    req.session.destroy(() => resolve());
  });
}

module.exports = {
  hashPassword,
  verifyPassword,
  findByUsername,
  toPublicUser,
  authenticate,
  startSession,
  endSession,
};