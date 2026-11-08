/** Login screen: one account per role, PIN only. */

import { esc, icon } from '../dom.js';
import { APP_VERSION } from '../../version.js';
import { login, demoCredentials, pendingLock, validPinFormat } from '../../data/auth.js';

const ROLE_TEXT = {
  manager: 'Manajer / pemilik',
  operator: 'Operator gudang',
  sales: 'Sales & customer service',
  driver: 'Driver / transport',
};

const ROLE_NOTE = {
  manager: 'Persetujuan, laporan, master',
  operator: 'Stok, transfer, opname',
  sales: 'Faktur, pesanan, proyek, pelanggan',
  driver: 'Surat jalan dan tugas pengiriman',
};

const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase();

export function render({ users = [] } = {}) {
  const active = users.filter((u) => u.active !== false);
  const demo = demoCredentials(active);

  return `
    <div class="auth-screen">
      <section class="auth-brand" aria-label="Tentang Lajur">
        <div class="auth-brand-top">
          <img src="/assets/lajur-mark.svg" alt="" width="44" height="44" />
          <div class="brand-word"><strong>lajur</strong><span>Gudang tekstil</span></div>
        </div>
        <div class="auth-brand-copy">
          <div class="eyebrow">Sistem gudang gorden</div>
          <h1>Setiap roll,<br />tercatat.</h1>
          <p>Stok fisik, terpesan, tersedia, karantina, dan transit — dipisahkan sampai potongan terakhir.</p>
          <ul class="auth-points">
            <li>${icon('box')} Roll, lot, dan rak yang bisa ditelusuri</li>
            <li>${icon('transfer')} Transfer antar gudang tanpa pengiriman ganda</li>
            <li>${icon('receipt')} Faktur, proyek, sample, dan deposit terhubung</li>
          </ul>
        </div>
        <div class="auth-brand-foot">
          <span>v${esc(APP_VERSION)}</span><span>Demo lokal · data per perangkat</span>
        </div>
      </section>

      <main class="auth-panel" id="main">
        <div class="auth-card">
          <div class="eyebrow">Masuk</div>
          <h2>Pilih akun, masukkan PIN</h2>
          <p class="sub">Setiap peran punya akses dan PIN sendiri. Sesi berakhir dalam 8 jam.</p>

          <div class="auth-users" role="radiogroup" aria-label="Pilih pengguna">
            ${active.map((u, idx) => `
              <button class="auth-user" type="button" role="radio" aria-checked="${idx === 0}" data-user="${u.id}">
                <span class="avatar avatar-lg">${esc(initials(u.name))}</span>
                <span class="auth-user-text">
                  <strong>${esc(u.name)}</strong>
                  <span>${esc(ROLE_TEXT[u.role] ?? u.role)}</span>
                  <small>${esc(ROLE_NOTE[u.role] ?? 'Akses sesuai peran')}</small>
                </span>
                <span class="auth-check">${icon('check')}</span>
              </button>`).join('') || `<div class="notice notice-warn">${icon('alert')}<div>Tidak ada akun aktif. Hubungi manajer.</div></div>`}
          </div>

          <form class="auth-form" novalidate>
            <label for="login-pin">PIN</label>
            <div class="pin-wrap">
              <input class="input" id="login-pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password"
                maxlength="6" placeholder="4–6 angka" aria-describedby="login-error" />
              <button class="icon-btn pin-toggle" type="button" data-toggle-pin aria-label="Tampilkan PIN">${icon('pin')}</button>
            </div>
            <p class="auth-error" id="login-error" role="alert" hidden></p>
            <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>Masuk</button>
          </form>

          ${demo.length ? `<details class="auth-demo">
            <summary>PIN demo</summary>
            <p>Hanya untuk mencoba. Ganti PIN setelah masuk.</p>
            <ul>${demo.map((u) => `<li><span>${esc(u.name)}</span><code>${esc(u.pin)}</code></li>`).join('')}</ul>
          </details>` : ''}

          <p class="auth-legal">Login ini berjalan di browser dan bukan batas keamanan produksi. Data tersimpan lokal pada perangkat ini.</p>
        </div>
      </main>
    </div>`;
}

export function mount({ users = [], onAuthenticated }) {
  const form = document.querySelector('.auth-form');
  const error = document.getElementById('login-error');
  const input = document.getElementById('login-pin');
  const submit = document.querySelector('[data-submit]');
  let selected = users.find((u) => u.active !== false)?.id ?? null;

  const setSelected = (id) => {
    selected = id;
    document.querySelectorAll('[data-user]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.user === id));
    });
  };

  document.querySelectorAll('[data-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSelected(btn.dataset.user);
      error.hidden = true;
      input.focus();
    });
  });
  setSelected(selected);
  if (!window.matchMedia('(max-width: 820px)').matches) input.focus();

  document.querySelector('[data-toggle-pin]')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.setAttribute('aria-label', showing ? 'Tampilkan PIN' : 'Sembunyikan PIN');
  });

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    error.hidden = true;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const pin = input.value.trim();
    if (!validPinFormat(pin)) {
      error.textContent = 'PIN harus 4–6 angka.';
      error.hidden = false;
      input.focus();
      return;
    }
    const lock = pendingLock(selected);
    if (lock) {
      error.textContent = `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(lock / 1000)} detik.`;
      error.hidden = false;
      return;
    }
    submit.setAttribute('disabled', 'disabled');
    submit.textContent = 'Memeriksa…';
    try {
      const user = await login(selected, pin, users);
      input.value = '';
      onAuthenticated(user);
    } catch (err) {
      error.textContent = err.message ?? 'Gagal masuk.';
      error.hidden = false;
      input.select();
      submit.removeAttribute('disabled');
      submit.textContent = 'Masuk';
    }
  });
}
