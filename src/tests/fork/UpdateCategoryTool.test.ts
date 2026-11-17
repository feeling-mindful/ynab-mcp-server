import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as UpdateCategoryTool from '../../fork/tools/UpdateCategoryTool';

const mockYnabFetch = vi.fn();

vi.mock('../../fork/tools/apiUtils.js', () => ({
  ynabFetch: (...args: any[]) => mockYnabFetch(...args),
}));

const CAT_ID = 'cccccccc-0000-4000-8000-000000000001';
const GROUP_ID = 'dddddddd-0000-4000-8000-000000000001';
const PATH = `/plans/test-budget-id/categories/${CAT_ID}`;

const cat = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, deleted: false, hidden: false, ...extra });
const group = (id: string, name: string, categories: unknown[], extra: Record<string, unknown> = {}) => ({ id, name, deleted: false, hidden: false, categories, ...extra });

const mockApi = { categories: { getCategories: vi.fn() } };

const groups = {
  data: {
    category_groups: [
      group('g-internal', 'Internal Master Category', [cat('c-uncat', 'Uncategorized'), cat('c-rta', 'Inflow: Ready to Assign')]),
      group(GROUP_ID, 'Bills', [cat('c-rent', 'Rent'), cat('c-gym-hidden', 'Gym', { hidden: true })]),
      group('g-fun', 'Fun', [cat(CAT_ID, '🎬 Movies'), cat('c-gym', 'Gym')]),
      group('g-old', 'Old', [cat('c-old', 'Old Stuff')], { hidden: true }),
    ],
  },
};

const updated = {
  data: {
    category: {
      id: CAT_ID,
      name: 'Updated Category',
      category_group_id: GROUP_ID,
      category_group_name: 'Bills',
      note: 'New note',
      goal_type: 'NEED',
      goal_target: 1000000,
      goal_target_date: '2024-12-01',
    },
  },
};

const run = async (input: Record<string, unknown>) => {
  const result = await UpdateCategoryTool.execute(input as any, mockApi as any);
  return JSON.parse(result.content[0].text);
};

describe('UpdateCategoryTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.categories.getCategories.mockResolvedValue(groups);
    mockYnabFetch.mockResolvedValue(updated);
    process.env.YNAB_BUDGET_ID = 'test-budget-id';
  });

  it('sends every provided field using the names YNAB accepts', async () => {
    const parsed = await run({
      categoryId: CAT_ID,
      name: 'Updated Category',
      note: 'New note',
      goalTarget: 1000,
      goalTargetDate: '2024-12-01',
    });

    expect(mockYnabFetch).toHaveBeenCalledWith(PATH, {
      method: 'PATCH',
      body: { category: { name: 'Updated Category', note: 'New note', goal_target: 1000000, goal_target_date: '2024-12-01' } },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.category).toMatchObject({ goal_target: '1000.00', goal_target_date: '2024-12-01', goal_type: 'NEED' });
  });

  it('sends only provided fields', async () => {
    await run({ categoryId: CAT_ID, name: 'Renamed' });
    expect(mockYnabFetch).toHaveBeenCalledWith(PATH, { method: 'PATCH', body: { category: { name: 'Renamed' } } });
  });

  it('sends a goal target of 0, which removes the target', async () => {
    await run({ categoryId: CAT_ID, goalTarget: 0 });
    expect(mockYnabFetch).toHaveBeenCalledWith(PATH, { method: 'PATCH', body: { category: { goal_target: 0 } } });
  });

  it('no longer offers goalType or goalTargetMonth, which YNAB ignores', () => {
    expect(UpdateCategoryTool.inputSchema).not.toHaveProperty('goalType');
    expect(UpdateCategoryTool.inputSchema).not.toHaveProperty('goalTargetMonth');
    expect(UpdateCategoryTool.inputSchema.goalTarget.safeParse(-1).success).toBe(false);
    expect(UpdateCategoryTool.inputSchema.goalTargetDate.safeParse('2024-12').success).toBe(false);
  });

  it('errors when no fields are provided', async () => {
    const parsed = await run({ categoryId: CAT_ID });
    expect(parsed.success).toBe(false);
    expect(mockYnabFetch).not.toHaveBeenCalled();
  });

  it('downloads the category tree once when both the category and the group are names', async () => {
    const parsed = await run({ categoryId: 'movies', categoryGroupId: 'bills' });

    expect(parsed.success).toBe(true);
    expect(mockApi.categories.getCategories).toHaveBeenCalledTimes(1);
    expect(mockYnabFetch).toHaveBeenCalledWith(PATH, { method: 'PATCH', body: { category: { category_group_id: GROUP_ID } } });
  });

  it('moves a category to another group by ID without looking anything up', async () => {
    const parsed = await run({ categoryId: CAT_ID, categoryGroupId: GROUP_ID });

    expect(mockApi.categories.getCategories).not.toHaveBeenCalled();
    expect(mockYnabFetch).toHaveBeenCalledWith(PATH, { method: 'PATCH', body: { category: { category_group_id: GROUP_ID } } });
    expect(parsed.category.category_group_id).toBe(GROUP_ID);
    expect(parsed.category.category_group_name).toBe('Bills');
  });

  it('accepts the category and the target group by name', async () => {
    await run({ categoryId: 'movies', categoryGroupId: 'bills' });
    expect(mockYnabFetch).toHaveBeenCalledWith(PATH, { method: 'PATCH', body: { category: { category_group_id: GROUP_ID } } });
  });

  it('resolves a name shared with a hidden category to the visible one', async () => {
    await run({ categoryId: 'Gym', name: 'Fitness' });
    expect(mockYnabFetch).toHaveBeenCalledWith('/plans/test-budget-id/categories/c-gym', expect.anything());
  });

  it.each([
    ['an internal category', 'uncategorized'],
    ['Ready to Assign', 'Inflow: Ready to Assign'],
    ['a category in a hidden group', 'Old Stuff'],
  ])('refuses %s by name without writing', async (_label, ref) => {
    const parsed = await run({ categoryId: ref, name: 'X' });
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('No category named');
    expect(mockYnabFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown group', 'Nope', 'No category group named "Nope"'],
    ['a hidden group', 'Old', 'No category group named "Old"'],
    ['an internal group', 'Internal Master Category', 'No category group named'],
    ['a blank group', '  ', 'categoryGroupId is blank'],
  ])('refuses %s as the move target without writing', async (_label, ref, message) => {
    const parsed = await run({ categoryId: CAT_ID, categoryGroupId: ref, name: 'X' });
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain(message);
    expect(mockYnabFetch).not.toHaveBeenCalled();
  });

  it('refuses a blank categoryId without writing', async () => {
    const parsed = await run({ categoryId: ' ', name: 'X' });
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('categoryId is required');
    expect(mockYnabFetch).not.toHaveBeenCalled();
  });

  it('returns the error on API failure', async () => {
    mockYnabFetch.mockRejectedValue(new Error('Update failed'));
    const parsed = await run({ categoryId: CAT_ID, name: 'Test' });
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Update failed');
  });
});
