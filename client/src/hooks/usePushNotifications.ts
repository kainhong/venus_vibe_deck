import { useEffect } from 'react';
import { api } from '../api/http';

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = globalThis.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output.buffer;
}

export function usePushNotifications(): void {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

    let cancelled = false;
    (async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        await registration.update();
        const { publicKey } = await api.getPushPublicKey();
        if (!publicKey || cancelled) return;

        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }
        if (permission !== 'granted' || cancelled) return;

        const existing = await registration.pushManager.getSubscription();
        const subscription = existing ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(publicKey),
        });
        await api.subscribePush(subscription.toJSON());
      } catch (err) {
        console.warn('[push] subscribe failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
