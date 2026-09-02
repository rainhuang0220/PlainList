interface SyncInput {
  userScope: string;
  reason: string;
  scan: (userScope: string, range: 'all') => Promise<any>;
  acknowledge: (userScope: string, completed: unknown[], summary: unknown, options: { bootstrapComplete: boolean }) => Promise<unknown>;
  postDigest: (digest: unknown) => Promise<{ factCount: number; affectedDates: string[] }>;
  reconcile: (payload: unknown) => Promise<unknown>;
  sleep?: (milliseconds: number) => Promise<void>;
  concurrency?: number;
  signal?: AbortSignal;
}

function retryable(error: unknown) {
  const status = Number((error as any)?.status || (error as any)?.response?.status || 0);
  return status === 429 || status >= 500 || /timeout|temporar|unavailable/i.test(String((error as any)?.message || ''));
}

async function postWithBackoff(input: SyncInput, digest: unknown) {
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await input.postDigest(digest);
    } catch (error) {
      lastError = error;
      if (!retryable(error) || attempt === 2) throw error;
      await sleep(1_000 * (2 ** attempt));
    }
  }
  throw lastError;
}

function localYesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export async function syncChatgptActivity(input: SyncInput) {
  const result = await input.scan(input.userScope, 'all');
  input.signal?.throwIfAborted();
  if (result.status === 'disabled' || result.status === 'paused') {
    return { status: result.status, activities: 0, checked: 0, changed: 0, skipped: 0 };
  }
  const digests = Array.isArray(result.digests) ? result.digests : [];
  const archiveDates = digests.flatMap((item: any) => {
    const localDates = Array.isArray(item?.digest?.localFacts) ? item.digest.localFacts.map((fact: any) => String(fact.dateKey || '')) : [];
    return localDates.length ? localDates : [String(item?.digest?.dateKey || '')];
  }).filter(Boolean).sort();
  const affectedDates = new Set<string>();
  let activities = 0;
  let processed = 0;
  let cursor = 0;
  const summary = () => ({
    checked: Number(result.checked || 0),
    changed: Number(result.changed || 0),
    skipped: Number(result.skipped || 0),
    historicalBootstrap: Boolean(result.bootstrap),
    activities,
    processed,
    journalDays: affectedDates.size,
    dateFrom: archiveDates[0] ?? null,
    dateTo: archiveDates.at(-1) ?? null,
  });
  const worker = async () => {
    while (cursor < digests.length) {
      input.signal?.throwIfAborted();
      const item = digests[cursor++];
      const response = await postWithBackoff(input, item.digest);
      activities += Number(response.factCount || 0);
      for (const date of response.affectedDates ?? []) affectedDates.add(date);
      processed += 1;
      await input.acknowledge(input.userScope, [{
        conversationId: item.digest.sourceExternalId,
        hash: item.hash,
        updatedAt: item.digest.occurredAt,
      }], summary(), { bootstrapComplete: false });
      input.signal?.throwIfAborted();
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 2, digests.length) }, worker));
  await input.reconcile({
    affectedDates: [...affectedDates].sort(),
    finalizeThrough: localYesterday(),
    checked: Number(result.checked || 0),
    changed: Number(result.changed || 0),
    skipped: Number(result.skipped || 0),
    historicalBootstrap: Boolean(result.bootstrap),
  });
  await input.acknowledge(input.userScope, [], summary(), { bootstrapComplete: Boolean(result.bootstrap) });
  return { status: result.status, ...summary() };
}
