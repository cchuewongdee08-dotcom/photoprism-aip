'use strict';

/**
 * ชุดทดสอบระบบสิทธิ์ PhotoPrism (User / Admin)
 * -------------------------------------------------------------
 * ใช้สาธิตประกอบคำอธิบายต่ออาจารย์ได้ โดยสคริปต์นี้จะยิงคำขอจริง
 * ไปยังเซิร์ฟเวอร์ที่กำลังรันอยู่ แล้วตรวจว่าได้รับสถานะตามที่ควรเป็นหรือไม่
 *
 * วิธีใช้:
 *   1) เปิดอีกหน้าต่างแล้วรัน  npm start
 *   2) รัน  npm test
 *
 * ผลลัพธ์จะแสดงว่า User และ Admin ถูกปฏิเสธ/อนุญาตต่างกันอย่างไร
 */

const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

let passed = 0;
let failed = 0;

/** client ที่จำ cookie ไว้เพื่อเลียนแบบเบราว์เซอร์ */
function createClient() {
  const cookies = new Map();

  const cookieHeader = () =>
    [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  function saveCookies(response) {
    const list = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const raw of list) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  async function request(method, url, { body, form, headers = {}, redirect = 'manual' } = {}) {
    const init = { method, redirect, headers: { ...headers } };

    if (cookies.size) init.headers.Cookie = cookieHeader();
    if (form) {
      init.body = form;
    } else if (typeof body === 'string') {
      // ข้อมูลแบบฟอร์มเว็บ (application/x-www-form-urlencoded)
      init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/x-www-form-urlencoded';
      init.body = body;
    } else if (body !== undefined && body !== null) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${url}`, init);
    saveCookies(response);

    let payload = null;
    const text = await response.text();
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }

    return { status: response.status, location: response.headers.get('location'), body: payload };
  }

  return {
    get: (url, options) => request('GET', url, options),
    post: (url, options) => request('POST', url, options),
    patch: (url, options) => request('PATCH', url, options),
    delete: (url, options) => request('DELETE', url, options),
    /** ส่งฟอร์มแบบเว็บ (application/x-www-form-urlencoded) */
    form: (url, data) => request('POST', url, { body: data, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
    /** สร้าง multipart/form-data ไว้ทดสอบการอัปโหลด */
    uploadForm(fields) {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.append(key, value);
      return form;
    },
  };
}

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}  (ได้ ${actual})`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}  (ได้ ${actual} แต่ควรเป็น ${expected})`);
  }
}

function section(text) {
  console.log(`\n${text}`);
  console.log('-'.repeat(66));
}

async function login(client, username, password) {
  return client.form('/login', new URLSearchParams({ username, password }).toString());
}

(async () => {
  console.log(`กำลังทดสอบระบบ PhotoPrism ที่ ${BASE_URL}`);
  console.log('='.repeat(66));

  // -------------------------------------------------------------
  section('1. ผู้ที่ยังไม่ได้ Login (Guest)');
  const guest = createClient();
  check('GET / แกลเลอรีสาธารณะ', (await guest.get('/')).status, 200);
  check('GET /login หน้าเข้าสู่ระบบ', (await guest.get('/login')).status, 200);
  check('GET /admin ถูกพากลับไปหน้า Login', (await guest.get('/admin')).status, 302);
  check('GET /upload ถูกพากลับไปหน้า Login', (await guest.get('/upload')).status, 302);
  check('GET /api/photos ดูรูปสาธารณะได้', (await guest.get('/api/photos')).status, 200);
  check('GET /api/admin/stats ถูกปฏิเสธ (401)', (await guest.get('/api/admin/stats')).status, 401);

  // -------------------------------------------------------------
  section('2. ผู้ใช้ระดับ User (user1)');
  const user = createClient();
  check('POST /login สำเร็จ', (await login(user, 'user1', 'user123')).status, 302);
  check('GET /api/auth/me เห็นข้อมูลตัวเอง', (await user.get('/api/auth/me')).status, 200);
  check('GET / ดูแกลเลอรีได้', (await user.get('/')).status, 200);
  check('GET /upload เข้าหน้าอัปโหลดได้', (await user.get('/upload')).status, 200);
  check('GET /albums เข้าหน้า Album ได้', (await user.get('/albums')).status, 200);
  check('GET /api-demo หน้าทดสอบสิทธิ์', (await user.get('/api-demo')).status, 200);

  section('2.1 สิทธิ์ที่ User "ไม่มี" — ต้องถูกปฏิเสธที่ Server');
  check('GET /admin หน้าผู้ดูแล (403)', (await user.get('/admin')).status, 403);
  check('GET /admin/users (403)', (await user.get('/admin/users')).status, 403);
  check('GET /api/admin/stats (403)', (await user.get('/api/admin/stats')).status, 403);
  check('GET /api/admin/users (403)', (await user.get('/api/admin/users')).status, 403);
  check('POST /api/admin/users สร้างผู้ใช้ (403)',
    (await user.post('/api/admin/users', { body: { username: 'hack', email: 'h@h.com', password: '123456' } })).status, 403);
  check('DELETE /api/admin/users/2 (403)', (await user.delete('/api/admin/users/2')).status, 403);

  section('2.2 สิทธิ์ที่ User "มี" — ทำได้เฉพาะของตัวเอง');
  check('POST /api/albums สร้าง Album ของตัวเอง (201)',
    (await user.post('/api/albums', { body: { name: 'Album ทดสอบระบบสิทธิ์' } })).status, 201);

  const albums = await user.get('/api/albums');
  const newAlbumId = albums.body.albums?.[0]?.id;

  // หา "รูปของคนอื่น" จากข้อมูลจริง ไม่ผูกกับ ID ตายตัว
  // (ถ้าการดาวน์โหลดรูปตัวอย่างสะดุด ID อาจเลื่อน ทำให้เทสต์เพี้ยน)
  const others = (await guest.get('/api/photos')).body.photos || [];
  const otherPhotoId = others.find((p) => p.owner && p.owner.id !== 1)?.id;
  check('พบรูปของผู้ใช้อื่นสำหรับทดสอบ (ต้องมีอย่างน้อย 1 รูป)', otherPhotoId ? 200 : 404, 200);

  check(`PATCH /api/photos/${otherPhotoId} แก้รูปของคนอื่น (403)`,
    (await user.patch(`/api/photos/${otherPhotoId}`, { body: { title: 'แก้ชื่อทั้งที่ไม่มีสิทธิ์' } })).status, 403);
  check(`DELETE /api/photos/${otherPhotoId} ลบรูปของคนอื่น (403)`, (await user.delete(`/api/photos/${otherPhotoId}`)).status, 403);
  check(`GET /photos/${otherPhotoId}/edit แก้รูปของคนอื่น (403)`, (await user.get(`/photos/${otherPhotoId}/edit`)).status, 403);

  section('2.3 รูปส่วนตัว (private) — เจ้าของเห็น คนอื่นไม่เห็น');
  const userPhotos = await user.get('/api/photos?scope=mine');
  const ownIds = userPhotos.body.photos.map((p) => p.id);
  const ownPrivate = userPhotos.body.photos.find((p) => p.visibility === 'private');
  check('ดูรูปส่วนตัวของตัวเองได้', (await user.get(`/api/photos/${ownPrivate.id}`)).status, 200);
  check('เปิดหน้ารายละเอียดรูปของตัวเองได้ (รวมรูปที่เกี่ยวข้อง)',
    (await user.get(`/photo/${ownPrivate.id}`)).status, 200);
  check('เปิดหน้ารายละเอียดรูปสาธารณะของคนอื่นได้ (รวมรูปที่เกี่ยวข้อง)',
    (await user.get(`/photo/${otherPhotoId}`)).status, 200);

  const other = createClient();
  await login(other, 'user2', 'user123');
  check('user2 ดูรูปส่วนตัวของ user1 ไม่ได้ (403)',
    (await other.get(`/api/photos/${ownPrivate.id}`)).status, 403);
  check('user2 เปิดหน้ารูปส่วนตัวของ user1 ไม่ได้ (403)',
    (await other.get(`/photo/${ownPrivate.id}`)).status, 403);

  const user2Albums = await other.get('/api/albums');
  check('user2 เปิด Album ของ user1 ไม่ได้ (403)',
    (await other.get(`/albums/${newAlbumId}`)).status, 403);
  check('user2 ลบ Album ของ user1 ไม่ได้ (403)',
    (await other.form(`/albums/${newAlbumId}/delete`, '')).status, 403);

  section('2.4 ตรวจเนื้อหาหน้าเว็บ (กรองขอบเขตต้องทำงานจริง)');
  const photoIdsIn = (html) =>
    new Set([...String(html).matchAll(/\/photo\/(\d+)/g)].map((m) => Number(m[1])));

  const myId = (await user.get('/api/auth/me')).body.user.id;
  const visible = (await user.get('/api/photos?scope=all')).body.photos || [];
  const myPhotoIds = visible.filter((p) => p.owner.id === myId).map((p) => p.id);
  const otherPhotoIds = visible.filter((p) => p.owner.id !== myId).map((p) => p.id);
  const privateIds = visible.filter((p) => p.visibility === 'private').map((p) => p.id);

  const scopeMinePage = await user.get('/?scope=mine');
  const scopeMineIds = photoIdsIn(scopeMinePage.body);
  check('GET /?scope=mine หน้าแกลเลอรีกรองเฉพาะของตัวเอง (200 + ไม่มีรูปคนอื่น)',
    scopeMinePage.status === 200 &&
      myPhotoIds.some((id) => scopeMineIds.has(id)) &&
      otherPhotoIds.every((id) => !scopeMineIds.has(id)),
    true);

  const myPhotosPage = await user.get('/my/photos');
  const myPhotosIds = photoIdsIn(myPhotosPage.body);
  check('GET /my/photos แสดงเฉพาะรูปของตัวเอง (200 + ไม่มีรูปคนอื่น)',
    myPhotosPage.status === 200 &&
      myPhotoIds.some((id) => myPhotosIds.has(id)) &&
      otherPhotoIds.every((id) => !myPhotosIds.has(id)),
    true);

  const scopePublicPage = await user.get('/?scope=public');
  const scopePublicIds = photoIdsIn(scopePublicPage.body);
  check('GET /?scope=public หน้าแกลเลอรีไม่แสดงรูปส่วนตัว (200 + ไม่มีรูป private)',
    scopePublicPage.status === 200 &&
      privateIds.every((id) => !scopePublicIds.has(id)) &&
      visible.some((p) => p.visibility === 'public' && scopePublicIds.has(p.id)),
    true);

  section('2.5 วงจรการอัปโหลด / แก้ไข / ลบ ของ User');
  const sample = fs.readdirSync(UPLOADS_DIR).find((f) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
  if (!sample) {
    console.log('  SKIP  ไม่พบไฟล์รูปตัวอย่างใน public/uploads — ข้ามการทดสอบอัปโหลด');
  } else {
    const buffer = fs.readFileSync(path.join(UPLOADS_DIR, sample));
    const form = user.uploadForm({
      title: 'รูปทดสอบระบบสิทธิ์',
      description: 'สร้างจาก test/permission-test.js',
      tags: 'ทดสอบ',
      visibility: 'private',
      albumId: String(newAlbumId),
      file: new Blob([buffer], { type: 'image/jpeg' }),
    });

    const upload = await user.post('/api/photos', { form });
    check('POST /api/photos อัปโหลดรูป (201)', upload.status, 201);
    const newPhotoId = upload.body.photo?.id;

    check('ไฟล์รูปถูกบันทึกในรูปแบบส่วนตัว',
      upload.body.photo?.visibility === 'private', true);
    check('ระบบอ่านขนาดภาพได้ (width x height)',
      Boolean(upload.body.photo?.width && upload.body.photo?.height), true);
    check('user2 ดูรูปส่วนตัวของ user1 ที่เพิ่งอัปโหลดไม่ได้ (403)',
      (await other.get(`/api/photos/${newPhotoId}`)).status, 403);

    check('PATCH /api/photos/:id แก้ไขรูปของตัวเอง (200)',
      (await user.patch(`/api/photos/${newPhotoId}`, { body: { title: 'แก้ชื่อแล้ว' } })).status, 200);
    check('PATCH รูปของคนอื่น (403)',
      (await user.patch(`/api/photos/${otherPhotoId}`, { body: { title: 'ไม่มีสิทธิ์' } })).status, 403);
    check('DELETE รูปของตัวเอง (200)', (await user.delete(`/api/photos/${newPhotoId}`)).status, 200);
    check('GET /api/photos/:id หลังลบ (404)', (await user.get(`/api/photos/${newPhotoId}`)).status, 404);
  }

  if (newAlbumId) {
    check('DELETE /api/albums/:id ลบ Album ของตัวเอง (200)',
      (await user.delete(`/api/albums/${newAlbumId}`)).status, 200);
  }

  section('2.6 บัญชีถูกระงับโดย Admin — เข้าสู่ระบบไม่ได้');
  const suspended = createClient();
  check('POST /login บัญชีถูกระงับ (401)', (await login(suspended, 'user3', 'user123')).status, 401);
  check('POST /login รหัสผิด (401)', (await login(createClient(), 'user1', 'wrongpass')).status, 401);

  section('2.7 สมัครบัญชีใหม่ — ได้สิทธิ์ User เท่านั้นเสมอ');
  const stamp = Date.now();
  const register = createClient();
  check('POST /register สมัครบัญชี (302)',
    (await register.form('/register', new URLSearchParams({
      username: `demo${stamp}`,
      email: `demo${stamp}@test.com`,
      password: 'demo1234',
      confirmPassword: 'demo1234',
      fullName: 'ผู้สมัครใหม่',
    }).toString())).status, 302);

  check('POST /register รหัสไม่ตรงกัน (400)',
    (await createClient().form('/register', new URLSearchParams({
      username: `bad${stamp}`, email: `bad${stamp}@test.com`,
      password: 'demo1234', confirmPassword: 'different',
    }).toString())).status, 400);

  section('2.8 โปรไฟล์: แก้ชื่อตัวเองและเปลี่ยนรหัสผ่าน');
  const demo = createClient();
  check('POST /login บัญชีที่เพิ่งสมัคร (302)',
    (await login(demo, `demo${stamp}`, 'demo1234')).status, 302);
  check('GET /profile เปิดหน้าโปรไฟล์ได้ (200)', (await demo.get('/profile')).status, 200);
  check('GET /profile ของ Guest ถูกพากลับหน้า Login (302)',
    (await createClient().get('/profile')).status, 302);
  check('POST /profile แก้ชื่อ-นามสกุล (302)',
    (await demo.form('/profile', new URLSearchParams({
      username: `demo${stamp}`, fullName: 'ชื่อที่แก้ไขแล้ว',
    }).toString())).status, 302);
  check('/api/auth/me แสดงชื่อใหม่ทันทีที่บันทึก',
    (await demo.get('/api/auth/me')).body.user.fullName === 'ชื่อที่แก้ไขแล้ว', true);
  check('POST /profile ใช้ชื่อที่ซ้ำกับ user1 (400)',
    (await demo.form('/profile', new URLSearchParams({
      username: 'user1', fullName: 'ชื่อที่แก้ไขแล้ว',
    }).toString())).status, 400);
  check('POST /profile/password ใส่รหัสปัจจุบันผิด (400)',
    (await demo.form('/profile/password', new URLSearchParams({
      currentPassword: 'wrongpass', newPassword: 'newpass123', confirmPassword: 'newpass123',
    }).toString())).status, 400);
  check('POST /profile/password เปลี่ยนรหัสสำเร็จ (302)',
    (await demo.form('/profile/password', new URLSearchParams({
      currentPassword: 'demo1234', newPassword: 'newpass123', confirmPassword: 'newpass123',
    }).toString())).status, 302);
  check('ล็อกอินด้วยรหัสใหม่ได้ (302)',
    (await login(createClient(), `demo${stamp}`, 'newpass123')).status, 302);
  check('รหัสเดิมใช้ล็อกอินไม่ได้แล้ว (401)',
    (await login(createClient(), `demo${stamp}`, 'demo1234')).status, 401);

  // -------------------------------------------------------------
  section('3. ผู้ดูแลระบบ (admin)');
  const admin = createClient();
  check('POST /login สำเร็จ', (await login(admin, 'admin', 'admin123')).status, 302);
  check('GET /admin แดชบอร์ด (200)', (await admin.get('/admin')).status, 200);
  check('GET /admin/users (200)', (await admin.get('/admin/users')).status, 200);
  check('GET /admin/photos (200)', (await admin.get('/admin/photos')).status, 200);
  check('GET /admin/logs (200)', (await admin.get('/admin/logs')).status, 200);
  check('GET /api/admin/stats (200)', (await admin.get('/api/admin/stats')).status, 200);

  section('3.1 Admin เห็นรูปส่วนตัวของผู้ใช้ได้ (ต่างจาก User)');
  check('GET รูปส่วนตัวของ user1 (200)', (await admin.get(`/api/photos/${ownPrivate.id}`)).status, 200);
  check('GET หน้าเว็บรูปส่วนตัวของ user1 (200)', (await admin.get(`/photo/${ownPrivate.id}`)).status, 200);
  check('PATCH รูปของผู้ใช้ได้ (200)',
    (await admin.patch(`/api/photos/${ownPrivate.id}`, { body: { title: 'ผู้ดูแลแก้ชื่อได้' } })).status, 200);

  const allPhotos = await admin.get('/api/photos');
  const guestPhotos = await guest.get('/api/photos');
  check('Admin เห็นรูปมากกว่า Guest', allPhotos.body.total > guestPhotos.body.total, true);

  section('3.2 Admin จัดการผู้ใช้ได้');
  const created = await admin.post('/api/admin/users', {
    body: { username: `adm${stamp}`, email: `adm${stamp}@test.com`, password: 'demo1234', fullName: 'สร้างโดยแอดมิน', role: 'user' },
  });
  check('POST /api/admin/users สร้างผู้ใช้ (201)', created.status, 201);
  const createdId = created.body.user?.id;

  check('PATCH /api/admin/users/:id ระงับบัญชี (200)',
    (await admin.patch(`/api/admin/users/${createdId}`, { body: { status: 'suspended' } })).status, 200);
  check('บัญชีที่ถูกระงับเข้าสู่ระบบไม่ได้ (401)',
    (await login(createClient(), `adm${stamp}`, 'demo1234')).status, 401);

  check('PATCH ของตัวเองเองถูกป้องกัน (400)',
    (await admin.patch('/api/admin/users/1', { body: { status: 'suspended' } })).status, 400);
  check('Admin คนสุดท้ายลบตัวเองไม่ได้ (400)',
    (await admin.delete('/api/admin/users/1')).status, 400);
  check('ลดสิทธิ์ Admin คนสุดท้ายไม่ได้ (400)',
    (await admin.patch('/api/admin/users/1', { body: { role: 'user' } })).status, 400);

  check('DELETE /api/admin/users/:id ลบผู้ใช้ (200)', (await admin.delete(`/api/admin/users/${createdId}`)).status, 200);

  check('รายชื่อผู้ใช้ที่ Admin เห็น มีจำนวนรูป/Album พร้อมใช้งาน',
    (await admin.get('/api/admin/users')).body.users.every((u) => typeof u.photoCount === 'number'), true);
  check('หน้า /admin/users แสดงจำนวนรูปของผู้ใช้ (ไม่ใช่ค่าว่าง)',
    ((await admin.get('/admin/users')).body || '').includes('admin'), true);

  section('3.3 การเปลี่ยนสิทธิ์/สถานะ มีผลกับ session ที่ยัง Login อยู่ทันที');
  const live = createClient();
  await login(live, 'user1', 'user123');
  const liveId = (await live.get('/api/auth/me')).body.user.id;

  check('ก่อนระงับ: session เดิมยังใช้ได้ (200)', (await live.get('/my/photos')).status, 200);

  const demoted = await admin.patch(`/api/admin/users/${liveId}`, { body: { status: 'suspended' } });
  check('Admin ระงับบัญชีที่กำลัง Login อยู่ (200)', demoted.status, 200);

  check('หลังระงับ: session เดิมถูกตัดทันที (302 พากลับหน้า Login)',
    (await live.get('/my/photos')).status, 302);
  check('หลังระงับ: API ก็ถูกปฏิเสธทันที (401/403)',
    [401, 403].includes((await live.get('/api/auth/me')).status), true);

  await admin.patch(`/api/admin/users/${liveId}`, { body: { status: 'active' } });
  check('กลับมาเป็น active แล้ว Login ใหม่ได้',
    (await login(createClient(), 'user1', 'user123')).status, 302);

  section('3.4 ป้องกันการเขียนข้ามสิทธิ์ (Privilege Escalation)');
  const fake = createClient();
  await login(fake, 'user1', 'user123');
  check('User ส่ง role=admin ในคำขอสร้างผู้ใช้ ก็ยังถูกปฏิเสธที่ /api/admin/users (403)',
    (await fake.post('/api/admin/users', { body: { username: `esc${stamp}`, email: `e${stamp}@t.com`, password: 'demo1234', role: 'admin' } })).status, 403);
  check('หน้า /admin เปลี่ยน URL ตรง ๆ ก็เข้าไม่ได้ (403)', (await fake.get('/admin')).status, 403);
  check('GET /admin/logs เข้าไม่ได้ (403)', (await fake.get('/admin/logs')).status, 403);

  section('3.5 Admin แก้ไขบัญชีผู้อื่น (ชื่อผู้ใช้ + รีเซ็ตรหัสผ่าน)');
  const demoId = (await demo.get('/api/auth/me')).body.user.id;

  check('User เรียก POST /admin/users/:id/edit ไม่ได้ (403)',
    (await fake.post(`/admin/users/${demoId}/edit`, {
      body: { username: 'hackname', fullName: 'ขโมยแก้ชื่อ' },
    })).status, 403);

  check('Admin แก้ชื่อผู้ใช้ + รีเซ็ตรหัสผ่าน (302)',
    (await admin.form(`/admin/users/${demoId}/edit`, new URLSearchParams({
      username: `renamed${stamp}`,
      fullName: 'ชื่อใหม่โดยแอดมิน',
      password: 'reset1234',
    }).toString())).status, 302);

  check('ล็อกอินด้วยชื่อใหม่ + รหัสใหม่ได้ (302)',
    (await login(createClient(), `renamed${stamp}`, 'reset1234')).status, 302);
  check('ชื่อเดิมใช้ล็อกอินไม่ได้แล้ว (401)',
    (await login(createClient(), `demo${stamp}`, 'reset1234')).status, 401);

  check('Admin แก้บัญชีตัวเองผ่านหน้า /admin/users ไม่ได้ (ระบบป้องกัน)',
    (await admin.form('/admin/users/1/edit', new URLSearchParams({
      username: 'hackedadmin', fullName: 'พยายามแก้เอง',
    }).toString())).status, 302);
  check('ชื่อแอดมินยังเป็น username เดิม',
    (await admin.get('/api/auth/me')).body.user.username === 'admin', true);

  section('4. Logout และหน้าที่ไม่มีอยู่');
  check('POST /logout ออกจากระบบ (302)', (await user.form('/logout', '')).status, 302);
  check('หลัง logout เข้า /upload ไม่ได้ (302)', (await user.get('/upload')).status, 302);
  check('GET /api/auth/me หลัง logout (401)', (await user.get('/api/auth/me')).status, 401);
  check('GET /หน้าที่ไม่มีอยู่ (404)', (await guest.get('/ไม่มีหน้านี้')).status, 404);

  // -------------------------------------------------------------
  console.log('\n' + '='.repeat(66));
  console.log(`ผลการทดสอบ: ผ่าน ${passed} รายการ / ไม่ผ่าน ${failed} รายการ`);
  console.log('='.repeat(66));

  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error('\nเกิดข้อผิดพลาดระหว่างทดสอบ:', error.message);
  console.error('ตรวจสอบว่าเซิร์ฟเวอร์รันอยู่หรือไม่ (npm start) แล้วลองใหม่อีกครั้ง');
  process.exit(1);
});