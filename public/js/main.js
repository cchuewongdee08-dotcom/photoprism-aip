/* ==========================================================
   PhotoPrism - JavaScript ฝั่ง Client
   (การตรวจสิทธิ์ทั้งหมดทำที่ Server ไฟล์นี้มีไว้เพื่อ UX เท่านั้น)
   ========================================================== */

/** ยืนยันก่อนทำรายการลบ */
function confirmDelete(message) {
  return window.confirm(message || 'ยืนยันการดำเนินการนี้?');
}

/** แสดงตัวอย่างรูปก่อนอัปโหลด */
function previewImage(input) {
  const box = document.getElementById('preview');
  const img = document.getElementById('previewImg');
  if (!box || !img) return;

  const file = input.files && input.files[0];
  if (!file) {
    box.classList.add('d-none');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    img.src = event.target.result;
    box.classList.remove('d-none');
  };
  reader.readAsDataURL(file);
}

/** ยิง API จริงเพื่อสาธิตผลของการตรวจสิทธิ์ */
async function runDemoRequest(button) {
  const method = button.dataset.method;
  const path = button.dataset.path;
  const body = button.dataset.body ? JSON.parse(button.dataset.body) : null;

  const statusBadge = document.getElementById('resultStatus');
  const metaBox = document.getElementById('resultMeta');
  const bodyBox = document.getElementById('resultBody');

  statusBadge.innerHTML = '<span class="badge bg-secondary">กำลังส่งคำขอ...</span>';
  metaBox.textContent = `${method} ${path}`;
  bodyBox.textContent = '';

  const startedAt = performance.now();
  let response;
  let payload;

  try {
    response = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  } catch (error) {
    statusBadge.innerHTML = '<span class="badge bg-danger">เชื่อมต่อไม่สำเร็จ</span>';
    bodyBox.textContent = String(error);
    return;
  }

  const elapsed = Math.round(performance.now() - startedAt);

  // สีป้ายสถานะตามผลการตรวจสิทธิ์
  let style = 'bg-secondary';
  let explanation = '';
  if (response.status === 200) {
    style = 'bg-success';
    explanation = 'สำเร็จ — คำขอได้รับอนุญาต';
  } else if (response.status === 201) {
    style = 'bg-success';
    explanation = 'สร้างสำเร็จ';
  } else if (response.status === 400) {
    style = 'bg-warning text-dark';
    explanation = 'ข้อมูลไม่ถูกต้อง (Validation)';
  } else if (response.status === 401) {
    style = 'bg-secondary';
    explanation = 'ยังไม่ได้เข้าสู่ระบบ';
  } else if (response.status === 403) {
    style = 'bg-danger';
    explanation = 'ถูกปฏิเสธ — สิทธิ์ไม่เพียงพอ (Server ตรวจสิทธิ์)';
  } else if (response.status === 404) {
    style = 'bg-secondary';
    explanation = 'ไม่พบข้อมูล';
  } else if (response.status >= 500) {
    style = 'bg-danger';
    explanation = 'ระบบขัดข้อง';
  }

  statusBadge.innerHTML =
    `<span class="badge ${style}">${response.status} ${response.statusText || ''}</span>`;
  metaBox.innerHTML = `${method} ${path} · ${elapsed} ms — ${explanation}`;
  bodyBox.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);

  button.classList.remove('btn-outline-primary');
  button.classList.add('btn-secondary');
  setTimeout(() => {
    button.classList.add('btn-outline-primary');
    button.classList.remove('btn-secondary');
  }, 1200);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.btn-try').forEach((button) => {
    button.addEventListener('click', () => runDemoRequest(button));
  });

  // ปิดข้อความแจ้งเตือนอัตโนมัติ
  document.querySelectorAll('.alert-dismissible').forEach((alert) => {
    setTimeout(() => {
      const instance = bootstrap.Alert.getOrCreateInstance(alert);
      instance.close();
    }, 5000);
  });
});