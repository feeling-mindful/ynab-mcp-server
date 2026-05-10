import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import * as GetUserTool from '../tools/GetUserTool';

vi.mock('ynab');

describe('GetUserTool', () => {
  let mockApi: {
    user: {
      getUser: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      user: {
        getUser: vi.fn(),
      },
    };

    (ynab.API as any).mockImplementation(() => mockApi);

    process.env.YNAB_API_TOKEN = 'test-token';
  });

  describe('execute', () => {
    const mockUserData = {
      data: {
        user: {
          id: 'user-uuid-123',
        },
      },
    };

    it('should return user info', async () => {
      mockApi.user.getUser.mockResolvedValue(mockUserData);

      const result = await GetUserTool.execute({}, mockApi as any);

      expect(mockApi.user.getUser).toHaveBeenCalled();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('user-uuid-123');
    });

    it('should return error if no token', async () => {
      delete process.env.YNAB_API_TOKEN;

      const result = await GetUserTool.execute({}, mockApi as any);

      expect(result.content[0].text).toBe('YNAB API Token is not set');
    });

    it('should return error on API failure', async () => {
      mockApi.user.getUser.mockRejectedValue(new Error('Unauthorized'));

      const result = await GetUserTool.execute({}, mockApi as any);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.success).toBe(false);
    });
  });
});
