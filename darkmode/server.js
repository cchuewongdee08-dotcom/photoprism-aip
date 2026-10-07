'use strict';

/**
 * PhotoPrism - จุดเริ่มการทำงานของเว็บแอปพลิเคชัน
 * รันด้วยคำสั่ง: npm start
 */

const config = require('./src/config');
const { createApp } = require('./src/app');

const app = createApp();

const server = app.listen(config.port, () => {
  const line = '='.repeat(58);
  console.log(line);
  console.log(`  ${config.appName} ระบบจัดการรูปภาพ`);
  console.log(line);
  console.log(`  เว็บไซต์      : http://localhost:${config.port}`);
  console.log('  ทดลองเข้าระบบ : admin / admin123   (สิทธิ์ Admin)');
  console.log('                user1 / user123   (สิทธิ์ User)');
  console.log('  กด Ctrl+C เพื่อปิดเซิร์ฟเวอร์');
  console.log(line);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`พอร์ต ${config.port} ถูกใช้งานอยู่แล้ว — ลองรันด้วย PORT=3001 npm start`);
  } else {
    console.error('เริ่มเซิร์ฟเวอร์ไม่สำเร็จ:', error.message);
  }
  process.exit(1);
});