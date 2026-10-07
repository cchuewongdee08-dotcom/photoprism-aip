'use strict';

const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

const config = {
  appName: 'PhotoPrism',
  port: Number(process.env.PORT) || 3000,

  // Session
  sessionSecret: process.env.SESSION_SECRET || 'photoprism-secret-2026',
  sessionMaxAgeMs: 2 * 60 * 60 * 1000, // 2 ชั่วโมง

  // Paths
  paths: {
    root: ROOT_DIR,
    data: path.join(ROOT_DIR, 'data'),
    uploads: path.join(ROOT_DIR, 'public', 'uploads'),
    views: path.join(ROOT_DIR, 'views'),
    public: path.join(ROOT_DIR, 'public'),
  },

  dbFile: path.join(ROOT_DIR, 'data', 'photoprism.db'),
  schemaFile: path.join(ROOT_DIR, 'src', 'db', 'schema.sql'),

  upload: {
    maxFileSizeBytes: 5 * 1024 * 1024, // 5 MB
    // อนุญาตเฉพาะไฟล์รูปภาพ
    allowedMimeTypes: {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
    },
  },

  pagination: {
    photosPerPage: 9,
    usersPerPage: 10,
    logsPerPage: 15,
  },
};

module.exports = config;