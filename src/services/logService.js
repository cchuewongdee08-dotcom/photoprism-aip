'use strict';

/**
 * บันทึกการกระทำของผู้ใช้ลงตาราง activity_logs
 * ใช้แสดงในหน้า Activity Log ของ Admin
 */

const { run } = require('../db/database');

function logAction(actor, action, target = '-') {
  const user = actor || {};
  try {
    run(
      `INSERT INTO activity_logs (user_id, username, action, target)
       VALUES (:userId, :username, :action, :target)`,
      {
        userId: user.id ?? null,
        username: user.username || 'system',
        action: String(action).slice(0, 120),
        target: String(target).slice(0, 160),
      }
    );
  } catch (error) {
    // การบันทึก log ไม่ควรทำให้ request หลักล้ม
    console.error('[log] บันทึก activity log ไม่สำเร็จ:', error.message);
  }
}

module.exports = { logAction };