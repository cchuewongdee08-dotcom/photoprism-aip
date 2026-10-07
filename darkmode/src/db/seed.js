'use strict';

/**
 * สร้างข้อมูลตัวอย่างสำหรับสาธิต (รันครั้งเดียว: npm run seed)
 *   - ผู้ใช้ 1 Admin + 3 User (หนึ่งคนถูกระงับ เพื่อสาธิตฟีเจอร์ของ Admin)
 *   - Album 3 ชุด
 *   - รูปภาพ 8 รูป (ดาวน์โหลดจาก picsum.photos แล้วเก็บไว้ในเครื่อง)
 *
 * ถ้าต้องการเริ่มใหม่ทั้งหมด: npm run reset
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const config = require('../config');
const db = require('./database');
const { hashPassword } = require('../services/authService');
const { imageSize } = require('image-size');

const RESET = process.argv.includes('--reset');

// ---------------------------------------------------------------
// รูปภาพตัวอย่าง — ประกาศไว้ตอนบน เพราะใช้ตอนอ่านไฟล์เดิมระหว่าง reset
// ---------------------------------------------------------------
const PHOTOS = [
  { file: 'mountain.jpg',   owner: 'user1', album: 'user1:ทริปภาคเหนือ', title: 'ดอยอินทนากร ช่วงพระอาทิตย์ขึ้น', description: 'ถ่ายตอน 6 โมงเช้า อากาศเย็นกำลังดี', tags: 'ภูเขา, ทริป, ธรรมชาติ', camera: 'Canon EOS R50', visibility: 'public' },
  { file: 'waterfall.jpg',  owner: 'user1', album: 'user1:ทริปภาคเหนือ', title: 'น้ำตกแจ้มหลังฝนตก',            description: 'น้ำตกสวยมาก น้ำไหลเย็นมาก',           tags: 'น้ำตก, ทริป, ธรรมชาติ', camera: 'Canon EOS R50', visibility: 'public' },
  { file: 'river.jpg',      owner: 'user1', album: 'user1:ทริปภาคเหนือ', title: 'แม่น้ำโขงยามเย็น',              description: 'แสงสีทองตอนเย็นสวยมาก',              tags: 'แม่น้ำ, ทริป',                  camera: 'iPhone 15',      visibility: 'public' },
  { file: 'oldtown.jpg',    owner: 'user1', album: 'user1:ทริปภาคเหนือ', title: 'ตรอกเก่าเชียงราย (ส่วนตัว)',      description: 'ภาพนี้ตั้งเป็นส่วนตัว ไม่แสดงต่อสาธารณะ', tags: 'เมืองเก่า',              camera: 'iPhone 15',      visibility: 'private' },
  { file: 'dessert.jpg',    owner: 'user1', album: 'user1:ขนมไทย',       title: 'ขนมไทยหน้าเตียน',                description: 'ถ่ายตอนร้านยามเย็น แสงสวย',         tags: 'ขนม, อาหาร',                  camera: 'Samsung S23',    visibility: 'public' },
  { file: 'cat.jpg',        owner: 'user2', album: 'user2:สัตว์เลี้ยง',    title: 'แมวนอนตากแดด',                   description: 'นอนเต็มที่เลยจนขี้เกียจตื่น',        tags: 'แมว, สัตว์เลี้ยง',             camera: 'iPhone 15',      visibility: 'public' },
  { file: 'dog.jpg',        owner: 'user2', album: 'user2:สัตว์เลี้ยง',    title: 'สุนัขในสวนบ้าน',                 description: 'วันหยุดเล่นในสวน',                   tags: 'สุนัข, สัตว์เลี้ยง, สวน',       camera: 'iPhone 15',      visibility: 'public' },
  { file: 'bird.jpg',       owner: 'user2', album: 'user2:สัตว์เลี้ยง',    title: 'นกกระเรียนบิน (ส่วนตัว)',           description: 'เผยแพร่เป็นส่วนตัว',                tags: 'นก, ธรรมชาติ',                camera: 'Sony A6400',     visibility: 'private' },
];

/** ชื่อรูปตัวอย่าง -> ไฟล์ที่ database เดิมชี้อยู่ (ใช้ไฟล์เดิมซ้ำ ไม่ดาวน์โหลดใหม่) */
const REUSE_FILES = new Map();

// ---------------------------------------------------------------
// เตรียมโฟลเดอร์ / ล้างข้อมูลเดิม
// ---------------------------------------------------------------
fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
fs.mkdirSync(config.paths.uploads, { recursive: true });

/** อ่านรายชื่อรูปจาก database เดิมก่อนลบ เพื่อใช้ไฟล์เดิมซ้ำ (ไฟล์รูปไม่ถูกแตะต้อง) */
function collectReuseFiles() {
  if (!fs.existsSync(config.dbFile)) return;

  try {
    const { DatabaseSync } = require('node:sqlite');
    const oldDb = new DatabaseSync(config.dbFile);
    const rows = oldDb.prepare('SELECT original_name, file_name FROM photos').all();
    oldDb.close();

    const seedNames = new Set(PHOTOS.map((p) => p.file));
    for (const row of rows) {
      if (seedNames.has(row.original_name)) REUSE_FILES.set(row.original_name, row.file_name);
    }
  } catch (error) {
    console.warn(`  ! อ่านฐานข้อมูลเดิมไม่ได้ (${error.message}) — จะดาวน์โหลดรูปตัวอย่างใหม่`);
  }
}

if (RESET) {
  collectReuseFiles();

  const kept = fs.readdirSync(config.paths.uploads).filter((f) => f !== '.gitkeep').length;
  console.log('กำลังล้างฐานข้อมูล ...');
  console.log(`  เก็บไฟล์รูปไว้ทั้งหมด ${kept} ไฟล์ (ไม่ลบไฟล์ใน public/uploads — รูปที่อัปโหลดเองยังอยู่)`);

  for (const suffix of ['', '-shm', '-wal']) {
    const file = config.dbFile + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

const handle = db.getDb();
const existing = db.get(`SELECT COUNT(*) AS total FROM users`);

if (existing.total > 0) {
  console.log(`ฐานข้อมูลมีผู้ใช้อยู่แล้ว ${existing.total} บัญชี — ข้ามการ seed`);
  console.log('ถ้าต้องการสร้างข้อมูลใหม่ทั้งหมด ให้รัน: npm run reset');
  process.exit(0);
}

// ---------------------------------------------------------------
// 1) ผู้ใช้
// ---------------------------------------------------------------
const USERS = [
  { username: 'admin',  email: 'admin@photoprism.com',  password: 'admin123', fullName: 'ผู้ดูแลระบบ (Admin)',  role: 'admin',  status: 'active' },
  { username: 'user1',  email: 'user1@photoprism.com',  password: 'user123', fullName: 'สมชาย ใจดี',            role: 'user',   status: 'active' },
  { username: 'user2',  email: 'user2@photoprism.com',  password: 'user123', fullName: 'สมหญิง รักถ่ายภาพ',       role: 'user',   status: 'active' },
  { username: 'user3',  email: 'user3@photoprism.com',  password: 'user123', fullName: 'ปิยะ ถูกระงับบัญชี',   role: 'user',   status: 'suspended' },
];

async function seedUsers() {
  const ids = {};
  for (const u of USERS) {
    const passwordHash = await hashPassword(u.password);
    const result = db.run(
      `INSERT INTO users (username, email, password_hash, full_name, role, status)
       VALUES (:username, :email, :passwordHash, :fullName, :role, :status)`,
      { username: u.username, email: u.email, passwordHash, fullName: u.fullName, role: u.role, status: u.status }
    );
    ids[u.username] = Number(result.lastInsertRowid);
  }
  return ids;
}

// ---------------------------------------------------------------
// 2) Album
// ---------------------------------------------------------------
const ALBUMS = [
  { owner: 'user1', name: 'ทริปภาคเหนือ', description: 'รูปจากทริปเชียงราย - แม่ฮ่องสอน ปี 2026' },
  { owner: 'user1', name: 'ขนมไทย',       description: 'ขนมไทยน่ารัก ๆ ที่ชอบกิน' },
  { owner: 'user2', name: 'สัตว์เลี้ยง',    description: 'แมวและสุนัขของบ้าน' },
];

function seedAlbums(userIds) {
  const ids = {};
  for (const a of ALBUMS) {
    const result = db.run(
      `INSERT INTO albums (user_id, name, description) VALUES (:userId, :name, :description)`,
      { userId: userIds[a.owner], name: a.name, description: a.description }
    );
    ids[`${a.owner}:${a.name}`] = Number(result.lastInsertRowid);
  }
  return ids;
}

const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

async function downloadSample(fileName) {
  const url = `https://picsum.photos/seed/photoprism-${fileName.split('.')[0]}/1200/800`;
  const response = await fetch(url, { redirect: 'follow' });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = (response.headers.get('content-type') || '').split(';')[0];
  const buffer = Buffer.from(await response.arrayBuffer());

  const ext = EXTENSION_BY_MIME[contentType] || '.jpg';
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const target = path.join(config.paths.uploads, storedName);

  fs.writeFileSync(target, buffer);

  const { width, height } = imageSize(buffer);
  return {
    fileName: storedName,
    mimeType: EXTENSION_BY_MIME[contentType] ? contentType : 'image/jpeg',
    fileSize: buffer.length,
    width,
    height,
  };
}

/**
 * ใช้ไฟล์รูปตัวอย่างที่มีอยู่แล้ว (ไม่ดาวน์โหลดซ้ำ)
 * เกิดขึ้นเมื่อ reset — ไฟล์เดิมยังอยู่ใน public/uploads จึงหยิบกลับมาใช้ได้เลย
 */
function reuseSample(originalName) {
  const storedName = REUSE_FILES.get(originalName);
  if (!storedName) return null;

  const target = path.join(config.paths.uploads, storedName);
  if (!fs.existsSync(target)) return null;

  const buffer = fs.readFileSync(target);
  const { width, height } = imageSize(buffer);

  const mimeByExt = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };

  return {
    fileName: storedName,
    mimeType: mimeByExt[path.extname(storedName).toLowerCase()] || 'image/jpeg',
    fileSize: buffer.length,
    width,
    height,
  };
}

async function seedPhotos(userIds, albumIds) {
  let created = 0;

  for (const p of PHOTOS) {
    let file = reuseSample(p.file);

    if (file) {
      console.log(`  + ใช้ไฟล์เดิม ${p.title} (ไม่ดาวน์โหลดซ้ำ)`);
    } else {
      try {
        file = await downloadSample(p.file);
        console.log(`  + ดาวน์โหลดรูป ${p.title}`);
      } catch (error) {
        console.warn(`  ! โหลดรูป "${p.title}" ไม่สำเร็จ (${error.message}) — ข้ามรูปนี้`);
        continue;
      }
    }

    db.run(
      `INSERT INTO photos
         (owner_id, album_id, title, description, tags, camera,
          file_name, original_name, mime_type, file_size, width, height, visibility)
       VALUES
         (:ownerId, :albumId, :title, :description, :tags, :camera,
          :fileName, :originalName, :mimeType, :fileSize, :width, :height, :visibility)`,
      {
        ownerId: userIds[p.owner],
        albumId: albumIds[p.album] || null,
        title: p.title,
        description: p.description,
        tags: p.tags,
        camera: p.camera,
        fileName: file.fileName,
        originalName: p.file,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        width: file.width,
        height: file.height,
        visibility: p.visibility,
      }
    );
    created += 1;
  }

  return created;
}

// ---------------------------------------------------------------
// 4) Activity log เริ่มต้น
// ---------------------------------------------------------------
function seedLogs(userIds) {
  const rows = [
    [userIds.admin, 'admin',  'SEED', 'สร้างข้อมูลตัวอย่างเรียบร้อย'],
    [userIds.admin, 'admin',  'ADMIN_CREATE_USER', 'สร้างบัญชีผู้ใช้ 4 บัญชี'],
    [userIds.user1, 'user1',  'CREATE_ALBUM', 'สร้าง Album: ทริปภาคเหนือ'],
    [userIds.user1, 'user1',  'UPLOAD_PHOTO', 'อัปโหลดรูป: ดอยอินทนากร ช่วงพระอาทิตย์ขึ้น'],
    [userIds.user2, 'user2',  'UPLOAD_PHOTO', 'อัปโหลดรูป: แมวนอนตากแดด'],
    [userIds.admin, 'admin',  'ADMIN_SUSPEND_USER', 'ระงับบัญชี: user3'],
  ];

  for (const [userId, username, action, target] of rows) {
    db.run(
      `INSERT INTO activity_logs (user_id, username, action, target)
       VALUES (:userId, :username, :action, :target)`,
      { userId, username, action, target }
    );
  }
}

// ---------------------------------------------------------------
// เริ่มการ seed
// ---------------------------------------------------------------
(async () => {
  console.log('กำลังสร้างข้อมูลตัวอย่าง PhotoPrism ...\n');

  console.log('[1/4] สร้างผู้ใช้');
  const userIds = await seedUsers();
  for (const u of USERS) {
    console.log(`  + ${u.username.padEnd(6)} ${u.password}  (${u.role}${u.status === 'suspended' ? ', ถูกระงับ' : ''})`);
  }

  console.log('\n[2/4] สร้าง Album');
  const albumIds = seedAlbums(userIds);
  for (const a of ALBUMS) console.log(`  + ${a.owner} : ${a.name}`);

  console.log('\n[3/4] ดาวน์โหลดรูปภาพตัวอย่าง');
  const photoCount = await seedPhotos(userIds, albumIds);

  console.log('\n[4/4] สร้าง Activity Log เริ่มต้น');
  seedLogs(userIds);

  console.log('\n--------------------------------------------------');
  console.log('สร้างข้อมูลตัวอย่างเรียบร้อย');
  console.log(`  ผู้ใช้ ${USERS.length} บัญชี | Album ${ALBUMS.length} ชุด | รูปภาพ ${photoCount} รูป`);
  console.log('\nบัญชีสำหรับทดลองใช้งาน');
  console.log('  Admin : admin / admin123');
  console.log('  User  : user1 / user123');
  console.log('  User  : user2 / user123');
  console.log('  (บัญชีที่ถูกระงับ : user3 / user123)');
  console.log('\nรันเว็บด้วยคำสั่ง: npm start   แล้วเปิด http://localhost:3000');
  console.log('--------------------------------------------------');

  handle.close();
})().catch((error) => {
  console.error('Seed ล้มเหลว:', error);
  process.exit(1);
});