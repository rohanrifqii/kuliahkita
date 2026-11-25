// =========================================================
// INISIALISASI SESI USER & STATE
// =========================================================
lucide.createIcons();

const currentUser = JSON.parse(localStorage.getItem('kk_user'));
if (!currentUser) {
  window.location.href = 'auth.html';
}

let currentWorkspace = null;
let allTasks = [];
let activeFilter = 'all'; // 'all' | 'mine' | 'urgent'
let activeView = 'kanban'; // 'kanban' | 'list'

// Tampilkan identitas user di Sidebar & Popover
if (currentUser) {
  document.getElementById('user-display-name').textContent = currentUser.name;
  document.getElementById('user-display-role').textContent = currentUser.role === 'leader' ? 'Ketua / Koordinator' : 'Anggota / Mahasiswa';
  document.getElementById('user-avatar').textContent = currentUser.name.slice(0, 2).toUpperCase();
  document.getElementById('popover-user-name').textContent = currentUser.name;
  document.getElementById('popover-user-wa').textContent = currentUser.wa || 'No. WA belum diisi';
}

function toggleSidebar(open) {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (open) {
    sidebar.classList.remove('-translate-x-full');
    backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    backdrop.classList.add('hidden');
  }
}

function toggleUserMenu() {
  const pop = document.getElementById('user-menu-popover');
  pop.classList.toggle('hidden');
  lucide.createIcons();
}

// =========================================================
// LOAD DATA WORKSPACE & TASKS DARI SUPABASE
// =========================================================
async function initBoard() {
  const { data: ws, error } = await db
    .from('workspaces')
    .select('*')
    .eq('code', currentUser.code)
    .single();

  if (error || !ws) {
    logoutWorkspace();
    return;
  }

  currentWorkspace = ws;
  renderWorkspaceHeader();
  renderSidebarWorkspaces();
  await loadTasks();

  // Realtime Listener Supabase agar papan otomatis update saat Bot WA menambah tugas
  db.channel('tasks-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `workspace_code=eq.${currentUser.code}` }, () => {
      loadTasks();
    })
    .subscribe();
}

function renderWorkspaceHeader() {
  document.getElementById('ws-title').textContent = currentWorkspace.name;
  document.getElementById('ws-code-badge').textContent = currentWorkspace.code;
  document.getElementById('sidebar-cmd-code').textContent = `!daftar ${currentWorkspace.code}`;

  const planBadge = document.getElementById('ws-plan-badge');
  const upgradeBox = document.getElementById('plan-upgrade-box');
  if (currentWorkspace.plan === 'pro') {
    planBadge.textContent = 'PATUNGAN PRO ✨';
    planBadge.className = 'text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-indigo-600 text-white';
    upgradeBox.innerHTML = `
      <div class="flex items-center gap-2 text-indigo-950">
        <i data-lucide="sparkles" class="w-4 h-4 text-indigo-600 shrink-0"></i>
        <div>
          <p class="text-xs font-extrabold">Patungan Pro Aktif</p>
          <p class="text-[11px] text-indigo-800/80">Bebas iklan + pengingat H-3 & 4 jam</p>
        </div>
      </div>`;
  } else {
    planBadge.textContent = 'GRATIS';
    planBadge.className = 'text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600';
  }

  // Update Kartu Status Bot WhatsApp di Sidebar
  const waDot = document.getElementById('wa-status-dot');
  const waText = document.getElementById('wa-status-text');
  if (currentWorkspace.wa_group_id) {
    waDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
    waText.textContent = 'Terhubung ke WhatsApp! Pengingat aktif.';
  } else {
    waDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
    waText.textContent = 'Belum tertaut ke WA. Kirim perintah di bawah ke bot:';
  }
  lucide.createIcons();
}

function renderSidebarWorkspaces() {
  const container = document.getElementById('sidebar-workspaces');
  const history = JSON.parse(localStorage.getItem('kk_history')) || [];
  if (history.length === 0) {
    container.innerHTML = `<p class="text-xs text-zinc-400 px-1">Belum ada riwayat ruang lain.</p>`;
    return;
  }

  container.innerHTML = history.map(item => {
    const isActive = item.code === currentUser.code;
    return `
      <button onclick="switchWorkspace('${item.code}')"
        class="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition cursor-pointer ${
          isActive ? 'bg-zinc-950 text-white font-bold' : 'hover:bg-zinc-100 text-zinc-700 font-medium'
        }">
        <div class="min-w-0 pr-2">
          <p class="text-xs truncate">${escapeHtml(item.wsName)}</p>
          <p class="text-[10px] font-mono text-zinc-400">${escapeHtml(item.code)}</p>
        </div>
        ${isActive ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>' : ''}
      </button>`;
  }).join('');
}

async function switchWorkspace(code) {
  if (code === currentUser.code) return;
  const history = JSON.parse(localStorage.getItem('kk_history')) || [];
  const target = history.find(h => h.code === code);
  if (!target) return;

  localStorage.setItem('kk_user', JSON.stringify({
    name: target.name,
    wa: target.wa,
    role: target.role,
    code: target.code
  }));
  window.location.reload();
}

async function loadTasks() {
  const { data, error } = await db
    .from('tasks')
    .select('*')
    .eq('workspace_code', currentUser.code)
    .order('deadline', { ascending: true });

  if (error) {
    return showToast('Gagal memuat daftar tugas', 'error');
  }

  allTasks = data || [];
  updateStatsAndMembers();
  renderBoard();
}

function updateStatsAndMembers() {
  const now = new Date();
  const total = allTasks.length;
  const doneCount = allTasks.filter(t => t.status === 'done').length;
  const reviewCount = allTasks.filter(t => t.status === 'review').length;
  const activeCount = total - doneCount;
  const urgentCount = allTasks.filter(t => {
    if (t.status === 'done') return false;
    const diffHours = (new Date(t.deadline) - now) / (1000 * 60 * 60);
    return diffHours <= 48;
  }).length;

  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  document.getElementById('progress-percent').textContent = `${pct}%`;
  document.getElementById('progress-caption').textContent = `${doneCount} dari ${total} tugas telah disetujui selesai`;
  document.getElementById('progress-bar-fill').style.width = `${pct}%`;

  document.getElementById('stat-active').textContent = activeCount;
  document.getElementById('stat-review').textContent = reviewCount;
  document.getElementById('stat-urgent').textContent = urgentCount;

  // Render daftar anggota unik dari tugas + user saat ini
  const memberSet = new Set([currentUser.name]);
  allTasks.forEach(t => { if (t.assignee_name) memberSet.add(t.assignee_name); });

  const membersBox = document.getElementById('sidebar-members');
  membersBox.innerHTML = Array.from(memberSet).map(name => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 text-[11px] font-semibold">
      <span class="w-4 h-4 rounded-full bg-zinc-800 text-white text-[9px] flex items-center justify-center font-bold">${name[0].toUpperCase()}</span>
      ${escapeHtml(name)}
    </span>
  `).join('');
}

// =========================================================
// FILTER & VIEW SWITCHER
// =========================================================
function setTaskFilter(filter) {
  activeFilter = filter;
  ['all', 'mine', 'urgent'].forEach(f => {
    const btn = document.getElementById(`filter-${f}`);
    if (f === filter) {
      btn.className = 'px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-950 text-white transition cursor-pointer shrink-0 flex items-center gap-1.5';
    } else {
      btn.className = 'px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100 transition cursor-pointer shrink-0 flex items-center gap-1.5';
    }
  });
  renderBoard();
}

function setBoardView(view) {
  activeView = view;
  const kanbanEl = document.getElementById('kanban-view');
  const listEl = document.getElementById('list-view');
  const btnKanban = document.getElementById('view-btn-kanban');
  const btnList = document.getElementById('view-btn-list');

  if (view === 'kanban') {
    kanbanEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    btnKanban.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white text-zinc-950 shadow-2xs flex items-center gap-1.5 transition cursor-pointer';
    btnList.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5 transition cursor-pointer';
  } else {
    kanbanEl.classList.add('hidden');
    listEl.classList.remove('hidden');
    btnList.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white text-zinc-950 shadow-2xs flex items-center gap-1.5 transition cursor-pointer';
    btnKanban.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5 transition cursor-pointer';
  }
}

function getFilteredTasks() {
  const query = (document.getElementById('search-task-input').value || '').toLowerCase().trim();
  const now = new Date();

  return allTasks.filter(t => {
    if (query) {
      const matchTitle = t.title.toLowerCase().includes(query);
      const matchPj = (t.assignee_name || '').toLowerCase().includes(query);
      if (!matchTitle && !matchPj) return false;
    }

    if (activeFilter === 'mine') {
      const isMyName = (t.assignee_name || '').toLowerCase() === currentUser.name.toLowerCase();
      const isMyWa = t.assignee_wa === currentUser.wa;
      if (!isMyName && !isMyWa) return false;
    }

    if (activeFilter === 'urgent') {
      if (t.status === 'done') return false;
      const diffHours = (new Date(t.deadline) - now) / (1000 * 60 * 60);
      if (diffHours > 48) return false;
    }

    return true;
  });
}

// =========================================================
// RENDER KARTU KANBAN & DAFTAR TENGGAT
// =========================================================
function getDeadlineBadge(deadlineStr, status) {
  const dl = new Date(deadlineStr);
  const now = new Date();
  const diffHours = (dl - now) / (1000 * 60 * 60);
  const formatted = dl.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  if (status === 'done') {
    return `<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md"><i data-lucide="check-circle-2" class="w-3 h-3"></i> ${formatted}</span>`;
  }
  if (diffHours < 0) {
    return `<span class="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md"><i data-lucide="alert-circle" class="w-3 h-3"></i> Terlewat (${formatted})</span>`;
  }
  if (diffHours <= 24) {
    return `<span class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md"><i data-lucide="clock" class="w-3 h-3"></i> Besok / ${Math.max(1, Math.round(diffHours))}j lagi</span>`;
  }
  return `<span class="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-md"><i data-lucide="calendar" class="w-3 h-3"></i> ${formatted}</span>`;
}

function getWaReminderBadge(task) {
  if (task.status === 'done') return '';
  if (task.last_reminded) {
    return `<span title="Sudah diingatkan bot WA" class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-1.5 py-0.5 rounded"><i data-lucide="check-check" class="w-3 h-3"></i> WA ${task.last_reminded}</span>`;
  }
  return `<span title="Terjadwal otomatis di Bot WA" class="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400 bg-zinc-50 border border-zinc-200/70 px-1.5 py-0.5 rounded"><i data-lucide="bell" class="w-2.5 h-2.5"></i> Auto WA</span>`;
}

function renderCardActionButtons(t) {
  if (t.status === 'todo') {
    return `<button onclick="event.stopPropagation(); updateTaskStatus('${t.id}', 'in_progress')"
      class="w-full py-1.5 px-2.5 bg-zinc-900 hover:bg-indigo-600 text-white text-[11px] font-bold rounded-lg transition cursor-pointer">
      Mulai Kerjakan &rarr;
    </button>`;
  }
  if (t.status === 'in_progress') {
    return `<button onclick="event.stopPropagation(); openProofModal('${t.id}')"
      class="w-full py-1.5 px-2.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg transition cursor-pointer">
      Setor Bukti Kerja
    </button>`;
  }
  if (t.status === 'review') {
    if (currentUser.role === 'leader') {
      return `<div class="flex gap-1.5">
        <button onclick="event.stopPropagation(); updateTaskStatus('${t.id}', 'in_progress')"
          class="flex-1 py-1.5 px-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-bold rounded-lg transition cursor-pointer">
          Revisi
        </button>
        <button onclick="event.stopPropagation(); updateTaskStatus('${t.id}', 'done')"
          class="flex-2 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition cursor-pointer">
          ACC Selesai ✓
        </button>
      </div>`;
    }
    return `<div class="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg text-center">Menunggu ACC Ketua</div>`;
  }
  return '';
}

function renderBoard() {
  const filtered = getFilteredTasks();
  const cols = { todo: [], in_progress: [], review: [], done: [] };

  filtered.forEach(t => {
    if (cols[t.status]) cols[t.status].push(t);
    else cols.todo.push(t);
  });

  // Render Kanban Columns
  Object.keys(cols).forEach(status => {
    const container = document.getElementById(`col-${status}`);
    document.getElementById(`count-${status}`).textContent = cols[status].length;

    if (cols[status].length === 0) {
      container.innerHTML = `<div class="border border-dashed border-zinc-300/80 rounded-xl p-4 text-center text-[11px] text-zinc-400">Belum ada tugas</div>`;
      return;
    }

    container.innerHTML = cols[status].map(t => `
      <div onclick="openTaskDrawer('${t.id}')"
        class="bg-white border border-zinc-200/90 hover:border-indigo-300 rounded-xl p-3.5 shadow-2xs hover:shadow-md transition cursor-pointer space-y-2.5 group">
        <div class="flex items-start justify-between gap-2">
          <h3 class="text-xs sm:text-sm font-bold text-zinc-900 group-hover:text-indigo-600 transition leading-snug">${escapeHtml(t.title)}</h3>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          ${getDeadlineBadge(t.deadline, t.status)}
          ${getWaReminderBadge(t)}
        </div>

        ${t.proof_link ? `
          <a href="${escapeHtml(t.proof_link)}" target="_blank" onclick="event.stopPropagation()"
            class="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline">
            <i data-lucide="external-link" class="w-3 h-3"></i> Lihat Link Bukti
          </a>` : ''}

        <div class="pt-2 border-t border-zinc-100 flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full bg-zinc-900 text-white text-[10px] font-bold flex items-center justify-center">${(t.assignee_name || 'U')[0].toUpperCase()}</span>
            <span class="text-xs font-semibold text-zinc-700">${escapeHtml(t.assignee_name)}</span>
          </div>
          <span class="text-[10px] text-zinc-400 group-hover:text-zinc-700">Detail &rarr;</span>
        </div>

        ${renderCardActionButtons(t)}
      </div>
    `).join('');
  });

  // Render List View (Timeline)
  const listContainer = document.getElementById('list-container');
  document.getElementById('list-total-label').textContent = `${filtered.length} tugas ditampilkan`;
  if (filtered.length === 0) {
    listContainer.innerHTML = `<div class="p-8 text-center text-xs text-zinc-400">Tidak ada tugas yang sesuai filter saat ini.</div>`;
  } else {
    const statusBadgeMap = {
      todo: '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-100 text-zinc-700">To Do</span>',
      in_progress: '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700">Dikerjakan</span>',
      review: '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700">Cek Bukti</span>',
      done: '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700">Selesai</span>'
    };

    listContainer.innerHTML = filtered.map(t => `
      <div onclick="openTaskDrawer('${t.id}')" class="p-4 hover:bg-zinc-50/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            ${statusBadgeMap[t.status] || ''}
            <p class="text-sm font-bold text-zinc-900 truncate">${escapeHtml(t.title)}</p>
          </div>
          <div class="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
            <span>👤 PJ: <strong class="text-zinc-700">${escapeHtml(t.assignee_name)}</strong></span>
            ${getDeadlineBadge(t.deadline, t.status)}
            ${getWaReminderBadge(t)}
          </div>
        </div>
        <div class="w-full sm:w-40 shrink-0">
          ${renderCardActionButtons(t)}
        </div>
      </div>
    `).join('');
  }

  lucide.createIcons();
}

// =========================================================
// SLIDE-OVER DETAIL DRAWER
// =========================================================
function openTaskDrawer(taskId) {
  const t = allTasks.find(item => String(item.id) === String(taskId));
  if (!t) return;

  const dlFormatted = new Date(t.deadline).toLocaleString('id-ID', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  document.getElementById('drawer-body').innerHTML = `
    <div class="flex items-center justify-between">
      <span class="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Detail Tugas</span>
      <button onclick="closeTaskDrawer()" class="p-1.5 text-zinc-400 hover:text-zinc-900 rounded-lg cursor-pointer">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
    </div>

    <div>
      <h2 class="text-xl font-extrabold text-zinc-950 leading-snug">${escapeHtml(t.title)}</h2>
      <div class="mt-2 flex flex-wrap gap-2">
        ${getDeadlineBadge(t.deadline, t.status)}
        ${getWaReminderBadge(t)}
      </div>
    </div>

    <div class="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-3 text-xs">
      <div class="flex justify-between">
        <span class="text-zinc-500">Penanggung Jawab</span>
        <span class="font-bold text-zinc-900">${escapeHtml(t.assignee_name)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-zinc-500">WhatsApp PJ</span>
        <span class="font-mono font-bold text-zinc-900">${escapeHtml(t.assignee_wa || '-')}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-zinc-500">Batas Kumpul</span>
        <span class="font-bold text-zinc-900">${dlFormatted} WIB</span>
      </div>
    </div>

    <div class="space-y-2">
      <label class="block text-xs font-bold text-zinc-700">Bukti Pengerjaan</label>
      ${t.proof_link ? `
        <a href="${escapeHtml(t.proof_link)}" target="_blank"
          class="flex items-center justify-between p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition">
          <span class="truncate pr-2">${escapeHtml(t.proof_link)}</span>
          <i data-lucide="external-link" class="w-4 h-4 shrink-0"></i>
        </a>` : `
        <p class="text-xs text-zinc-400 italic">Belum ada link bukti yang dilampirkan.</p>`}
    </div>

    <div class="pt-2 border-t border-zinc-100 space-y-2">
      <p class="text-xs font-bold text-zinc-700">Colek Manual via WhatsApp</p>
      <button onclick="sendManualWaPing('${t.id}')"
        class="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer">
        <i data-lucide="send" class="w-3.5 h-3.5"></i>
        <span>Kirim Pengingat Langsung ke WA ${escapeHtml(t.assignee_name)}</span>
      </button>
    </div>
  `;

  document.getElementById('drawer-footer').innerHTML = `
    ${currentUser.role === 'leader' ? `
      <button onclick="deleteTask('${t.id}')" class="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition cursor-pointer">
        Hapus Tugas
      </button>` : '<span></span>'}
    <button onclick="closeTaskDrawer()" class="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-900 text-white cursor-pointer">
      Tutup
    </button>
  `;

  document.getElementById('detail-drawer-backdrop').classList.remove('hidden');
  document.getElementById('detail-drawer').classList.remove('translate-x-full');
  lucide.createIcons();
}

function closeTaskDrawer() {
  document.getElementById('detail-drawer-backdrop').classList.add('hidden');
  document.getElementById('detail-drawer').classList.add('translate-x-full');
}

function sendManualWaPing(taskId) {
  const t = allTasks.find(item => String(item.id) === String(taskId));
  if (!t || !t.assignee_wa) return showToast('Nomor WA PJ tidak valid', 'error');

  const dl = new Date(t.deadline).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const msg = encodeURIComponent(`Halo ${t.assignee_name}, mengingatkan tugas "${t.title}" di ruang ${currentWorkspace.name} tenggatnya ${dl} WIB ya. Jangan lupa setor link bukti di KuliahKita!`);
  window.open(`https://wa.me/${t.assignee_wa}?text=${msg}`, '_blank');
}

// =========================================================
// CRUD ACTIONS (TAMBAH, UPDATE STATUS, SETOR BUKTI, HAPUS)
// =========================================================
function openTaskModal() {
  document.getElementById('task-assignee').value = currentUser.name;
  document.getElementById('task-wa').value = currentUser.wa;

  // Set default deadline besok jam 23:59
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59);
  const pad = (n) => String(n).padStart(2, '0');
  document.getElementById('task-deadline').value = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T23:59`;

  document.getElementById('task-modal').classList.remove('hidden');
  document.getElementById('task-modal').classList.add('flex');
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.add('hidden');
  document.getElementById('task-modal').classList.remove('flex');
}

document.getElementById('new-task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('task-title').value.trim();
  const assignee_name = document.getElementById('task-assignee').value.trim();
  const assignee_wa = document.getElementById('task-wa').value.trim();
  const deadlineRaw = document.getElementById('task-deadline').value;

  const { error } = await db.from('tasks').insert([{
    workspace_code: currentUser.code,
    title,
    assignee_name,
    assignee_wa,
    deadline: new Date(deadlineRaw).toISOString(),
    status: 'todo'
  }]);

  if (error) return showToast('Gagal menyimpan tugas: ' + error.message, 'error');

  document.getElementById('new-task-form').reset();
  closeTaskModal();
  showToast('Tugas ditambahkan & terjadwal ke Bot WA!');
  loadTasks();
});

async function updateTaskStatus(taskId, newStatus) {
  const { error } = await db.from('tasks').update({ status: newStatus }).eq('id', taskId);
  if (error) return showToast('Gagal memperbarui status', 'error');
  showToast('Status tugas diperbarui');
  loadTasks();
}

function openProofModal(taskId) {
  document.getElementById('proof-task-id').value = taskId;
  document.getElementById('proof-modal').classList.remove('hidden');
  document.getElementById('proof-modal').classList.add('flex');
}

function closeProofModal() {
  document.getElementById('proof-modal').classList.add('hidden');
  document.getElementById('proof-modal').classList.remove('flex');
}

document.getElementById('proof-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('proof-task-id').value;
  const proof_link = document.getElementById('proof-url').value.trim();

  const { error } = await db.from('tasks').update({ proof_link, status: 'review' }).eq('id', id);
  if (error) return showToast('Gagal mengirim link bukti', 'error');

  document.getElementById('proof-form').reset();
  closeProofModal();
  showToast('Bukti kerja terkirim untuk diperiksa!');
  loadTasks();
});

async function deleteTask(taskId) {
  if (!confirm('Yakin ingin menghapus tugas ini?')) return;
  const { error } = await db.from('tasks').delete().eq('id', taskId);
  if (error) return showToast('Gagal menghapus tugas', 'error');
  closeTaskDrawer();
  showToast('Tugas dihapus');
  loadTasks();
}

// =========================================================
// UTILITY & SIMULASI PRO
// =========================================================
async function simulateUpgradePro() {
  const { error } = await db.from('workspaces').update({ plan: 'pro' }).eq('code', currentUser.code);
  if (error) return showToast('Gagal mengaktifkan mode Pro', 'error');
  currentWorkspace.plan = 'pro';
  renderWorkspaceHeader();
  showToast('Simulasi Patungan Pro aktif! Bebas iklan footer WA ✨');
}

function copyWorkspaceCode() {
  navigator.clipboard.writeText(currentWorkspace.code);
  showToast(`Kode ruang ${currentWorkspace.code} disalin!`);
}

function copyBotConnectCmd() {
  const cmd = `!daftar ${currentWorkspace.code}`;
  navigator.clipboard.writeText(cmd);
  showToast(`Perintah "${cmd}" disalin! Tempel ke chat Bot WA.`);
}

function logoutWorkspace() {
  localStorage.removeItem('kk_user');
  window.location.href = 'auth.html';
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

initBoard();