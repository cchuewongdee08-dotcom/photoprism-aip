# PhotoPrism — ระบบจัดการรูปภาพ (Photo Management)

เว็บแอปจัดการรูปภาพแบบ Full-Stack ที่มีระบบสมาชิก **2 สิทธิ์ (User / Admin)**
และ**บังคับสิทธิ์ที่ฝั่ง Server (Backend)** ทุกคำขอ รองรับภาษาไทยทั้งหมด

---

## 1. เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
| --- | --- |
| Backend | Node.js 22.5+ · Express 5 · REST API |
| ฐานข้อมูล | SQLite ผ่านโมดูลในตัว `node:sqlite` (ไม่ต้องติดตั้ง MySQL) |
| Template | EJS (Server-side Rendering) |
| หน้าตา | Bootstrap 5 + CSS ปรับเพิ่ม |
| Session | `express-session` + `memorystore` + Cookie |
| รหัสผ่าน | `bcryptjs` (hash) |
| อัปโหลด | `multer` + ตรวจ MIME/ขนาดไฟล์ |
| อื่น ๆ | `image-size` (อ่านขนาดภาพ) |

ไม่ต้องติดตั้งฐานข้อมูลเพิ่ม — ใช้ไฟล์เดียว `data/photoprism.db` (SQLite)

---

## 2. วิธีติดตั้งและรัน

```bash
cd E:\PhotoPrism
npm install          # ติดตั้ง package
npm run seed         # สร้างตาราง + ข้อมูลตัวอย่าง (รันครั้งแรก)
npm start            # เปิดเซิร์ฟเวอร์
```

เปิดเบราว์เซอร์: **http://localhost:3000**

### คำสั่งทั้งหมดใน `package.json`

| คำสั่ง | ความหมาย |
| --- | --- |
| `npm start` | เปิดเซิร์ฟเวอร์ที่พอร์ต 3000 |
| `npm run seed` | สร้างข้อมูลตัวอย่าง (ลบข้อมูลเดิมในฐานข้อมูลก่อน) |
| `npm run reset` | ล้างฐานข้อมูลแล้วสร้างข้อมูลตัวอย่างใหม่ — **ไม่ลบไฟล์รูป** ใน `public/uploads` (รูปที่อัปโหลดเองยังอยู่ในเครื่องเสมอ) |
| `npm test` | รันชุดทดสอบสิทธิ์อัตโนมัติ (ต้องเปิดเซิร์ฟเวอร์ค้างไว้ก่อน) |

> ถ้าพอร์ต 3000 ถูกใช้งานอยู่ ให้กำหนดพอร์ตใหม่ก่อนรัน เช่น `$env:PORT=3001; npm start`

### ตัวแปรสภาพแวดล้อม (ไม่บังคับ)

| ตัวแปร | ค่าเริ่มต้น |
| --- | --- |
| `PORT` | `3000` |
| `SESSION_SECRET` | `photoprism-secret-2026` |

---

## 3. บัญชีสำหรับทดลองใช้งาน

| บัญชี | รหัสผ่าน | สิทธิ์ | หมายเหตุ |
| --- | --- | --- | --- |
| `admin` | `admin123` | Admin | เห็นทุกอย่าง รวมถึงรูปส่วนตัวของผู้ใช้อื่น |
| `user1` | `user123` | User | มีรูปส่วนตัวสำหรับทดสอบสิทธิ์ |
| `user2` | `user123` | User | ใช้ทดสอบว่า User จัดการของคนอื่นไม่ได้ |
| `user3` | `user123` | User | **บัญชีถูกระงับ** — ใช้ทดสอบว่า Login ไม่ได้ |

ข้อมูลตั้งต้นมี 4 ผู้ใช้ · 3 Album · 8 รูปภาพ (ดาวน์โหลดจริงจาก picsum.photos)

---

## 4. สิทธิ์ของแต่ละบทบาท (บังคับที่ Backend)

| ความสามารถ | Guest (ยังไม่ Login) | User | Admin |
| --- | :---: | :---: | :---: |
| ดูรูปภาพ Public | ✅ | ✅ | ✅ |
| ดูรูปภาพ Private | ❌ | ✅ เฉพาะของตัวเอง | ✅ ทุกคน |
| ค้นหา / แบ่งหน้า | ✅ | ✅ | ✅ |
| เข้าหน้า My Photos / Albums | ❌ (302 ไป Login) | ✅ | ✅ |
| อัปโหลดรูป | ❌ | ✅ | ✅ |
| แก้ไข / ลบรูป | ❌ | ✅ เฉพาะของตัวเอง | ✅ ทุกคน |
| สร้าง / แก้ / ลบ Album | ❌ | ✅ เฉพาะของตัวเอง | ✅ ทุกคน |
| แก้ชื่อตัวเอง / เปลี่ยนรหัสผ่านตัวเอง (`/profile`) | ❌ (302 ไป Login) | ✅ ของตัวเองเท่านั้น | ✅ ของตัวเองเท่านั้น |
| แก้ชื่อผู้ใช้ / รีเซ็ตรหัสผ่านของผู้อื่น | ❌ | ❌ | ✅ (จากหน้า `/admin/users`) |
| เข้า `/admin` และหน้าในระบบ Admin | ❌ (302 → Login) | ❌ **403** | ✅ |
| เรียก `/api/admin/*` | ❌ **401** | ❌ **403** | ✅ |
| จัดการผู้ใช้ / ดู Activity Log | ❌ | ❌ | ✅ |

จุดที่บังคับสิทธิ์:

- `src/middleware/auth.js` — `requireAuthPage` (302 ไปหน้า Login), `requireAdminPage` (403),
  `requireAuthApi` (401 JSON), `requireAdminApi` (403 JSON)
- `src/routes/adminRoutes.js` — ปิดทั้ง router ด้วย `router.use(requireAuthPage, requireAdminPage)`
- `src/services/photoService.js` — `canViewPhoto()` / `canManagePhoto()`
- `src/services/albumService.js` — `canViewAlbum()` / `canManageAlbum()`
- `src/services/userService.js` — `updateProfile()` (แก้ได้เฉพาะของตัวเอง),
  `changeOwnPassword()` (ต้องทราบรหัสเดิม), `adminUpdateUser()` (กัน Admin แก้บัญชีตัวเองผ่านหน้านี้)
- การแก้ไข/ลบตรวจ **สิทธิ์ก่อนตรวจข้อมูล** เพื่อไม่ให้ข้อมูลของผู้อื่นรั่วผ่านข้อความแจ้งเตือน

กฎความปลอดภัยเพิ่มเติม:

- บัญชีสุดท้ายที่ใช้งานได้ของสิทธิ์ Admin ลดสิทธิ์/ระงับ/ลบไม่ได้ (ต้องเหลือ Admin ที่ใช้งานได้อย่างน้อย 1 บัญชี)
- ผู้ดูแลเปลี่ยนสิทธิ์/สถานะ/ลบบัญชีของตัวเองไม่ได้
- รหัสผ่านเก็บเป็น bcrypt hash · เข้าสู่ระบบใหม่แล้ว session เดิมถูกลบ (session regeneration)
- ทุก request อ่าน `role` / `status` ล่าสุดจากฐานข้อมูล — ถ้า Admin ระงับบัญชีหรือลดสิทธิ์ใคร
  ผู้นั้นจะเสียสิทธิ์**ทันที** แม้ยังไม่ได้ Logout (session เดิมถูกล้างและเตือนให้ Login ใหม่)

---

## 5. โครงสร้างโปรเจกต์

```
E:\PhotoPrism
├── package.json / package-lock.json
├── .gitignore
├── README.md
├── server.js                     # จุดเริ่มต้นโปรแกรม
├── data/
│   └── photoprism.db             # ฐานข้อมูล SQLite (สร้างอัตโนมัติ)
├── public/
│   ├── css/style.css
│   ├── js/main.js
│   └── uploads/                  # ไฟล์รูปที่อัปโหลด + รูปตัวอย่าง
├── src/
│   ├── app.js                    # ตั้งค่า Express, session, static, mount route
│   ├── config.js                 # ค่าคอนฟิกทั้งหมด
│   ├── db/
│   │   ├── schema.sql            # โครงสร้างตาราง
│   │   ├── database.js           # ตัวห่อ DatabaseSync
│   │   └── seed.js               # ข้อมูลตัวอย่าง
│   ├── middleware/
│   │   ├── auth.js               # ตัวตรวจสิทธิ์
│   │   └── errorHandler.js       # จัดการ error เป็นหน้า 404/403/500
│   ├── routes/
│   │   ├── pageRoutes.js         # หน้าเว็บของ User/Guest
│   │   ├── authRoutes.js         # login / register / logout
│   │   ├── adminRoutes.js        # หน้า Admin (ปิดทั้ง router)
│   │   ├── apiRoutes.js          # REST API
│   │   └── demoEndpoints.js      # รายการ endpoint สำหรับหน้าสาธิต
│   ├── services/
│   │   ├── authService.js        # ตรวจรหัสผ่าน / session
│   │   ├── userService.js        # ผู้ใช้ + กฎ last admin
│   │   ├── photoService.js       # รูปภาพ + กฎสิทธิ์
│   │   ├── albumService.js       # Album + กฎสิทธิ์
│   │   ├── logService.js    # บันทึกการกระทำ
│   │   └── validation.js         # ตรวจความถูกต้องของฟอร์ม
│   └── utils/storage.js          # multer + ลบไฟล์
└── views/
    ├── partials/  (header, footer, photo-card, pagination)
    ├── pages/     (login, register, gallery, photoDetail, upload,
    │                editPhoto, myPhotos, albums, albumDetail, apiDemo,
    │                profile, error)
    └── admin/     (dashboard, users, photos, logs)
```

---

## 6. หน้าเว็บ (URL)

| URL | หน้า | สิทธิ์ |
| --- | --- | --- |
| `/` | แกลเลอรี + ค้นหา | ทุกคน |
| `/photo/:id` | รายละเอียดรูป + Metadata + รูปที่เกี่ยวข้อง | ตามสิทธิ์ของรูป |
| `/upload` | อัปโหลดรูป | Login |
| `/my/photos` | รูปของฉัน | Login |
| `/albums` | Album ของฉัน | Login |
| `/albums/:id` | รายละเอียด Album | เจ้าของ / Admin |
| `/photos/:id/edit` | แก้ไขรูป | เจ้าของ / Admin |
| `/api-demo` | หน้าทดสอบสิทธิ์ผ่าน API | Login |
| `/profile` | โปรไฟล์ — แก้ชื่อผู้ใช้/ชื่อ-นามสกุล + เปลี่ยนรหัสผ่าน | Login |
| `/login` · `/register` | เข้าสู่ระบบ / สมัครสมาชิก | ทุกคน |
| `/admin` | แดชบอร์ด (สถิติระบบ) | **Admin** |
| `/admin/users` | จัดการผู้ใช้ + แก้ชื่อ/รีเซ็ตรหัสผ่าน/เลื่อนสิทธิ์/ระงับ/ลบ | **Admin** |
| `/admin/photos` | ดูและลบรูปทั้งระบบ | **Admin** |
| `/admin/logs` | Activity Log | **Admin** |

---

## 7. REST API

ทุก response เป็น JSON · ต้องใช้ session cookie (`photoprism.sid`) เมื่อระบุว่า Login

### Authentication (v1 — แนะนำสำหรับทดสอบใน VS Code)

ใช้ token แบบ Bearer · ไฟล์ `api.http` มีตัวอย่างพร้อมกด **Send Request** ได้เลย
(ค่า URL/บัญชีอ่านจาก `.env`)

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| POST | `/api/v1/register` | ทุกคน | สมัครสมาชิกใหม่ `{ username, email, password, confirmPassword, fullName? }` |
| POST | `/api/v1/session` | ทุกคน | เข้าสู่ระบบ -> คืน `token` |
| GET | `/api/v1/session` | Login | ดูผู้ใช้ปัจจุบัน |
| DELETE | `/api/v1/session` | Login | ออกจากระบบ |
| PATCH | `/api/v1/account/password` | Login | เปลี่ยนรหัสผ่านตัวเอง |

Photos / Albums / Admin ใช้ path ชุดเดียวกับด้านล่าง แต่เปลี่ยน `/api` เป็น `/api/v1`

### Authentication

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | ทุกคน | `{ username, password }` |
| POST | `/api/auth/logout` | ทุกคน | ล้าง session |
| GET | `/api/auth/me` | ทุกคน | ข้อมูลผู้ใช้ปัจจุบัน (null ถ้ายังไม่ Login) |

### Photos

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/api/photos` | ทุกคน | `?q=&scope=all\|mine\|public\|private&page=&limit=` |
| GET | `/api/photos/:id` | ตามสิทธิ์ของรูป | 404 เมื่อไม่มี / 403 เมื่อไม่มีสิทธิ์ |
| POST | `/api/photos` | Login | `multipart/form-data` ฟิลด์ `file` + ข้อมูลรูป |
| PATCH | `/api/photos/:id` | เจ้าของ / Admin | แก้ข้อมูลรูป |
| DELETE | `/api/photos/:id` | เจ้าของ / Admin | ลบรูป + ลบไฟล์จริง |

### Albums

| Method | Path | สิทธิ์ | คำอธิบาย |
| --- | --- | --- | --- |
| GET | `/api/albums` | Login | `?scope=mine\|all` (`all` เฉพาะ Admin) |
| POST | `/api/albums` | Login | สร้าง Album |
| PATCH | `/api/albums/:id` | เจ้าของ / Admin | แก้ Album |
| DELETE | `/api/albums/:id` | เจ้าของ / Admin | ลบ Album (รูปใน Album ยังอยู่) |

### Admin (เข้าถึงได้เฉพาะ Admin — User ได้ 403)

| Method | Path | คำอธิบาย |
| --- | --- | --- |
| GET | `/api/admin/stats` | สถิติผู้ใช้ / รูป / Album / กิจกรรม |
| GET | `/api/admin/users` | `?q=&role=&status=&page=` |
| POST | `/api/admin/users` | สร้างผู้ใช้ (ส่ง role/status ได้) |
| PATCH | `/api/admin/users/:id` | เปลี่ยน `role` หรือ `status` |
| DELETE | `/api/admin/users/:id` | ลบผู้ใช้พร้อมรูปและ Album |

### ตัวอย่างเรียกใช้

```bash
# เข้าสู่ระบบแล้วเก็บ cookie
curl -c cookie.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"user1\",\"password\":\"user123\"}"

# ดูรูปที่ตัวเองมีสิทธิ์เห็น
curl -b cookie.txt "http://localhost:3000/api/photos?scope=mine"

# อัปโหลดรูป
curl -b cookie.txt -X POST http://localhost:3000/api/photos \
  -F "file=@photo.jpg" -F "title=ชื่อรูป" -F "visibility=private"
```

---

## 8. โครงสร้างฐานข้อมูล

| ตาราง | คอลัมน์สำคัญ |
| --- | --- |
| `users` | `id, username, email, password_hash, full_name, role, status, created_at` |
| `photos` | `id, owner_id, album_id, title, description, file_name, mime_type, file_size, width, height, tags, camera, visibility, created_at, updated_at` |
| `albums` | `id, user_id, name, description, created_at, updated_at` |
| `activity_logs` | `id, actor_id, action, target_type, target_id, detail, ip, created_at` |

ความสัมพันธ์: `users 1─N photos`, `users 1─N albums`, `albums 1─N photos`
ลบผู้ใช้ → รูปและ Album ของผู้ใช้นั้นถูกลบอัตโนมัติ (`ON DELETE CASCADE`)

---

## 9. การอัปโหลดไฟล์

- ใช้ `multer` เก็บลง `public/uploads/` ชื่อไฟล์สุ่ม ไม่ใช้ชื่อที่ผู้ใช้ส่งมา
- จำกัดขนาด **5 MB** ต่อไฟล์
- อนุญาตเฉพาะ `image/jpeg` `image/png` `image/gif` `image/webp`
- ตรวจ MIME จากไฟล์จริง และอ่านขนาดภาพด้วย `image-size`
- ถ้าข้อมูลไม่ผ่านการตรวจสอบ ไฟล์ที่อัปโหลดแล้วจะถูกลบทิ้งทันที
- เมื่อลบรูปจากฐานข้อมูล ไฟล์จริงใน `public/uploads` จะถูกลบตามไป

---

## 10. การตรวจสอบระบบ

หน้า **/api-demo** (ต้อง Login) รวมปุ่มเรียก API จริงของระบบไว้ให้สาธิตสิทธิ์:
ดูตัวเอง · ดูรูปของตัวเอง · แก้รูป · ลบรูปที่ไม่มีจริง (404) ·
เรียก `/api/admin/*` ซึ่ง **User จะได้ 403** โดยอัตโนมัติ

ผลตรวจอัตโนมัติล่าสุด: **ผ่าน 93 / 93 รายการ**
(ครอบคลุม Guest, User ถูกปฏิเสธสิทธิ์, บัญชีถูกระงับ, อัปโหลดผ่านทั้ง API และฟอร์ม,
ค้นหา, Album, Admin ทั้งหน้าเว็บและ API, การเปลี่ยนสิทธิ์/สถานะที่มีผลกับ session ที่ยัง Login อยู่,
การแก้ไขรูปแบบ PATCH (แก้เฉพาะฟิลด์ที่ส่งมา ไม่ทับข้อมูลเดิมทิ้ง),
**ตรวจเนื้อหาหน้าเว็บจริง** ของ `/?scope=mine` · `/my/photos` · `/?scope=public`
เพื่อยืนยันว่าตัวกรองขอบเขตกรองรูปถูกต้อง ไม่ใช่แค่ HTTP 200,
รวมถึง**โปรไฟล์** — ผู้ใช้แก้ชื่อ/เปลี่ยนรหัสผ่านของตัวเองได้ (ต้องทราบรหัสเดิม)
และ Admin แก้ชื่อผู้ใช้/รีเซ็ตรหัสผ่านผู้อื่นจาก `/admin/users` ได้ แต่แก้บัญชีตัวเองผ่านหน้านั้นไม่ได้)

---

## 11. ข้อจำกัดของงานเวอร์ชันนี้ (เหมาะกับงานส่งอาจารย์)

- Session เก็บในหน่วยความจำ (Memory Store) — รีสตาร์ทเซิร์ฟเวอร์แล้วผู้ใช้ต้อง Login ใหม่
- ไม่มีระบบลบ/ล้างข้อมูลเป็นชุด (Bulk) และยังไม่มีการย้าย/แก้ไขไฟล์รูปหลังอัปโหลด
- ไม่มีระบบรีเซ็ตรหัสผ่านและยืนยันอีเมล
- ยังไม่ได้ตั้งค่า HTTPS และ rate limit ของ session
- ป้องกัน CSRF ด้วยการตรวจ `Origin` ของคำขอที่เปลี่ยนข้อมูล (คำขอจากโดเมนอื่นถูกปฏิเสธ 403)
  ร่วมกับ cookie `httpOnly` + `sameSite=lax` — ยังไม่ได้ใช้ CSRF token แบบเต็มรูปแบบ

---

## 12. ทีมพัฒนา

- [@cchuewongdee08-dotcom](https://github.com/cchuewongdee08-dotcom)
- [@I2kI7O](https://github.com/I2kI7O)
- [@chyadakongsan](https://github.com/chyadakongsan)