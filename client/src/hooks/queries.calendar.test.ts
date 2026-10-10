import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invalidateQueries } = vi.hoisted(() => ({
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/queryClient', () => ({
  queryClient: {
    invalidateQueries,
  },
}));

import { invalidateCalendarData } from './queries';

describe('invalidateCalendarData', () => {
  beforeEach(() => {
    invalidateQueries.mockClear();
  });

  it('marks calendar and bookings queries stale so the board refetches', async () => {
    await invalidateCalendarData();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['calendar'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['bookings'] });
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });
});
