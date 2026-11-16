import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { isYnabId, matchByName, normalizeName, requireId, resolveId } from '../tools/resolveUtils';

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

  it('never loosely matches a name with no letters or digits', () => {
    const emoji = [{ id: 'm', name: '💰' }, { id: 'b', name: 'Bills' }];
    expect(matchByName(emoji, '💰', 'category_group').id).toBe('m');
    for (const ref of ['-', '???', '🏠']) {
      expect(() => matchByName(emoji, ref, 'category_group')).toThrow(/No category group named/);
    }
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
              { id: 'id-food', name: 'Food', deleted: false, categories: [{ id: 'id-groceries', name: 'Groceries', deleted: false }] },
              { id: 'id-dead', name: 'Dead Group', deleted: true, categories: [{ id: 'id-dead-group', name: 'Dead Group Cat', deleted: false }] },
              { id: 'id-internal', name: 'Internal Master Category', deleted: false, categories: [] },
              { id: 'id-hidden', name: 'Hidden Categories', deleted: false, categories: [] },
              { id: 'id-old', name: 'Old', deleted: false, hidden: true, categories: [{ id: 'id-old-cat', name: 'Old Cat', deleted: false }] },
              { id: 'id-old-twin', name: 'Twin', deleted: false, hidden: true, categories: [] },
              { id: 'id-twin', name: 'Twin', deleted: false, hidden: false, categories: [{ id: 'id-secret', name: 'Secret', deleted: false, hidden: true }] },
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
    ['category_group', 'food', 'id-food', 'categories', 'getCategories'],
  ] as const)('resolves an exact %s name to its ID', async (kind, ref, expected, group, method) => {
    expect(await resolveId(api as any, 'budget-1', kind, ref)).toBe(expected);
    expect((api[group] as Record<string, Mock>)[method]).toHaveBeenCalledWith('budget-1');
  });

  it('never matches closed or deleted accounts, or categories in deleted groups', async () => {
    await expect(resolveId(api as any, 'b', 'account', 'Old Checking')).rejects.toThrow();
    await expect(resolveId(api as any, 'b', 'account', 'Gone')).rejects.toThrow();
    await expect(resolveId(api as any, 'b', 'category', 'Dead Group Cat')).rejects.toThrow();
  });

  it("never matches deleted groups or YNAB's internal groups", async () => {
    await expect(resolveId(api as any, 'b', 'category_group', 'Dead Group')).rejects.toThrow();
    await expect(resolveId(api as any, 'b', 'category_group', 'Internal Master Category')).rejects.toThrow();
    await expect(resolveId(api as any, 'b', 'category_group', 'Hidden Categories')).rejects.toThrow();
  });

  it('never matches a hidden group by name, and a hidden twin does not cause a tie', async () => {
    await expect(resolveId(api as any, 'b', 'category_group', 'Old')).rejects.toThrow();
    expect(await resolveId(api as any, 'b', 'category_group', 'Twin')).toBe('id-twin');
  });

  it('keeps hidden categories for transactions but not for editing', async () => {
    expect(await resolveId(api as any, 'b', 'category', 'Secret')).toBe('id-secret');
    expect(await resolveId(api as any, 'b', 'category', 'Old Cat')).toBe('id-old-cat');
    await expect(resolveId(api as any, 'b', 'editable_category', 'Secret')).rejects.toThrow(/No category named/);
    await expect(resolveId(api as any, 'b', 'editable_category', 'Old Cat')).rejects.toThrow(/No category named/);
    expect(await resolveId(api as any, 'b', 'editable_category', 'groceries')).toBe('id-groceries');
  });

  it('requireId refuses a missing or blank reference', async () => {
    await expect(requireId(api as any, 'b', 'category_group', '  ', 'categoryGroupId')).rejects.toThrow(
      "categoryGroupId is required: pass the category group's ID or name",
    );
    await expect(requireId(api as any, 'b', 'category_group', undefined, 'categoryGroupId')).rejects.toThrow(/is required/);
    expect(await requireId(api as any, 'b', 'category_group', 'food', 'categoryGroupId')).toBe('id-food');
  });

  it('names the kind readably in errors', async () => {
    await expect(resolveId(api as any, 'b', 'category_group', 'Nope')).rejects.toThrow(
      /No category group named "Nope"\. List the category groups to find the right name or ID\./,
    );
  });
});
