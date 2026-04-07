// ══════════════════════════════════════════════════════════════
//  Merchant Control – User & Role Request System
//  app.js – Full Working Version with Firebase + Mockup Fallback
// ══════════════════════════════════════════════════════════════

import { db } from './firebase-config.js';
import {
  collection, addDoc, doc, setDoc, getDoc,
  onSnapshot, query, orderBy, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── CONSTANTS ────────────────────────────────────────────────
const ROLES = ['sales', 'manager', 'accounting', 'IT', 'Admin', 'CEO'];
const DEFAULT_MENUS = {
  'แดชบอร์ด': [],
  'ยอดรวมรายได้': [],
  'รายการสั่งซื้อและผู้ซื้อ': ['รายการสั่งซื้อทั้งหมด', 'คืนเงินหรือยกเลิกรายการ', 'อัตราแลกเปลี่ยน'],
  'จัดการข้อมูลร้านค้า': ['ตั้งค่าเบื้องต้น', 'ข้อมูลส่วนตัว', 'แก้ไขข้อมูลส่วนตัว', 'แก้ไขข้อมูลบัญชีธนาคาร'],
  'จัดการผู้ใช้งาน': ['เพิ่มผู้ใช้งาน', 'แก้ไขสิทธิ์ผู้ใช้งาน', 'ลบผู้ใช้งาน'],
  'รายงาน': ['รายงานยอดขาย', 'รายงานการเงิน', 'ส่งออกรายงาน PDF'],
  'การแจ้งเตือน': ['การแจ้งเตือนระบบ', 'การแจ้งเตือนทางอีเมล'],
};

// MOCKUP history data
const MOCKUP_HISTORY = [
  {
    id: 'mock-1', merchantId: 'M-001234', merchantName: 'ร้าน ABC Shop',
    users: [
      { username: 'somchai', email: 'somchai@abc.com', role: 'Admin',
        permissions: { 'แดชบอร์ด': { granted: true, items: [] }, 'จัดการผู้ใช้งาน': { granted: true, items: ['เพิ่มผู้ใช้งาน','แก้ไขสิทธิ์ผู้ใช้งาน'] } } },
      { username: 'suda', email: 'suda@abc.com', role: 'sales',
        permissions: { 'แดชบอร์ด': { granted: true, items: [] }, 'รายการสั่งซื้อและผู้ซื้อ': { granted: true, items: ['รายการสั่งซื้อทั้งหมด'] } } }
    ],
    status: 'pending', requestedBy: 'admin@merchant.com',
    createdAt: new Date('2026-04-07T10:30:00')
  },
  {
    id: 'mock-2', merchantId: 'M-005678', merchantName: 'ร้าน XYZ Trading',
    users: [
      { username: 'napat', email: 'napat@xyz.com', role: 'manager',
        permissions: { 'แดชบอร์ด': { granted: true, items: [] }, 'รายงาน': { granted: true, items: ['รายงานยอดขาย','รายงานการเงิน'] } } }
    ],
    status: 'approved', requestedBy: 'admin@merchant.com',
    createdAt: new Date('2026-04-06T14:00:00')
  },
  {
    id: 'mock-3', merchantId: 'M-009012', merchantName: 'ร้าน Happy Mart',
    users: [
      { username: 'wilai', email: 'wilai@happy.com', role: 'accounting',
        permissions: { 'แดชบอร์ด': { granted: true, items: [] }, 'ยอดรวมรายได้': { granted: true, items: [] } } }
    ],
    status: 'rejected', requestedBy: 'admin@merchant.com',
    createdAt: new Date('2026-04-05T09:15:00')
  }
];

// ── STATE ────────────────────────────────────────────────────
let userEntryCount = 0;
let menuStructure = { ...DEFAULT_MENUS };
let allRequests = [...MOCKUP_HISTORY];
let selectedCategoryForMenu = null;
let firebaseReady = false;

// ── DOM HELPERS ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadMenuFromFirebase();
  addUserEntry();
  initAdminPanel();
  initHistory();

  $('btn-add-user').addEventListener('click', addUserEntry);
  $('btn-reset-form').addEventListener('click', resetForm);
  $('btn-submit-form').addEventListener('click', submitForm);
});

// ── TABS ─────────────────────────────────────────────────────
const TAB_TITLES = {
  create: 'สร้างผู้ใช้งานใหม่ (Create Users)',
  history: 'ประวัติคำขอทั้งหมด',
  admin: 'จัดการเมนูและสิทธิ์ (Admin)',
};

function initTabs() {
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });
}

function switchTab(tab) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
  const section = $(`tab-${tab}`);
  if (section) section.classList.add('active');
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(b => b.classList.add('active'));
  $('topbar-title').textContent = TAB_TITLES[tab] || '';
}

// ── MENU STRUCTURE (Firebase with fallback) ──────────────────
async function loadMenuFromFirebase() {
  try {
    const docRef = doc(db, 'system_settings', 'menu_structure');
    const snap = await getDoc(docRef);
    if (snap.exists() && snap.data().menus) {
      menuStructure = snap.data().menus;
      firebaseReady = true;
      renderCategoryList();
      refreshAllPermissionTrees();
    } else {
      // Save defaults to Firebase
      await setDoc(docRef, { menus: DEFAULT_MENUS });
      firebaseReady = true;
    }

    // Real-time listener
    onSnapshot(docRef, (snap) => {
      if (snap.exists() && snap.data().menus) {
        menuStructure = snap.data().menus;
        renderCategoryList();
        refreshAllPermissionTrees();
      }
    });

    // Listen for requests
    const q = query(collection(db, 'user_requests'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => {
      const fbRequests = snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.() || new Date() };
      });
      // Merge: Firebase data first, then mockups that weren't replaced
      allRequests = fbRequests.length > 0 ? fbRequests : MOCKUP_HISTORY;
      renderHistory();
    });
  } catch (e) {
    console.warn('Firebase not available, using mockup data:', e.message);
    firebaseReady = false;
    renderCategoryList();
    renderHistory();
  }
}

async function saveMenuStructure() {
  try {
    await setDoc(doc(db, 'system_settings', 'menu_structure'), { menus: menuStructure });
  } catch (e) {
    console.warn('saveMenuStructure fallback to local:', e.message);
  }
}

// ── USER ENTRY BLOCK ─────────────────────────────────────────
function addUserEntry() {
  userEntryCount++;
  const idx = userEntryCount;
  const container = $('users-container');
  const block = document.createElement('div');
  block.className = 'user-entry-block';
  block.id = `user-entry-${idx}`;
  block.innerHTML = buildUserEntryHTML(idx);
  container.appendChild(block);

  // Role buttons
  block.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      block.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      block.querySelector('.role-hidden').value = btn.dataset.role;
    });
  });

  // Advanced toggle
  const toggle = block.querySelector('.advanced-toggle');
  const panel = block.querySelector('.advanced-panel');
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('open');
    panel.classList.toggle('open');
  });

  // Select all / clear
  block.querySelector('.perm-btn.select-all').addEventListener('click', () => {
    block.querySelectorAll('.perm-check').forEach(c => { c.checked = true; c.indeterminate = false; });
  });
  block.querySelector('.perm-btn.clear-all').addEventListener('click', () => {
    block.querySelectorAll('.perm-check').forEach(c => { c.checked = false; c.indeterminate = false; });
  });

  // Parent-child checkbox logic
  wirePermissionCheckboxes(block);

  // Remove button
  if (idx > 1) block.querySelector('.remove-entry-btn').style.display = 'block';
  block.querySelector('.remove-entry-btn')?.addEventListener('click', () => block.remove());
}

function buildUserEntryHTML(idx) {
  const roleHTML = ROLES.map(r =>
    `<button type="button" class="role-btn" data-role="${r}">${r}</button>`
  ).join('');

  const permHTML = buildPermissionTreeHTML();

  return `
    <div class="form-card-header">
      <span class="card-icon">👤</span> เพิ่มผู้ใช้งานคนที่ ${idx}
      <button class="remove-entry-btn" style="display:${idx > 1 ? 'block' : 'none'}" title="ลบ">✕</button>
    </div>
    <div class="form-card-body" style="padding:20px">
      <div class="form-grid" style="margin-bottom:16px">
        <div class="form-group">
          <label class="form-label">Username <span class="required">*</span></label>
          <input type="text" class="form-input field-username" placeholder="ระบุ Username" />
        </div>
        <div class="form-group">
          <label class="form-label">อีเมล <span class="required">*</span></label>
          <input type="email" class="form-input field-email" placeholder="email@ex.com" />
        </div>
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">บทบาท (Role)</label>
        <div class="role-grid">${roleHTML}</div>
        <input type="hidden" class="role-hidden" value="" />
      </div>
      <div class="advanced-toggle"><span>☰</span> กำหนดสิทธิ์รายเมนู (Advanced) <span class="toggle-icon" style="margin-left:auto">▲</span></div>
      <div class="advanced-panel">
        <div class="perm-toolbar">
          <button type="button" class="perm-btn select-all">เลือกทั้งหมด</button>
          <button type="button" class="perm-btn clear-all">ล้าง</button>
        </div>
        <ul class="perm-tree">${permHTML}</ul>
      </div>
    </div>
  `;
}

function buildPermissionTreeHTML() {
  return Object.entries(menuStructure).map(([cat, children]) => {
    const childrenHTML = children.map(item =>
      `<li><input type="checkbox" class="perm-check perm-child-check" data-parent="${cat}" /><label>${item}</label></li>`
    ).join('');
    return `
      <li>
        <div class="perm-parent">
          <input type="checkbox" class="perm-check perm-parent-check" data-cat="${cat}" />
          <span>${cat}</span>
        </div>
        ${children.length > 0 ? `<ul class="perm-children">${childrenHTML}</ul>` : ''}
      </li>`;
  }).join('');
}

function wirePermissionCheckboxes(block) {
  block.querySelectorAll('.perm-parent-check').forEach(parentCb => {
    parentCb.addEventListener('change', () => {
      block.querySelectorAll(`[data-parent="${parentCb.dataset.cat}"]`).forEach(c => {
        c.checked = parentCb.checked; c.indeterminate = false;
      });
    });
  });
  block.querySelectorAll('.perm-child-check').forEach(childCb => {
    childCb.addEventListener('change', () => {
      const cat = childCb.dataset.parent;
      const parentCb = block.querySelector(`.perm-parent-check[data-cat="${cat}"]`);
      if (!parentCb) return;
      const children = block.querySelectorAll(`.perm-child-check[data-parent="${cat}"]`);
      const checkedCount = [...children].filter(c => c.checked).length;
      parentCb.checked = checkedCount === children.length;
      parentCb.indeterminate = checkedCount > 0 && checkedCount < children.length;
    });
  });
}

// ── FORM SUBMIT ──────────────────────────────────────────────
async function submitForm() {
  const merchantId = $('merchant-id').value.trim();
  const merchantName = $('merchant-name').value.trim();
  const entries = document.querySelectorAll('.user-entry-block');
  if (entries.length === 0) { showToast('กรุณาเพิ่มผู้ใช้งานอย่างน้อย 1 คน', 'error'); return; }

  const usersData = [];
  let hasError = false;

  entries.forEach(block => {
    const username = block.querySelector('.field-username').value.trim();
    const email = block.querySelector('.field-email').value.trim();
    const role = block.querySelector('.role-hidden').value;
    block.querySelector('.field-username').classList.remove('error');
    block.querySelector('.field-email').classList.remove('error');
    if (!username) { block.querySelector('.field-username').classList.add('error'); hasError = true; }
    if (!email || !email.includes('@')) { block.querySelector('.field-email').classList.add('error'); hasError = true; }
    if (hasError) return;

    const permissions = {};
    block.querySelectorAll('.perm-parent-check').forEach(p => {
      const cat = p.dataset.cat;
      const childChecks = block.querySelectorAll(`.perm-child-check[data-parent="${cat}"]`);
      permissions[cat] = {
        granted: p.checked || p.indeterminate,
        items: [...childChecks].filter(c => c.checked).map(c => c.nextElementSibling?.textContent.trim()),
      };
    });
    usersData.push({ username, email, role, permissions });
  });

  if (hasError) { showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error'); return; }

  $('btn-submit-form').disabled = true;
  $('submit-text').textContent = 'กำลังบันทึก...';

  try {
    const requestData = {
      merchantId, merchantName, users: usersData,
      status: 'pending', requestedBy: 'admin@merchant.com',
      createdAt: serverTimestamp(),
    };
    await addDoc(collection(db, 'user_requests'), requestData);
    showToast(`✅ ส่งคำขอสำเร็จ! (${usersData.length} คน)`, 'success');
    resetForm();
    switchTab('history');
  } catch (e) {
    // Fallback: add to local mockup
    const localRequest = {
      id: 'local-' + Date.now(), merchantId, merchantName, users: usersData,
      status: 'pending', requestedBy: 'admin@merchant.com', createdAt: new Date(),
    };
    allRequests.unshift(localRequest);
    renderHistory();
    showToast(`✅ ส่งคำขอสำเร็จ! (${usersData.length} คน) [Local]`, 'success');
    resetForm();
    switchTab('history');
  } finally {
    $('btn-submit-form').disabled = false;
    $('submit-text').textContent = '📤 ส่งคำขอ';
  }
}

function resetForm() {
  $('merchant-id').value = '';
  $('merchant-name').value = '';
  $('users-container').innerHTML = '';
  userEntryCount = 0;
  addUserEntry();
}

// ── HISTORY ──────────────────────────────────────────────────
function initHistory() {
  renderHistory();
  $('search-input').addEventListener('input', renderHistory);
  $('filter-status').addEventListener('change', renderHistory);
}

function renderHistory() {
  const search = $('search-input').value.toLowerCase();
  const statusFilter = $('filter-status').value;

  let filtered = allRequests.filter(r => {
    const matchStatus = !statusFilter || r.status === statusFilter;
    const matchSearch = !search || [
      r.merchantId, r.merchantName, r.requestedBy,
      ...(r.users || []).map(u => u.username + ' ' + u.email)
    ].some(v => v?.toLowerCase().includes(search));
    return matchStatus && matchSearch;
  });

  const list = $('history-list');
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>ไม่พบรายการ</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(r => {
    const users = r.users || [];
    const date = r.createdAt instanceof Date
      ? r.createdAt.toLocaleString('th-TH')
      : (r.createdAt?.toDate?.()?.toLocaleString('th-TH') || '–');
    const roles = [...new Set(users.map(u => u.role).filter(Boolean))];
    const usernames = users.map(u => u.username).join(', ');

    const STATUS_LABELS = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ' };
    const STATUS_CLASSES = { pending: 'status-pending', approved: 'status-approved', rejected: 'status-rejected' };

    const adminBtns = r.status === 'pending'
      ? `<button class="btn-approve" data-action="approved" data-id="${r.id}">✅ อนุมัติ</button>
         <button class="btn-reject" data-action="rejected" data-id="${r.id}">❌ ปฏิเสธ</button>`
      : '';

    return `
      <div class="request-card">
        <div class="request-card-header">
          <div class="card-avatar">${(r.merchantId || 'M').charAt(0)}</div>
          <div class="card-meta">
            <div class="card-merchant">🏪 ${r.merchantId || '–'} · ${r.merchantName || '–'}</div>
            <div class="card-user">${usernames || '–'}</div>
            <div class="card-email">โดย ${r.requestedBy || '–'}</div>
          </div>
          <span class="status-badge ${STATUS_CLASSES[r.status] || ''}">${STATUS_LABELS[r.status] || r.status}</span>
        </div>
        <div class="card-tags">
          ${roles.map(role => `<span class="card-tag">${role}</span>`).join('')}
          <span class="card-tag" style="background:#f0fff4;color:#276749">👤 ${users.length} คน</span>
        </div>
        <div class="card-info"><span>📅 ${date}</span></div>
        ${adminBtns ? `<div class="card-actions">${adminBtns}</div>` : ''}
      </div>`;
  }).join('');

  // Action buttons
  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      // Update in Firebase
      try {
        await updateDoc(doc(db, 'user_requests', id), { status: action });
      } catch (e) {
        // Update locally
        const req = allRequests.find(r => r.id === id);
        if (req) req.status = action;
        renderHistory();
      }
      showToast(action === 'approved' ? '✅ อนุมัติแล้ว' : '❌ ปฏิเสธแล้ว', action === 'approved' ? 'success' : 'error');
    });
  });
}

// ── ADMIN PANEL ──────────────────────────────────────────────
function initAdminPanel() {
  // Add category
  $('btn-add-category').addEventListener('click', () => {
    const el = $('inline-add-category');
    el.style.display = el.style.display === 'none' ? 'flex' : 'none';
    $('new-category-name').focus();
  });

  $('confirm-add-category').addEventListener('click', async () => {
    const name = $('new-category-name').value.trim();
    if (!name) return;
    if (menuStructure[name]) { showToast('หมวดหมู่นี้มีอยู่แล้ว', 'error'); return; }
    menuStructure[name] = [];
    await saveMenuStructure();
    $('new-category-name').value = '';
    $('inline-add-category').style.display = 'none';
    renderCategoryList();
    showToast('เพิ่มหมวดหมู่สำเร็จ', 'success');
    refreshAllPermissionTrees();
  });

  // Add menu item
  $('btn-add-menu-item').addEventListener('click', () => {
    if (!selectedCategoryForMenu) { showToast('กรุณาเลือกหมวดหมู่ก่อน', 'error'); return; }
    const el = $('inline-add-menu');
    el.style.display = el.style.display === 'none' ? 'flex' : 'none';
    $('new-menu-item-name').focus();
  });

  $('confirm-add-menu-item').addEventListener('click', async () => {
    if (!selectedCategoryForMenu) return;
    const name = $('new-menu-item-name').value.trim();
    if (!name) return;
    if (!menuStructure[selectedCategoryForMenu]) menuStructure[selectedCategoryForMenu] = [];
    menuStructure[selectedCategoryForMenu].push(name);
    await saveMenuStructure();
    $('new-menu-item-name').value = '';
    $('inline-add-menu').style.display = 'none';
    renderMenuItems(selectedCategoryForMenu);
    showToast('เพิ่มรายการสำเร็จ', 'success');
    refreshAllPermissionTrees();
  });

  // Render initial
  renderCategoryList();
}

function renderCategoryList() {
  const list = $('category-list');
  if (!list) return;
  const cats = Object.keys(menuStructure);
  list.innerHTML = cats.map(cat => `
    <li class="menu-item-row" style="cursor:pointer" data-cat="${cat}">
      <span class="menu-item-label">📂 ${cat}</span>
      <button class="menu-item-delete" data-cat="${cat}" title="ลบ">✕</button>
    </li>
  `).join('');

  // Click to select
  list.querySelectorAll('li.menu-item-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('menu-item-delete')) return;
      list.querySelectorAll('li').forEach(li => li.style.background = '');
      row.style.background = '#f0f4ff';
      selectedCategoryForMenu = row.dataset.cat;
      renderMenuItems(row.dataset.cat);
    });
  });

  // Delete
  list.querySelectorAll('.menu-item-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      delete menuStructure[btn.dataset.cat];
      await saveMenuStructure();
      renderCategoryList();
      $('menu-items-list').innerHTML = '';
      selectedCategoryForMenu = null;
      showToast('ลบหมวดหมู่สำเร็จ', 'success');
      refreshAllPermissionTrees();
    });
  });
}

function renderMenuItems(cat) {
  const items = menuStructure[cat] || [];
  const list = $('menu-items-list');
  list.innerHTML = `<div class="menu-cat-header">📂 ${cat}</div>` +
    items.map((item, i) => `
      <li class="menu-item-row">
        <span class="menu-item-label">📄 ${item}</span>
        <button class="menu-item-delete" data-cat="${cat}" data-idx="${i}" title="ลบ">✕</button>
      </li>
    `).join('');

  list.querySelectorAll('.menu-item-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      menuStructure[btn.dataset.cat].splice(parseInt(btn.dataset.idx), 1);
      await saveMenuStructure();
      renderMenuItems(btn.dataset.cat);
      showToast('ลบรายการสำเร็จ', 'success');
      refreshAllPermissionTrees();
    });
  });
}

function refreshAllPermissionTrees() {
  document.querySelectorAll('.user-entry-block').forEach(block => {
    const panel = block.querySelector('.advanced-panel');
    if (!panel) return;
    panel.querySelector('.perm-tree').innerHTML = buildPermissionTreeHTML();
    wirePermissionCheckboxes(block);
  });
}

// ── TOAST ──────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-msg">${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}
