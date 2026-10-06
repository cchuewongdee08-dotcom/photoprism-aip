'use strict';

/**
 * ตรวจความถูกต้องของข้อมูลที่ส่งเข้ามา (ทำที่ฝั่ง Server เสมอ)
 * ไม่ว่าจะมาจากฟอร์ม HTML หรือ REST API
 * คืนค่า { isValid, errors, values }
 */

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = ['user', 'admin'];
const STATUSES = ['active', 'suspended'];
const VISIBILITIES = ['public', 'private'];
const ALLOWED_TAGS = /^[A-Za-z0-9฀-๿ ,#_-]*$/u;

function str(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function validateLogin(body = {}) {
  const values = { username: str(body.username), password: str(body.password) };
  const errors = {};

  if (!values.username) errors.username = 'กรุณากรอกชื่อผู้ใช้';
  if (!values.password) errors.password = 'กรุณากรอกรหัสผ่าน';

  return { isValid: Object.keys(errors).length === 0, errors, values };
}

function validateRegister(body = {}) {
  const values = {
    username: str(body.username),
    email: str(body.email).toLowerCase(),
    password: str(body.password),
    confirmPassword: str(body.confirmPassword),
    fullName: str(body.fullName),
  };
  const errors = {};

  if (!values.username) {
    errors.username = 'กรุณากรอกชื่อผู้ใช้';
  } else if (!USERNAME_RE.test(values.username)) {
    errors.username = 'ชื่อผู้ใช้ต้องเป็น A-Z, a-z, 0-9 หรือ _ ความยาว 3-20 ตัว';
  }

  if (!values.email) {
    errors.email = 'กรุณากรอกอีเมล';
  } else if (!EMAIL_RE.test(values.email)) {
    errors.email = 'รูปแบบอีเมลไม่ถูกต้อง เช่น name@example.com';
  }

  if (!values.password) {
    errors.password = 'กรุณากรอกรหัสผ่าน';
  } else if (values.password.length < 6) {
    errors.password = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  } else if (values.password.length > 72) {
    errors.password = 'รหัสผ่านยาวเกิน 72 ตัวอักษร';
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = 'กรุณายืนยันรหัสผ่าน';
  } else if (values.password && values.confirmPassword !== values.password) {
    errors.confirmPassword = 'รหัสผ่านทั้งสองไม่ตรงกัน';
  }

  if (values.fullName.length > 100) {
    errors.fullName = 'ชื่อ-นามสกุลยาวเกิน 100 ตัวอักษร';
  }

  return { isValid: Object.keys(errors).length === 0, errors, values };
}

function validateUserCreate(body = {}) {
  const base = validateRegister({
    username: body.username,
    email: body.email,
    password: body.password,
    confirmPassword: body.password,
    fullName: body.fullName,
  });

  const role = str(body.role) || 'user';
  const status = str(body.status) || 'active';
  const errors = { ...base.errors };

  if (!ROLES.includes(role)) errors.role = 'สิทธิ์ต้องเป็น user หรือ admin';
  if (!STATUSES.includes(status)) errors.status = 'สถานะต้องเป็น active หรือ suspended';

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    values: { ...base.values, role, status },
  };
}

function validateRole(body = {}) {
  const role = str(body.role);
  const errors = {};
  if (!ROLES.includes(role)) errors.role = 'สิทธิ์ต้องเป็น user หรือ admin';
  return { isValid: Object.keys(errors).length === 0, errors, values: { role } };
}

function validateStatus(body = {}) {
  const status = str(body.status);
  const errors = {};
  if (!STATUSES.includes(status)) errors.status = 'สถานะต้องเป็น active หรือ suspended';
  return { isValid: Object.keys(errors).length === 0, errors, values: { status } };
}

function validateAlbum(body = {}) {
  const values = { name: str(body.name), description: str(body.description) };
  const errors = {};

  if (!values.name) errors.name = 'กรุณากรอกชื่อ Album';
  else if (values.name.length > 80) errors.name = 'ชื่อ Album ยาวเกิน 80 ตัวอักษร';
  if (values.description.length > 300) errors.description = 'คำอธิบายยาวเกิน 300 ตัวอักษร';

  return { isValid: Object.keys(errors).length === 0, errors, values };
}

function validatePhoto(body = {}, { requireFile = true, file = null } = {}) {
  const values = {
    title: str(body.title),
    description: str(body.description),
    tags: str(body.tags),
    camera: str(body.camera),
    visibility: str(body.visibility) || 'public',
    albumId: toInt(body.albumId),
  };
  const errors = {};

  if (!values.title) errors.title = 'กรุณากรอกชื่อรูป';
  else if (values.title.length > 120) errors.title = 'ชื่อรูปยาวเกิน 120 ตัวอักษร';
  if (values.description.length > 500) errors.description = 'คำอธิบายยาวเกิน 500 ตัวอักษร';
  if (values.tags && !ALLOWED_TAGS.test(values.tags)) {
    errors.tags = 'แท็กต้องเป็นตัวอักษร ตัวเลข หรือ # , เท่านั้น';
  }
  if (values.camera.length > 80) errors.camera = 'ชื่อกล้องยาวเกิน 80 ตัวอักษร';
  if (!VISIBILITIES.includes(values.visibility)) {
    errors.visibility = 'สิทธิ์การมองเห็นต้องเป็น public หรือ private';
  }
  if (values.albumId !== null && values.albumId <= 0) {
    errors.albumId = 'Album ไม่ถูกต้อง';
  }
  if (requireFile && !file) {
    // multer แยกไฟล์ไว้ที่ req.file (ไม่ได้อยู่ใน req.body)
    errors.file = 'กรุณาเลือกไฟล์รูปภาพ';
  }

  return { isValid: Object.keys(errors).length === 0, errors, values };
}

/**
 * ตรวจข้อมูลสำหรับการแก้ไขบางส่วน (PATCH ผ่าน API)
 * คืนเฉพาะ field ที่ "ส่งมา" เพื่อไม่ให้ field ที่ไม่ได้ส่งถูกลบทิ้ง
 */
function validatePhotoPatch(body = {}) {
  const values = {};
  const errors = {};

  if (body.title !== undefined) {
    values.title = str(body.title);
    if (!values.title) errors.title = 'กรุณากรอกชื่อรูป';
    else if (values.title.length > 120) errors.title = 'ชื่อรูปยาวเกิน 120 ตัวอักษร';
  }

  if (body.description !== undefined) {
    values.description = str(body.description);
    if (values.description.length > 500) errors.description = 'คำอธิบายยาวเกิน 500 ตัวอักษร';
  }

  if (body.tags !== undefined) {
    values.tags = str(body.tags);
    if (values.tags && !ALLOWED_TAGS.test(values.tags)) {
      errors.tags = 'แท็กต้องเป็นตัวอักษร ตัวเลข หรือ # , เท่านั้น';
    }
  }

  if (body.camera !== undefined) {
    values.camera = str(body.camera);
    if (values.camera.length > 80) errors.camera = 'ชื่อกล้องยาวเกิน 80 ตัวอักษร';
  }

  if (body.visibility !== undefined) {
    values.visibility = str(body.visibility);
    if (!VISIBILITIES.includes(values.visibility)) {
      errors.visibility = 'สิทธิ์การมองเห็นต้องเป็น public หรือ private';
    }
  }

  if (body.albumId !== undefined) {
    values.albumId = toInt(body.albumId);
    if (values.albumId !== null && values.albumId <= 0) errors.albumId = 'Album ไม่ถูกต้อง';
  }

  if (Object.keys(values).length === 0) {
    errors.form = 'ไม่ได้ระบุข้อมูลที่ต้องการแก้ไข';
  }

  return { isValid: Object.keys(errors).length === 0, errors, values };
}

/** แปลงคำค้นหาเป็นตัวเล็ก และตัดอักขระพิเศษที่ใช้ค้นใน SQL ไม่ได้ */
function normalizeKeyword(raw) {
  const value = str(raw).slice(0, 80).replace(/[%_]/g, ' ').trim();
  return value;
}

module.exports = {
  ROLES,
  STATUSES,
  VISIBILITIES,
  str,
  toInt,
  normalizeKeyword,
  validateLogin,
  validateRegister,
  validateUserCreate,
  validateRole,
  validateStatus,
  validateAlbum,
  validatePhoto,
  validatePhotoPatch,
};