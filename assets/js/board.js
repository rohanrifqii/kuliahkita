const currentUser = JSON.parse(localStorage.getItem('kk_user'));
if (!currentUser) {
  window.location.href = 'auth.html';
}

let currentWorkspace = null;
let allTasks = [];
let currentFilter = 'all';

function copyWorkspaceCode() {
  if (!currentWorkspace) return;
  navigator.clipboard.writeText(currentWorkspace.code);
  showToast(`Kode ${currentWorkspace.code} disalin! Bagikan ke anggota atau bot WA.`, 'success');
}

function setQuickDeadline(daysToAdd) {
  const d = new Date();
  d.setDate(d.getDate() + daysToAdd);
  d.setHours(23, 59, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  document.getElementById('task-deadline').value = formatted;
}

async function initApp() {
  const { data: ws } = await db.from('workspaces').select('*').eq('code', currentUser.code).single();
  if (!ws) return logout();
  currentWorkspace = ws;

  document.getElementById('display-ws-name').textContent = ws.name;
  document.getElementById('display-ws-code').textContent = ws.code;
  document.getElementById('inline-ws-code').textContent = ws.code;
  document.getElementById('display-user-info').textContent = `${currentUser.name} (${currentUser.role === 'leader' ? 'Ketua/Koor' : 'Anggota'})`;

  const badge = document.getElementById('display-plan-badge');
  const btnUp = document.getElementById('btn-upgrade');
  if (ws.plan === 'pro') {
    badge.textContent = 'PATUNGAN PRO ✨';
    badge.className = 'text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-lime-300 text-zinc-950';
    btnUp.classList.add('hidden');
  } else {
    badge.textContent = 'GRATIS';
    badge.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-200 text-zinc-700';
    btnUp.classList.remove('hidden');
  }

  document.getElementById('task-assignee').value = currentUser.name;
  setQuickDeadline(1);
  loadTasks();
}

document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('task-title').value.trim();
  const assignee_name = document.getElementById('task-assignee').value.trim();
  const deadlineRaw = document.getElementById('task-deadline').value;

  const { error } = await db.from('tasks').insert([{
    workspace_code: currentUser.code,
    title,
    assignee_name,
    assignee_wa: currentUser.wa,
    deadline: new Date(deadlineRaw).toISOString(),
    status: 'todo'
  }]);

  if (error) return showToast('Gagal menyimpan tugas: ' + error.message, 'error');
  document.getElementById('task-title').value = '';
  showToast('Tugas ditambahkan ke papan!', 'success');
  loadTasks();
});

function setFilter(mode) {
  currentFilter = mode;
  const btnAll = document.getElementById('filter-all');
  const btnMine = document.getElementById('filter-mine');
  if (mode === 'all') {
    btnAll.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-white text-zinc-950 transition cursor-pointer';
    btnMine.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition cursor-pointer';
  } else {
    btnMine.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-white text-zinc-950 transition cursor-pointer';
    btnAll.className = 'flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition cursor-pointer';
  }
  renderBoard();
}

async function loadTasks() {
  const { data: tasks } = await db.from('tasks')
    .select('*')
    .eq('workspace_code', currentUser.code)
    .order('deadline', { ascending: true });

  allTasks = tasks || [];
  renderBoard();
}

function renderBoard() {
  const filtered = currentFilter === 'mine'
    ? allTasks.filter(t => t.assignee_name.toLowerCase() === currentUser.name.toLowerCase())
    : allTasks;

  const total = filtered.length;
  const doneCount = filtered.filter(t => t.status === 'done').length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  document.getElementById('progress-percent').textContent = `${pct}%`;
  document.getElementById('progress-bar').style.width = `${pct}%`;
  document.getElementById('progress-detail').textContent = `${doneCount} dari ${total} tugas selesai`;

  const cols = { todo: [], in_progress: [], review: [], done: [] };
  filtered.forEach(t => { if (cols[t.status]) cols[t.status].push(t); });

  Object.keys(cols).forEach(status => {
    document.getElementById(`count-${status}`).textContent = cols[status].length;
    const container = document.getElementById(`col-${status}`);
    if (cols[status].length === 0) {
      container.innerHTML = `
        <div class="border border-dashed border-zinc-300/80 rounded-xl p-6 text-center text-xs text-zinc-400">
          Belum ada tugas di tahap ini
        </div>`;
    } else {
      container.innerHTML = cols[status].map(t => renderCard(t)).join('');
    }
  });

  lucide.createIcons();
}

function getAvatarColor(name) {
  const colors = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function renderCard(t) {
  const dlDate = new Date(t.deadline);
  const now = new Date();
  const diffHours = (dlDate - now) / (1000 * 60 * 60);
  const dlText = dlDate.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  let dlStyle = 'bg-zinc-100 text-zinc-600';
  if (t.status !== 'done') {
    if (diffHours < 0) dlStyle = 'bg-red-100 text-red-700 font-bold';
    else if (diffHours <= 24) dlStyle = 'bg-amber-100 text-amber-800 font-bold';
  }

  const initials = t.assignee_name.slice(0, 2).toUpperCase();
  const avatarColor = getAvatarColor(t.assignee_name);

  let actionBtn = '';
  if (t.status === 'todo') {
    actionBtn = `
      <button onclick="updateStatus('${t.id}', 'in_progress')"
        class="w-full mt-3 bg-zinc-900 hover:bg-indigo-600 text-white text-xs font-bold py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer">
        <span>Kerjakan Sekarang</span>
        <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
      </button>`;
  } else if (t.status === 'in_progress') {
    actionBtn = `
      <button onclick="openProofModal('${t.id}')"
        class="w-full mt-3 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer">
        <i data-lucide="upload" class="w-3.5 h-3.5"></i>
        <span>Lampirkan Bukti & ACC</span>
      </button>`;
  } else if (t.status === 'review') {
    const linkHtml = t.proof_link ? `
      <a href="${t.proof_link}" target="_blank"
        class="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2.5 py-1.5 rounded-lg w-full truncate">
        <i data-lucide="external-link" class="w-3.5 h-3.5 shrink-0"></i>
        <span class="truncate">Buka Tautan Bukti</span>
      </a>` : '';

    if (currentUser.role === 'leader') {
      actionBtn = `${linkHtml}
        <div class="grid grid-cols-2 gap-2 mt-2.5">
          <button onclick="updateStatus('${t.id}', 'done')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-xl transition cursor-pointer">ACC ✓</button>
          <button onclick="updateStatus('${t.id}', 'in_progress')" class="bg-zinc-100 hover:bg-red-100 text-zinc-700 hover:text-red-700 text-xs font-bold py-2 rounded-xl transition cursor-pointer">Revisi</button>
        </div>`;
    } else {
      actionBtn = `${linkHtml}
        <div class="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-100/60 px-2.5 py-1.5 rounded-lg">
          <i data-lucide="clock" class="w-3.5 h-3.5"></i>
          <span>Menunggu ACC Ketua</span>
        </div>`;
    }
  } else if (t.status === 'done') {
    actionBtn = t.proof_link ? `
      <a href="${t.proof_link}" target="_blank"
        class="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2.5 py-1.5 rounded-lg w-full truncate">
        <i data-lucide="check-circle" class="w-3.5 h-3.5 shrink-0"></i>
        <span class="truncate">Bukti Terverifikasi</span>
      </a>` : '';
  }

  return `
    <div class="bg-white p-4 rounded-2xl border border-zinc-200/90 tactile-card group relative">
      <div class="flex items-start justify-between gap-2">
        <p class="font-bold text-sm text-zinc-900 leading-snug">${t.title}</p>
        <button onclick="deleteTask('${t.id}')" title="Hapus tugas"
          class="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition p-0.5 cursor-pointer">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
      <div class="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-zinc-100">
        <div class="flex items-center gap-1.5">
          <span class="w-6 h-6 rounded-full ${avatarColor} text-[10px] font-extrabold flex items-center justify-center">${initials}</span>
          <span class="text-xs font-semibold text-zinc-700 truncate max-w-[95px]">${t.assignee_name}</span>
        </div>
        <span class="font-mono text-[10px] px-2 py-0.5 rounded-md ${dlStyle} flex items-center gap-1">
          <i data-lucide="calendar-clock" class="w-3 h-3"></i>
          ${dlText}
        </span>
      </div>
      ${actionBtn}
    </div>
  `;
}

async function updateStatus(id, status) {
  await db.from('tasks').update({ status }).eq('id', id);
  showToast('Status tugas diperbarui');
  loadTasks();
}

async function deleteTask(id) {
  if (!confirm('Hapus kartu tugas ini?')) return;
  await db.from('tasks').delete().eq('id', id);
  showToast('Tugas dihapus');
  loadTasks();
}

function openProofModal(id) {
  document.getElementById('proof-task-id').value = id;
  document.getElementById('proof-url').value = '';
  document.getElementById('proof-modal').classList.remove('hidden');
  lucide.createIcons();
}

async function submitProof() {
  const id = document.getElementById('proof-task-id').value;
  const proof_link = document.getElementById('proof-url').value.trim();
  if (!proof_link) return showToast('Masukkan tautan bukti kerja terlebih dahulu!', 'error');
  await db.from('tasks').update({ proof_link, status: 'review' }).eq('id', id);
  closeModal('proof-modal');
  showToast('Bukti kerja terkirim!', 'success');
  loadTasks();
}

function openUpgradeModal() {
  document.getElementById('upgrade-modal').classList.remove('hidden');
  lucide.createIcons();
}

async function confirmUpgrade() {
  await db.from('workspaces').update({ plan: 'pro' }).eq('code', currentUser.code);
  closeModal('upgrade-modal');
  showToast('Workspace berhasil di-upgrade ke Patungan Pro! ✨', 'success');
  initApp();
}

async function openAdsModal() {
  const { data } = await db.from('ads_config').select('*').eq('id', 1).single();
  if (data) {
    document.getElementById('ads-text-input').value = data.ad_text;
    document.getElementById('ads-active-input').checked = data.is_active;
  }
  updateAdPreview();
  document.getElementById('ads-modal').classList.remove('hidden');
  lucide.createIcons();
}

function updateAdPreview() {
  const text = document.getElementById('ads-text-input').value.trim();
  const active = document.getElementById('ads-active-input').checked;
  const box = document.getElementById('ads-preview-box');
  if (active && text) {
    box.classList.remove('hidden');
    box.textContent = `📢 ${text}`;
  } else {
    box.classList.add('hidden');
  }
}

async function saveAds() {
  const ad_text = document.getElementById('ads-text-input').value.trim();
  const is_active = document.getElementById('ads-active-input').checked;
  await db.from('ads_config').update({ ad_text, is_active }).eq('id', 1);
  closeModal('ads-modal');
  showToast('Pengaturan iklan bot disimpan!', 'success');
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function logout() {
  localStorage.removeItem('kk_user');
  window.location.href = 'index.html';
}

lucide.createIcons();
initApp();