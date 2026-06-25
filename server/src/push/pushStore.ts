import type webPush from 'web-push';
import { readJson, writeJson } from '../storage/jsonStore.js';
import { PUSH_SUBSCRIPTIONS_FILE } from '../storage/paths.js';

export interface PushSubscriptionsDoc {
  subscriptions: webPush.PushSubscription[];
}

export async function loadPushSubscriptions(): Promise<PushSubscriptionsDoc> {
  const doc = await readJson<PushSubscriptionsDoc | null>(PUSH_SUBSCRIPTIONS_FILE, null);
  if (!doc || !Array.isArray(doc.subscriptions)) return { subscriptions: [] };
  return {
    subscriptions: dedupeSubscriptions(doc.subscriptions),
  };
}

export async function addPushSubscription(subscription: webPush.PushSubscription): Promise<PushSubscriptionsDoc> {
  const doc = await loadPushSubscriptions();
  const subscriptions = dedupeSubscriptions([
    ...doc.subscriptions.filter((item) => item.endpoint !== subscription.endpoint),
    subscription,
  ]);
  const next = { subscriptions };
  await writeJson(PUSH_SUBSCRIPTIONS_FILE, next);
  return next;
}

export async function removePushSubscription(endpoint: string): Promise<PushSubscriptionsDoc> {
  const doc = await loadPushSubscriptions();
  const next = {
    subscriptions: doc.subscriptions.filter((item) => item.endpoint !== endpoint),
  };
  await writeJson(PUSH_SUBSCRIPTIONS_FILE, next);
  return next;
}

function dedupeSubscriptions(subscriptions: webPush.PushSubscription[]): webPush.PushSubscription[] {
  const seen = new Set<string>();
  const result: webPush.PushSubscription[] = [];
  for (const subscription of subscriptions) {
    if (!subscription.endpoint || seen.has(subscription.endpoint)) continue;
    seen.add(subscription.endpoint);
    result.push(subscription);
  }
  return result;
}
