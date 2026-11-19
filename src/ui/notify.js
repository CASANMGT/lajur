/** Browser notifications for deliveries that have arrived. */

const PREF_KEY = 'lajur.notify.arrival';

export function notificationsSupported() {
  return typeof window !== 'undefined' && typeof window.Notification === 'function';
}

export function arrivalNotificationsEnabled() {
  if (!notificationsSupported() || window.Notification.permission !== 'granted') return false;
  try {
    return window.localStorage?.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}

export async function enableArrivalNotifications() {
  if (!notificationsSupported()) throw new Error('Browser ini tidak mendukung notifikasi.');
  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Izin notifikasi ditolak. Aktifkan lewat pengaturan browser.');
  try {
    window.localStorage?.setItem(PREF_KEY, '1');
  } catch {
    // The permission still works for this session even if storage is blocked.
  }
  return true;
}

export function notifyArrival(delivery) {
  if (!arrivalNotificationsEnabled() || !delivery) return false;
  try {
    const note = new window.Notification('Paket tiba', {
      body: `${delivery.id} · ${delivery.customerName ?? 'Pelanggan'}${delivery.trackingRef ? ` · ${delivery.trackingRef}` : ''}`,
      tag: `delivery-${delivery.id}`,
    });
    note.onclick = () => {
      window.focus();
      window.location.hash = '#/pengiriman';
      note.close();
    };
    return true;
  } catch {
    return false;
  }
}
