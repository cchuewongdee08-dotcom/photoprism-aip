'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const createMemoryStore = require('memorystore');

const config = require('./config');
const { attachUser, requireSameOrigin } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { ensureUploadsDir } = require('./utils/storage');

const authRoutes = require('./routes/authRoutes');
const pageRoutes = require('./routes/pageRoutes');
const adminRoutes = require('./routes/adminRoutes');
const apiRoutes = require('./routes/apiRoutes');
const apiV1Routes = require('./routes/apiV1Routes');

function createApp() {
  const app = express();

  ensureUploadsDir();

  // ---------- View engine ----------
  app.set('view engine', 'ejs');
  app.set('views', config.paths.views);

  // ---------- Parsers ----------
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));

  // ---------- Static files ----------
  app.use(express.static(config.paths.public, { maxAge: '1h' }));

  // ---------- Session ----------
  const MemoryStore = createMemoryStore(session);
  app.use(
    session({
      name: 'photoprism.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: config.sessionMaxAgeMs,
        secure: false,
      },
    })
  );

  // ---------- ผูกข้อมูลผู้ใช้ + ตัวแปรที่ทุกหน้าใช้ ----------
  app.use(attachUser);

  app.use((req, res, next) => {
    res.locals.appName = config.appName;
    res.locals.currentPath = req.path;
    res.locals.query = req.query;

    // ข้อความแจ้งเตือนแบบครั้งเดียว (Flash Message)
    res.locals.flash = req.session.flash || null;
    if (req.session.flash) delete req.session.flash;

    next();
  });

  // ---------- ป้องกัน CSRF (ตรวจ Origin ของคำขอที่เปลี่ยนข้อมูล) ----------
  app.use(requireSameOrigin);

  // ---------- Routes ----------
  app.use('/', pageRoutes);
  app.use('/', authRoutes);
  app.use('/admin', adminRoutes);
  app.use('/api', apiRoutes);

  // REST API v1 (สำหรับ REST Client / curl)
  //   /api/v1/session        -> login / current session / logout
  //   /api/v1/photos, /api/v1/albums -> ใช้ handler ชุดเดียวกับ /api (ไม่เขียนซ้ำ)
  app.use('/api/v1', apiV1Routes);
  app.use('/api/v1', apiRoutes);

  // ---------- 404 / Error ----------
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };