'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const config = require('../config');

let db = null;

/**
 * เปิดการเชื่อมต่อ SQLite (เปิดครั้งเดียว แล้วใช้ซ้ำทั้งโปรแกรม)
 * - สร้างโฟลเดอร์ data/ และ public/uploads/ ถ้ายังไม่มี
 * - รัน schema.sql เพื่อสร้างตาราง (CREATE TABLE IF NOT EXISTS จึงปลอดภัย)
 */
function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  fs.mkdirSync(config.paths.uploads, { recursive: true });

  db = new DatabaseSync(config.dbFile);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  const schema = fs.readFileSync(config.schemaFile, 'utf8');
  db.exec(schema);

  // Migration เล็ก ๆ สำหรับฐานข้อมูลเดิม : เพิ่มคอลัมน์ใหม่ถ้ายังไม่มี (ไม่ลบข้อมูลเก่า)
  ensureColumn('users', 'avatar', "TEXT NOT NULL DEFAULT ''");

  return db;
}

/** เพิ่มคอลัมน์ให้ตาราง ถ้ายังไม่มี (SQLite ไม่รองรับ ADD COLUMN IF NOT EXISTS จึงต้องเช็คก่อน) */
function ensureColumn(table, column, definition) {
  const columns = getDb().prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((col) => col.name === column)) {
    getDb().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/** คำสั่งแบบไม่คืนค่า (INSERT / UPDATE / DELETE) */
function run(sql, params = {}) {
  return getDb().prepare(sql).run(params);
}

/** คำสั่งที่คืนแถวเดียว */
function get(sql, params = {}) {
  const row = getDb().prepare(sql).get(params);
  return row ? { ...row } : undefined;
}

/** คำสั่งที่คืนหลายแถว */
function all(sql, params = {}) {
  return getDb()
    .prepare(sql)
    .all(params)
    .map((row) => ({ ...row }));
}

/** ครอบการทำงานหลายคำสั่งไว้ใน Transaction (สำเร็จทั้งหมด หรือย้อนกลับทั้งหมด) */
function transaction(fn) {
  const handle = getDb();
  handle.exec('BEGIN');
  try {
    const result = fn();
    handle.exec('COMMIT');
    return result;
  } catch (error) {
    handle.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { getDb, run, get, all, transaction };