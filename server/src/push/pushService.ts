import webPush from 'web-push';
import { config } from '../config.js';
import { createLogger } from '../logger.js';
import { addPushSubscription, loadPushSubscriptions, removePushSubscription } from './pushStore.js';

const logger = createLogger('push');

let configured = false;

export interface PushNotificationPayload {
  title?: string;
  body?: string;
  source?: string;
  sessionId?: string;
  at: number;
}

export function getWebPushPublicKey(): string {
  return config.webPush.publicKey;
}

export function isWebPushConfigured(): boolean {
  return Boolean(config.webPush.publicKey && config.webPush.privateKey && config.webPush.subject);
}

function ensureConfigured(): boolean {
  if (!isWebPushConfigured()) return false;
  if (!configured) {
    webPush.setVapidDetails(config.webPush.subject, config.webPush.publicKey, config.webPush.privateKey);
    configured = true;
  }
  return true;
}

export async function subscribePush(subscription: webPush.PushSubscription): Promise<number> {
  const doc = await addPushSubscription(subscription);
  logger.info('push subscription saved', { endpoint: subscription.endpoint, count: doc.subscriptions.length });
  return doc.subscriptions.length;
}

export async function unsubscribePush(endpoint: string): Promise<number> {
  const doc = await removePushSubscription(endpoint);
  logger.info('push subscription deleted', { endpoint, count: doc.subscriptions.length });
  return doc.subscriptions.length;
}

export async function sendPushNotification(payload: PushNotificationPayload): Promise<void> {
  if (!ensureConfigured()) {
    logger.debug('push skipped: vapid not configured');
    return;
  }
  const doc = await loadPushSubscriptions();
  if (doc.subscriptions.length === 0) {
    logger.debug('push skipped: no subscriptions');
    return;
  }

  const body = JSON.stringify({
    title: payload.title ?? 'Vibe Deck',
    body: payload.body ?? `${payload.source ?? 'Agent'} 已完成`,
    source: payload.source,
    sessionId: payload.sessionId,
    at: payload.at,
  });

  await Promise.all(doc.subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification(subscription, body);
      logger.info('push notification sent', { endpoint: subscription.endpoint, source: payload.source, sessionId: payload.sessionId });
    } catch (err) {
      const statusCode = typeof err === 'object' && err && 'statusCode' in err ? Number((err as { statusCode?: number }).statusCode) : undefined;
      logger.warn('push notification failed', { endpoint: subscription.endpoint, statusCode, err: err as Error });
      if (statusCode === 404 || statusCode === 410) {
        const next = await removePushSubscription(subscription.endpoint);
        logger.info('push subscription removed', { endpoint: subscription.endpoint, count: next.subscriptions.length });
      }
    }
  }));
}
