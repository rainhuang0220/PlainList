import { reviewWindowFor, type AuthenticatedUser, type WeeklySummaryContent } from '@plainlist/shared';

export type ReviewSnapshotStatus = 'pending' | 'generating' | 'ready' | 'error';

export interface ReviewSnapshot {
  userId: number;
  reviewAsOfDate: string;
  windowStartDate: string;
  windowEndDate: string;
  status: ReviewSnapshotStatus;
  content: WeeklySummaryContent | null;
  generatedAt: string | null;
  model: string | null;
  provider: string | null;
  errorMessage: string | null;
  evidence?: unknown | null;
  evidenceHash?: string | null;
  promptVersion?: string | null;
  attemptCount?: number;
}

export type ReviewSnapshotCompletion = Pick<ReviewSnapshot, 'content' | 'model' | 'provider' | 'generatedAt'> & {
  evidence?: unknown;
  evidenceHash?: string;
  promptVersion?: string;
};

export interface ReviewSnapshotRepository {
  ensure(input: Pick<ReviewSnapshot, 'userId' | 'reviewAsOfDate' | 'windowStartDate' | 'windowEndDate'>): Promise<ReviewSnapshot>;
  find(userId: number, reviewAsOfDate: string): Promise<ReviewSnapshot | null>;
  claim(userId: number, reviewAsOfDate: string): Promise<boolean>;
  complete(userId: number, reviewAsOfDate: string, result: ReviewSnapshotCompletion): Promise<ReviewSnapshot>;
  fail(userId: number, reviewAsOfDate: string, errorMessage: string): Promise<ReviewSnapshot>;
  latestReady(userId: number): Promise<ReviewSnapshot | null>;
}

export function createReviewSnapshotCoordinator(input: {
  repository: ReviewSnapshotRepository;
  generate: (user: AuthenticatedUser, snapshot: ReviewSnapshot) => Promise<Omit<ReviewSnapshotCompletion, 'generatedAt'>>;
  now: () => Date;
}) {
  async function generate(user: AuthenticatedUser, reviewAsOfDate: string): Promise<ReviewSnapshot | null> {
    const window = reviewWindowFor(reviewAsOfDate);
    const snapshot = await input.repository.ensure({
      userId: user.id,
      reviewAsOfDate,
      windowStartDate: window.windowStartDate,
      windowEndDate: window.windowEndDate,
    });
    if (snapshot.status === 'ready') {
      return snapshot;
    }

    if (!await input.repository.claim(user.id, reviewAsOfDate)) {
      return input.repository.find(user.id, reviewAsOfDate);
    }

    try {
      const result = await input.generate(user, snapshot);
      return input.repository.complete(user.id, reviewAsOfDate, {
        ...result,
        generatedAt: input.now().toISOString(),
      });
    } catch (error) {
      return input.repository.fail(
        user.id,
        reviewAsOfDate,
        error instanceof Error ? error.message : 'review generation failed',
      );
    }
  }

  return {
    generate,
    read: (userId: number, reviewAsOfDate: string) => input.repository.find(userId, reviewAsOfDate),
  };
}
