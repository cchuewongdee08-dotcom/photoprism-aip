'use strict';

/**
 * รายการ endpoint ที่ใช้สาธิตในหน้า "ทดสอบสิทธิ์ระบบ (API)"
 * ใช้ endpoint จริงของระบบ ไม่ใช่ mock
 * ทุกคำขอจะถูกตรวจสิทธิ์ที่ middleware ฝั่ง Server ก่อนเสมอ
 */

const DEMO_ENDPOINTS = [
  {
    group: 'ดูข้อมูลตัวเอง',
    items: [
      { method: 'GET', path: '/api/auth/me', desc: 'ดูข้อมูลผู้ใช้ที่ Login อยู่' },
      { method: 'GET', path: '/api/photos', desc: 'ดูรายการรูปทั้งหมดที่ "ตัวเองมีสิทธิ์" เห็น' },
      { method: 'GET', path: '/api/photos?scope=mine', desc: 'ดูรูปของตัวเอง' },
      { method: 'GET', path: '/api/albums', desc: 'ดู Album ของตัวเอง' },
    ],
  },
  {
    group: 'จัดการรูปของตัวเอง',
    items: [
      { method: 'GET', path: '/api/photos/1', desc: 'ดูรายละเอียดรูป ID 1' },
      { method: 'PATCH', path: '/api/photos/1', desc: 'แก้ไขข้อมูลรูป ID 1 (เฉพาะเจ้าของ/Admin)', body: { title: 'แก้ชื่อรูปจากระบบ (ทดสอบ)' } },
      { method: 'DELETE', path: '/api/photos/999', desc: 'ลบรูปที่ไม่มีอยู่จริง (ตรวจว่า Server ตอบ 404)' },
    ],
  },
  {
    group: 'สิทธิ์ของ Admin (ต้อง Admin เท่านั้น)',
    items: [
      { method: 'GET', path: '/api/admin/stats', desc: 'สถิติทั้งระบบ (ผู้ใช้, รูป, Album)' },
      { method: 'GET', path: '/api/admin/users', desc: 'รายชื่อผู้ใช้ทั้งหมด' },
      { method: 'PATCH', path: '/api/admin/users/3', desc: 'เปลี่ยนสถานะผู้ใช้ ID 3 กลับเป็น active (กดได้บ่อย)', body: { status: 'active' } },
      { method: 'DELETE', path: '/api/admin/users/999', desc: 'ลบผู้ใช้ที่ไม่มีอยู่จริง (ตรวจว่า Server ตอบ 404)' },
    ],
  },
];

module.exports = { DEMO_ENDPOINTS };