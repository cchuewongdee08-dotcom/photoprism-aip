-- ============================================================
-- PhotoPrism : Database Schema (SQLite)
-- สร้างตารางอัตโนมัติเมื่อรันโปรแกรมครั้งแรก
-- ============================================================

-- ------------------------------------------------------------
-- ตารางผู้ใช้ (ทั้ง User และ Admin ใช้ตารางเดียวกัน แยกกันด้วยคอลัมน์ role)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,              -- เก็บเป็น bcrypt hash เท่านั้น ห้ามเก็บรหัสจริง
  full_name     TEXT    NOT NULL DEFAULT '',
  avatar        TEXT    NOT NULL DEFAULT '',   -- ชื่อไฟล์รูปโปรไฟล์ใน public/uploads (ว่าง = ใช้ไอคอนเริ่มต้น)
  role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ------------------------------------------------------------
-- ตาราง Album (1 User มีหลาย Album)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS albums (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- ตารางรูปภาพ
-- owner_id = เจ้าของรูป (ผู้อัปโหลด)  ใช้ตรวจสิทธิ์แก้ไข/ลบ
-- visibility: public = ทุกคน (รวมคนที่ยังไม่ Login) เห็น
--             private = เฉพาะเจ้าของ และ Admin เท่านั้น
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      INTEGER NOT NULL,
  album_id      INTEGER,
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  tags          TEXT    NOT NULL DEFAULT '',
  camera        TEXT    NOT NULL DEFAULT '',
  file_name     TEXT    NOT NULL,              -- ชื่อไฟล์จริงที่บันทึกใน public/uploads
  original_name TEXT    NOT NULL DEFAULT '',   -- ชื่อไฟล์ที่ผู้ใช้อัปโหลด
  mime_type     TEXT    NOT NULL DEFAULT '',
  file_size     INTEGER NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  visibility    TEXT    NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (album_id) REFERENCES albums (id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- ตารางบันทึกการกระทำ (Admin ใช้ดูในหน้า Activity Log)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  username   TEXT    NOT NULL DEFAULT '-',
  action     TEXT    NOT NULL,
  target     TEXT    NOT NULL DEFAULT '-',
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ------------------------------------------------------------
-- Index ช่วยให้ Search และเรียงลำดับเร็วขึ้น
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_photos_owner     ON photos (owner_id);
CREATE INDEX IF NOT EXISTS idx_photos_album     ON photos (album_id);
CREATE INDEX IF NOT EXISTS idx_photos_visibility ON photos (visibility);
CREATE INDEX IF NOT EXISTS idx_photos_created   ON photos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_title     ON photos (title);
CREATE INDEX IF NOT EXISTS idx_albums_user      ON albums (user_id);
CREATE INDEX IF NOT EXISTS idx_logs_created     ON activity_logs (created_at DESC);