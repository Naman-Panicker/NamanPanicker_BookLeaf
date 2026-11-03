import { describe, expect, it } from 'vitest';
import { bookRoyalty, type RoyaltyBook, royaltySummary } from './royalty';

// Figures from the sample data.
const BK016_NAGPUR_NOTEBOOKS: RoyaltyBook = {
  productionStage: 'PUBLISHED_LIVE',
  copiesSold: 34,
  royaltyEarned: 850,
  royaltyPaid: 0,
  royaltyPending: 850,
  lastPayoutDate: null,
};
const BK015_RAISING_ROOTS: RoyaltyBook = {
  productionStage: 'TYPESETTING',
  copiesSold: 0,
  royaltyEarned: 0,
  royaltyPaid: 0,
  royaltyPending: 0,
  lastPayoutDate: null,
};
const BK013_MIDNIGHT_IN_MYSORE: RoyaltyBook = { ...BK015_RAISING_ROOTS, productionStage: 'COVER_DESIGN' };
const BK001_WHISPERS: RoyaltyBook = {
  productionStage: 'PUBLISHED_LIVE',
  copiesSold: 342,
  royaltyEarned: 11970,
  royaltyPaid: 8400,
  royaltyPending: 3570,
  lastPayoutDate: new Date('2025-10-15'),
};
const BK002_SAFFRON_DIARIES: RoyaltyBook = {
  productionStage: 'PUBLISHED_LIVE',
  copiesSold: 189,
  royaltyEarned: 7938,
  royaltyPaid: 7938,
  royaltyPending: 0,
  lastPayoutDate: new Date('2025-12-01'),
};
const BK005_BETWEEN_TWO_TEMPLES: RoyaltyBook = {
  productionStage: 'PUBLISHED_LIVE',
  copiesSold: 67,
  royaltyEarned: 2546,
  royaltyPaid: 0,
  royaltyPending: 2546,
  lastPayoutDate: null,
};
const BK010_TURBAN_TALES: RoyaltyBook = {
  productionStage: 'PUBLISHED_LIVE',
  copiesSold: 88,
  royaltyEarned: 2464,
  royaltyPaid: 0,
  royaltyPending: 2464,
  lastPayoutDate: null,
};
const BK011_ALGORITHM_OF_LOVE: RoyaltyBook = {
  productionStage: 'PUBLISHED_LIVE',
  copiesSold: 1567,
  royaltyEarned: 39175,
  royaltyPaid: 35000,
  royaltyPending: 4175,
  lastPayoutDate: new Date('2025-11-15'),
};
const BK012_CTRL_ALT_DELETE: RoyaltyBook = {
  productionStage: 'PUBLISHED_LIVE',
  copiesSold: 723,
  royaltyEarned: 21690,
  royaltyPaid: 18000,
  royaltyPending: 3690,
  lastPayoutDate: new Date('2025-10-15'),
};
const BK014_GHAZAL: RoyaltyBook = {
  productionStage: 'PUBLISHED_LIVE',
  copiesSold: 156,
  royaltyEarned: 3120,
  royaltyPaid: 3120,
  royaltyPending: 0,
  lastPayoutDate: new Date('2025-12-01'),
};
const BK017_DURGAS_DAUGHTERS: RoyaltyBook = {
  productionStage: 'PUBLISHED_LIVE',
  copiesSold: 612,
  royaltyEarned: 27540,
  royaltyPaid: 25000,
  royaltyPending: 2540,
  lastPayoutDate: new Date('2025-11-15'),
};
const BK018_HOWRAH_NIGHTS: RoyaltyBook = {
  productionStage: 'PUBLISHED_LIVE',
  copiesSold: 45,
  royaltyEarned: 1575,
  royaltyPaid: 0,
  royaltyPending: 1575,
  lastPayoutDate: null,
};

const KAVITA = [BK015_RAISING_ROOTS, BK016_NAGPUR_NOTEBOOKS];
const ANANYA = [BK005_BETWEEN_TWO_TEMPLES];
const ARJUN = [BK010_TURBAN_TALES];
const DIYA = [BK017_DURGAS_DAUGHTERS, BK018_HOWRAH_NIGHTS];
const PRIYA = [BK001_WHISPERS, BK002_SAFFRON_DIARIES];
const SNEHA = [BK011_ALGORITHM_OF_LOVE, BK012_CTRL_ALT_DELETE, BK013_MIDNIGHT_IN_MYSORE];
const FARHAN = [BK014_GHAZAL];

const NOW = new Date('2026-01-15T10:00:00Z');

describe('the royalty figures of one Book', () => {
  it('reports a published Book as it stands', () => {
    expect(bookRoyalty(BK001_WHISPERS)).toEqual({
      copiesSold: 342,
      royaltyEarned: 11970,
      royaltyPaid: 8400,
      royaltyPending: 3570,
      lastPayoutDate: '2025-10-15',
    });
  });

  it('keeps a real zero for a published Book that has not been paid', () => {
    expect(bookRoyalty(BK016_NAGPUR_NOTEBOOKS)).toEqual({
      copiesSold: 34,
      royaltyEarned: 850,
      royaltyPaid: 0,
      royaltyPending: 850,
      lastPayoutDate: null,
    });
  });

  it.each([
    ['BK013', BK013_MIDNIGHT_IN_MYSORE],
    ['BK015', BK015_RAISING_ROOTS],
  ])('reports %s, still in production, as not applicable rather than zero', (_id, book) => {
    expect(bookRoyalty(book)).toEqual({
      copiesSold: null,
      royaltyEarned: null,
      royaltyPaid: null,
      royaltyPending: null,
      lastPayoutDate: null,
    });
  });
});

describe("the totals across an Author's Books", () => {
  it('Kavita: ₹850 from one published Book, and nothing from the Book in production', () => {
    expect(royaltySummary(KAVITA, NOW)).toMatchObject({
      totalEarned: 850,
      totalPaid: 0,
      totalPending: 850,
      lastPayoutDate: null,
    });
  });

  it('Ananya: never paid', () => {
    expect(royaltySummary(ANANYA, NOW)).toMatchObject({
      totalEarned: 2546,
      totalPaid: 0,
      totalPending: 2546,
      lastPayoutDate: null,
    });
  });

  it('Arjun: never paid', () => {
    expect(royaltySummary(ARJUN, NOW)).toMatchObject({
      totalEarned: 2464,
      totalPaid: 0,
      totalPending: 2464,
      lastPayoutDate: null,
    });
  });

  it('Diya: one Book paid and BK018 never paid, so the last Payout comes from the paid Book', () => {
    expect(royaltySummary(DIYA, NOW)).toMatchObject({
      totalEarned: 29115,
      totalPaid: 25000,
      totalPending: 4115,
      lastPayoutDate: '2025-11-15',
    });
  });

  it('Priya: partly paid, with the latest Payout across both Books', () => {
    expect(royaltySummary(PRIYA, NOW)).toMatchObject({
      totalEarned: 19908,
      totalPaid: 16338,
      totalPending: 3570,
      lastPayoutDate: '2025-12-01',
    });
  });

  it('Sneha: BK013 in production adds nothing to the totals', () => {
    expect(royaltySummary(SNEHA, NOW)).toMatchObject({
      totalEarned: 60865,
      totalPaid: 53000,
      totalPending: 7865,
      lastPayoutDate: '2025-11-15',
    });
  });

  it('are not applicable for an Author with only Books in production', () => {
    expect(royaltySummary([BK013_MIDNIGHT_IN_MYSORE, BK015_RAISING_ROOTS], NOW)).toMatchObject({
      totalEarned: null,
      totalPaid: null,
      totalPending: null,
      lastPayoutDate: null,
    });
  });

  it('are not applicable for an Author with no Books', () => {
    expect(royaltySummary([], NOW)).toMatchObject({
      totalEarned: null,
      totalPaid: null,
      totalPending: null,
      lastPayoutDate: null,
    });
  });
});

describe('Below Threshold', () => {
  const withPending = (royaltyPending: number): RoyaltyBook => ({ ...BK016_NAGPUR_NOTEBOOKS, royaltyPending });

  it('Kavita: ₹850 is below ₹1,000', () => {
    expect(royaltySummary(KAVITA, NOW).belowThreshold).toBe(true);
  });

  it.each([
    ['Ananya', ANANYA],
    ['Arjun', ARJUN],
    ['Diya', DIYA],
    ['Priya', PRIYA],
  ])('%s is above the threshold', (_name, books) => {
    expect(royaltySummary(books, NOW).belowThreshold).toBe(false);
  });

  it('applies to the total, not to each Book', () => {
    expect(royaltySummary([withPending(600), withPending(600)], NOW).belowThreshold).toBe(false);
  });

  it('starts just under ₹1,000', () => {
    expect(royaltySummary([withPending(999)], NOW).belowThreshold).toBe(true);
    expect(royaltySummary([withPending(1000)], NOW).belowThreshold).toBe(false);
  });

  it('does not apply when nothing is pending, because nothing rolls over', () => {
    expect(royaltySummary(FARHAN, NOW).belowThreshold).toBe(false);
    expect(royaltySummary([BK015_RAISING_ROOTS], NOW).belowThreshold).toBe(false);
    expect(royaltySummary([], NOW).belowThreshold).toBe(false);
  });
});

describe('the Next Payout Date', () => {
  it.each([
    ['the first moment of Q1', '2026-01-01T00:00:00Z', '2026-05-15'],
    ['the last moment of Q1', '2026-03-31T23:59:59Z', '2026-05-15'],
    ['the first moment of Q2', '2026-04-01T00:00:00Z', '2026-08-14'],
    ['the last day of Q2', '2026-06-30T12:00:00Z', '2026-08-14'],
    ['the first day of Q3', '2026-07-01T12:00:00Z', '2026-11-14'],
    ['the last day of Q3', '2026-09-30T12:00:00Z', '2026-11-14'],
    ['the first day of Q4, which falls in the next year', '2026-10-01T12:00:00Z', '2027-02-14'],
    ['the last moment of Q4', '2026-12-31T23:59:59Z', '2027-02-14'],
  ])('on %s', (_moment, now, expected) => {
    expect(royaltySummary(KAVITA, new Date(now)).nextPayoutDate).toBe(expected);
  });

  it('is known even for an Author with no Books', () => {
    expect(royaltySummary([], NOW).nextPayoutDate).toBe('2026-05-15');
  });

  describe("while the previous quarter's window is open", () => {
    const paidOn = (date: string): RoyaltyBook => ({ ...BK001_WHISPERS, lastPayoutDate: new Date(date) });
    const neverPaid = (royaltyPending: number): RoyaltyBook => ({ ...BK005_BETWEEN_TWO_TEMPLES, royaltyPending });
    const IN_Q3_WINDOW = new Date('2026-11-05T10:00:00Z');

    it.each([
      ['the last moment of Q3, when Q2 2026 is long closed', '2026-09-30T23:59:59Z', '2026-11-14'],
      ['the first moment of Q4', '2026-10-01T00:00:00Z', '2026-11-14'],
      ['the last moment of the 45th day', '2026-11-14T23:59:59Z', '2026-11-14'],
      ['the first moment after the window', '2026-11-15T00:00:00Z', '2027-02-14'],
      ['a window that runs into the next year', '2027-01-15T10:00:00Z', '2027-02-14'],
      ['the day after that one closes', '2027-02-15T10:00:00Z', '2027-05-15'],
    ])('an Author who is owed a Payout, on %s', (_moment, now, expected) => {
      expect(royaltySummary(ANANYA, new Date(now)).nextPayoutDate).toBe(expected);
    });

    it.each([
      ['Priya', PRIYA],
      ['Diya', DIYA],
      ['Sneha', SNEHA],
    ])('%s, who has money pending and no Payout since that quarter ended', (_name, books) => {
      expect(royaltySummary(books, IN_Q3_WINDOW).nextPayoutDate).toBe('2026-11-14');
    });

    it.each([
      ['Kavita, who is Below Threshold', KAVITA],
      ['Farhan, who has nothing pending', FARHAN],
      ['an Author with no published Book', [BK013_MIDNIGHT_IN_MYSORE]],
      ['an Author with no Books', []],
    ])("skips that quarter for %s, who has no Payout coming in it", (_name, books) => {
      expect(royaltySummary(books, IN_Q3_WINDOW).nextPayoutDate).toBe('2027-02-14');
    });

    it('goes by the total pending across Books, starting at the threshold', () => {
      expect(royaltySummary([neverPaid(1000)], IN_Q3_WINDOW).nextPayoutDate).toBe('2026-11-14');
      expect(royaltySummary([neverPaid(999)], IN_Q3_WINDOW).nextPayoutDate).toBe('2027-02-14');
      expect(royaltySummary([neverPaid(600), neverPaid(600)], IN_Q3_WINDOW).nextPayoutDate).toBe('2026-11-14');
    });

    it('treats a Payout made after that quarter ended as covering it', () => {
      expect(royaltySummary([paidOn('2026-10-20')], IN_Q3_WINDOW).nextPayoutDate).toBe('2027-02-14');
      expect(royaltySummary([paidOn('2026-10-01')], IN_Q3_WINDOW).nextPayoutDate).toBe('2027-02-14');
    });

    it("doesn't treat a Payout on that quarter's last day as covering it", () => {
      expect(royaltySummary([paidOn('2026-09-30')], IN_Q3_WINDOW).nextPayoutDate).toBe('2026-11-14');
    });
  });
});

describe('Overdue', () => {
  // On this date the last window to have closed is Q3 2025's, which ended on 14 November 2025.
  it.each([
    ['Ananya, never paid', ANANYA, true],
    ['Arjun, never paid', ARJUN, true],
    ['Diya, paid on 15 November', DIYA, false],
    ['Priya, paid on 1 December', PRIYA, false],
    ['Sneha, paid on 15 November', SNEHA, false],
    ['Kavita, who is Below Threshold', KAVITA, false],
    ['Farhan, who has nothing pending', FARHAN, false],
  ])('in January 2026: %s', (_author, books, expected) => {
    expect(royaltySummary(books, NOW).overdue).toBe(expected);
  });

  // The sample data's latest Payouts are from late 2025, so the real clock finds most Authors Overdue.
  it.each([
    ['Ananya', ANANYA, true],
    ['Diya', DIYA, true],
    ['Priya', PRIYA, true],
    ['Sneha', SNEHA, true],
    ['Kavita', KAVITA, false],
    ['Farhan', FARHAN, false],
  ])('in November 2026: %s', (_author, books, expected) => {
    expect(royaltySummary(books, new Date('2026-11-05T10:00:00Z')).overdue).toBe(expected);
  });

  it('does not apply to an Author with no published Book', () => {
    expect(royaltySummary([BK013_MIDNIGHT_IN_MYSORE], NOW).overdue).toBe(false);
    expect(royaltySummary([], NOW).overdue).toBe(false);
  });

  it('starts at the threshold, not above it', () => {
    const neverPaid = (royaltyPending: number): RoyaltyBook => ({ ...BK005_BETWEEN_TWO_TEMPLES, royaltyPending });

    expect(royaltySummary([neverPaid(1000)], NOW).overdue).toBe(true);
    expect(royaltySummary([neverPaid(999)], NOW).overdue).toBe(false);
  });

  describe('around the close of a window', () => {
    const paidOn = (date: string): RoyaltyBook => ({ ...BK001_WHISPERS, lastPayoutDate: new Date(date) });

    it('waits until the 45th day is over', () => {
      // Paid in August, so Q2 2025's window is fine. Q3 2025's closes at the end of 14 November.
      const books = [paidOn('2025-08-01')];

      expect(royaltySummary(books, new Date('2025-11-14T23:59:59Z')).overdue).toBe(false);
      expect(royaltySummary(books, new Date('2025-11-15T00:00:00Z')).overdue).toBe(true);
    });

    it('counts a Payout made after the quarter ended, but not one on its last day', () => {
      const justAfterTheWindow = new Date('2025-11-15T00:00:00Z');

      expect(royaltySummary([paidOn('2025-10-01')], justAfterTheWindow).overdue).toBe(false);
      expect(royaltySummary([paidOn('2025-09-30')], justAfterTheWindow).overdue).toBe(true);
    });

    it('counts a Payout made after the window closed', () => {
      // Q2 2026's window closed on 14 August, and this Payout came in October.
      expect(royaltySummary([paidOn('2026-10-20')], new Date('2026-11-05T10:00:00Z')).overdue).toBe(false);
    });

    it("Priya: the Payout of 1 December 2025 holds until Q4 2025's window closes", () => {
      expect(royaltySummary(PRIYA, new Date('2026-02-14T23:59:59Z')).overdue).toBe(false);
      expect(royaltySummary(PRIYA, new Date('2026-02-15T00:00:00Z')).overdue).toBe(true);
    });
  });
});
