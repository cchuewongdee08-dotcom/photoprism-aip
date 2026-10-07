'use strict';

/**
 * API Token — สำหรับทดสอบ API ผ่าน REST Client (VS Code) / curl
 * ---------------------------------------------------------------
 * เมื่อ Login ผ่าน POST /api/v1/session ระบบจะออก token ให้หนึ่งตัว
 * แล้วเก็บความสัมพันธ์ token -> userId ไว้ในหน่วยความจำ
 * คำขอถัดไปส่ง header:  Authorization: Bearer <token>
 * เพื่อยืนยันตัวตนได้โดยไม่ต้องพึ่ง cookie
 *
 * หมายเหตุ: token เก็บในหน่วยความจำเช่นเดียวกับ session
 *           รีสตาร์ทเซิร์ฟเวอร์แล้ว token เดิมใช้ไม่ได้ ต้อง Login ใหม่
 */

const crypto = require('node:crypto');

const tokens = new Map(); // token -> { userId, sessionId, createdAt }

/** ออก token ใหม่ผูกกับผู้ใช้ + session ปัจจุบัน */
function issue(user, sessionId) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { userId: user.id, sessionId, createdAt: Date.now() });
  return token;
}

/** ค้นหา token -> คืน { userId, sessionId, createdAt } หรือ null */
function resolve(token) {
  if (!token) return null;
  return tokens.get(token) || null;
}

/** ลบ token (ใช้ตอน Logout) */
function revoke(token) {
  if (!token) return false;
  return tokens.delete(token);
}

/** ลบ token ทุกตัวที่ผูกกับ session หนึ่ง ๆ */
function revokeBySession(sessionId) {
  if (!sessionId) return 0;
  let removed = 0;
  for (const [token, entry] of tokens) {
    if (entry.sessionId === sessionId) {
      tokens.delete(token);
      removed += 1;
    }
  }
  return removed;
}

module.exports = { issue, resolve, revoke, revokeBySession };
