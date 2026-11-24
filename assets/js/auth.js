// Jika sudah dalam sesi aktif, langsung arahkan ke papan tugas
if (localStorage.getItem('kk_user')) {
  window.location.href = 'board.html';
}

// Otomatis buka tab "Buat Ruang" jika diklik dari tombol Buat Ruang di Landing Page
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('tab') === 'create') {
  switchAuthTab('create');
}

function switchAuthTab(tab) {
  const joinForm = document.getElementById('join-form');
  const createForm = document.getElementById('create-form');
  const btnJoin = document.getElementById('tab-btn-join');
  const btnCreate = document.getElementById('tab-btn-create');

  if (tab === 'join') {
    joinForm.classList.remove('hidden');
    createForm.classList.add('hidden');
    btnJoin.className = 'py-2.5 px-3 rounded-xl text-xs font-bold bg-white text-zinc-950 shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5';
    btnCreate.className = 'py-2.5 px-3 rounded-xl text-xs font-bold text-zinc-500 hover:text-zinc-800 transition cursor-pointer flex items-center justify-center gap-1.5';
  } else {
    joinForm.classList.add('hidden');
    createForm.classList.remove('hidden');
    btnCreate.className = 'py-2.5 px-3 rounded-xl text-xs font-bold bg-white text-zinc-950 shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5';
    btnJoin.className = 'py-2.5 px-3 rounded-xl text-xs font-bold text-zinc-500 hover:text-zinc-800 transition cursor-pointer flex items-center justify-center gap-1.5';
    if (!document.getElementById('create-code').value) generateRandomCode();
  }
  lucide.createIcons();
}

function fillDemoCode() {
  document.getElementById('join-code').value = 'T3D-DEMO';
  showToast('Kode demo T3D-DEMO siap digunakan');
}

function generateRandomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KK-';
  for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  document.getElementById('create-code').value = code;
}

// =========================================================
// MANAJEMEN RIWAYAT RUANG (RECENT WORKSPACES)
// =========================================================
function saveWorkspaceHistory(entry) {
  let history = JSON.parse(localStorage.getItem('kk_history')) || [];
  // Hapus duplikat kode yang sama agar versi terbaru naik ke urutan teratas
  history = history.filter(item => item.code !== entry.code);
  history.unshift(entry);
  // Batasi maksimal 5 ruang terakhir agar tampilan tetap ringkas
  localStorage.setItem('kk_history', JSON.stringify(history.slice(0, 5)));
}

function renderRecentWorkspaces() {
  const box = document.getElementById('recent-workspaces-box');
  const list = document.getElementById('recent-workspaces-list');
  if (!box || !list) return;

  const history = JSON.parse(localStorage.getItem('kk_history')) || [];
  if (history.length === 0) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  list.innerHTML = history.map(item => `
    <div onclick="quickEnterWorkspace('${item.code}')"
      class="group flex items-center justify-between p-3 bg-white hover:bg-indigo-50/50 border border-zinc-200/90 hover:border-indigo-300 rounded-2xl shadow-2xs transition cursor-pointer">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-xl bg-zinc-900 group-hover:bg-indigo-600 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0 transition">
          ${item.wsName.slice(0, 2).toUpperCase()}
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="text-xs font-extrabold text-zinc-950 truncate">${item.wsName}</p>
            <span class="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 group-hover:bg-indigo-100 group-hover:text-indigo-700 shrink-0">
              ${item.code}
            </span>
          </div>
          <p class="text-[11px] text-zinc-500 truncate mt-0.5">
            ${item.name} • ${item.role === 'leader' ? 'Ketua/Koor' : 'Anggota'}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0 pl-2">
        <button type="button" onclick="removeHistory(event, '${item.code}')" title="Hapus dari riwayat"
          class="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
        <i data-lucide="chevron-right" class="w-4 h-4 text-zinc-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition"></i>
      </div>
    </div>
  `).join('');

  // Otomatis isi biodata terakhir ke form bawah agar user tidak perlu mengetik ulang saat gabung ruang baru
  const latest = history[0];
  if (latest) {
    if (!document.getElementById('join-name').value) document.getElementById('join-name').value = latest.name;
    if (!document.getElementById('join-wa').value) document.getElementById('join-wa').value = latest.wa;
    if (!document.getElementById('create-name').value) document.getElementById('create-name').value = latest.name;
    if (!document.getElementById('create-wa').value) document.getElementById('create-wa').value = latest.wa;
  }

  lucide.createIcons();
}

async function quickEnterWorkspace(code) {
  const history = JSON.parse(localStorage.getItem('kk_history')) || [];
  const item = history.find(h => h.code === code);
  if (!item) return;

  showToast(`Membuka ${item.wsName}...`);
  const { data: ws } = await db.from('workspaces').select('*').eq('code', code).single();
  if (!ws) {
    removeHistory(null, code);
    return showToast(`Ruang "${code}" sudah tidak tersedia.`, 'error');
  }

  saveWorkspaceHistory({ ...item, wsName: ws.name });
  localStorage.setItem('kk_user', JSON.stringify({
    name: item.name,
    wa: item.wa,
    role: item.role,
    code: item.code
  }));
  window.location.href = 'board.html';
}

function removeHistory(event, code) {
  if (event) event.stopPropagation();
  let history = JSON.parse(localStorage.getItem('kk_history')) || [];
  history = history.filter(item => item.code !== code);
  localStorage.setItem('kk_history', JSON.stringify(history));
  renderRecentWorkspaces();
  showToast('Ruang dihapus dari daftar cepat');
}

// =========================================================
// FORM SUBMIT HANDLERS
// =========================================================
document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const name = document.getElementById('join-name').value.trim();
  const wa = document.getElementById('join-wa').value.trim();
  const role = document.getElementById('join-role').value;

  const btn = document.getElementById('btn-join-submit');
  btn.disabled = true;

  const { data: ws } = await db.from('workspaces').select('*').eq('code', code).single();
  btn.disabled = false;

  if (!ws) {
    return showToast(`Kode "${code}" tidak ditemukan! Cek lagi atau buat ruang baru.`, 'error');
  }

  saveWorkspaceHistory({ code, wsName: ws.name, name, wa, role });
  localStorage.setItem('kk_user', JSON.stringify({ name, wa, role, code }));
  window.location.href = 'board.html';
});

document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const wsName = document.getElementById('create-ws-name').value.trim();
  const wsType = document.getElementById('create-ws-type').value;
  const code = document.getElementById('create-code').value.trim().toUpperCase();
  const name = document.getElementById('create-name').value.trim();
  const wa = document.getElementById('create-wa').value.trim();

  const btn = document.getElementById('btn-create-submit');
  btn.disabled = true;

  const { data: existing } = await db.from('workspaces').select('code').eq('code', code).single();
  if (existing) {
    btn.disabled = false;
    return showToast(`Kode "${code}" sudah dipakai. Klik Acak Kode!`, 'error');
  }

  const { error } = await db.from('workspaces')
    .insert([{ code, name: wsName, type: wsType, plan: 'free' }]);
  btn.disabled = false;

  if (error) {
    return showToast('Gagal membuat ruang: ' + error.message, 'error');
  }

  saveWorkspaceHistory({ code, wsName, name, wa, role: 'leader' });
  localStorage.setItem('kk_user', JSON.stringify({ name, wa, role: 'leader', code }));
  window.location.href = 'board.html';
});

renderRecentWorkspaces();
lucide.createIcons();