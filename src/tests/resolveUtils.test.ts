import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { isYnabId, matchByName, normalizeName, resolveId } from '../tools/resolveUtils';

describe('normalizeName', () => {
  it.each([
    ['🛒 Groceries', 'groceries'],
    ['  Dining   Out! ', 'dining out'],
    ['Café', 'cafe'],
    ['Emergency Fund 2026', 'emergency fund 2026'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});

describe('matchByName', () => {
  const items = [
    { id: 'g', name: '🛒 Groceries' },
    { id: 'd1', name: 'Dining' },
    { id: 'd2', name: 'Dining Out' },
    { id: 'c1', name: 'Ally Checking' },
    { id: 'c2', name: 'ally checking' },
  ];

  it('prefers an exact name, even when a looser match also exists', () => {
    expect(matchByName(items, 'ally checking', 'account').id).toBe('c2');
  });

  it('matches ignoring case, spacing and emoji', () => {
    expect(matchByName(items, 'groceries', 'category').id).toBe('g');
    expect(matchByName(items, 'DINING  out', 'category').id).toBe('d2');
  });

  it('refuses a tie and lists both candidates with IDs', () => {
    expect(() => matchByName(items, 'ALLY CHECKING', 'account')).toThrow(
      /More than one account is named "ALLY CHECKING": "Ally Checking" \(c1\), "ally checking" \(c2\)/,
    );
  });

  it('never picks a partial match, but suggests it', () => {
    expect(() => matchByName(items, 'Grocer', 'category')).toThrow(/No category named "Grocer"\. Did you mean: "🛒 Groceries" \(g\)\?/);
  });

  it('points to the list tool when nothing is close', () => {
    expect(() => matchByName(items, 'Mortgage', 'category')).toThrow(/List the categories to find the right name or ID\./);
  });

  it('caps suggestions at five', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, name: `Savings ${i}` }));
    const error = (() => { try { matchByName(many, 'Savings', 'account'); } catch (e) { return (e as Error).message; } })();
    expect(error?.match(/\(s\d\)/g)).toHaveLength(5);
  });
});

const ACCOUNT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('isYnabId', () => {
  it('recognizes YNAB UUIDs, with or without surrounding space', () => {
    expect(isYnabId(ACCOUNT_ID)).toBe(true);
    expect(isYnabId(`  ${ACCOUNT_ID.toUpperCase()} `)).toBe(true);
  });

  it('treats anything else as a name', () => {
    expect(isYnabId('Ally Checking')).toBe(false);
    expect(isYnabId('account-123')).toBe(false);
  });
});

describe('resolveId', () => {
  let api: {
    accounts: { getAccounts: Mock };
    categories: { getCategories: Mock };
    payees: { getPayees: Mock };
  };

  beforeEach(() => {
    api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              { id: 'id-checking', name: 'Ally Checking', deleted: false, closed: false },
              { id: 'id-old', name: 'Old Checking', deleted: false, closed: true },
              { id: 'id-gone', name: 'Gone', deleted: true, closed: false },
            ],
          },
        }),
      },
      categories: {
        getCategories: vi.fn().mockResolvedValue({
          data: {
            category_groups: [
              { deleted: false, categories: [{ id: 'id-groceries', name: 'Groceries', deleted: false }] },
              { deleted: true, categories: [{ id: 'id-dead-group', name: 'Dead Group Cat', deleted: false }] },
            ],
          },
        }),
      },
      payees: {
        getPayees: vi.fn().mockResolvedValue({
          data: { payees: [{ id: 'id-rei', name: 'REI', deleted: false }] },
        }),
      },
    };
  });

  it('passes undefined through without calling YNAB', async () => {
    expect(await resolveId(api as any, 'b', 'account', undefined)).toBeUndefined();
    expect(api.accounts.getAccounts).not.toHaveBeenCalled();
  });

  it('treats an empty or blank value as not set', async () => {
    expect(await resolveId(api as any, 'b', 'account', '   ')).toBeUndefined();
    expect(api.accounts.getAccounts).not.toHaveBeenCalled();
  });

  it('returns an ID as is, trimmed, without calling YNAB', async () => {
    expect(await resolveId(api as any, 'b', 'account', ` ${ACCOUNT_ID} `)).toBe(ACCOUNT_ID);
    expect(api.accounts.getAccounts).not.toHaveBeenCalled();
  });

  it.each([
    ['account', 'Ally Checking', 'id-checking', 'accounts', 'getAccounts'],
    ['category', 'Groceries', 'id-groceries', 'categories', 'getCategories'],
    ['payee', 'REI', 'id-rei', 'payees', 'getPayees'],
  ] as const)('resolves an exact %s name to its ID', async (kind, ref, expected, group, method) => {
    expect(await resolveId(api as any, 'budget-1', kind, ref)).toBe(expected);
    expect((api[group] as Record<string, Mock>)[method]).toHaveBeenCalledWith('budget-1');
  });

  it('never matches closed or deleted accounts, or categories in deleted groups', async () => {
    await expect(resolveId(api as any, 'b', 'account', 'Old Checking')).rejects.toThrow();
    await expect(resolveId(api as any, 'b', 'account', 'Gone')).rejects.toThrow();
    await expect(resolveId(api as any, 'b', 'category', 'Dead Group Cat')).rejects.toThrow();
  });
});
