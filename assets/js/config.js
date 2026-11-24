const SUPABASE_URL = 'https://ukrmxxmwuphmjvoijvwi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-8aZt7Ig7rOivCUJSRM6Bw_zRdVPi8j';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Daftarkan Service Worker PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// Notifikasi Toast Modern
function showToast(msg, type = 'dark') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-red-600' : 'bg-zinc-900';
  toast.className = `${bg} text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 transition-all duration-300 transform translate-y-2 opacity-0`;
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('translate-y-2', 'opacity-0'));
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}