import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor.js';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<unknown>;

  const mockContext = {} as any;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
  });

  it('should wrap normal response in envelope', (done) => {
    const data = { id: 1, name: 'Test' };
    const callHandler = { handle: () => of(data) };

    interceptor
      .intercept(mockContext, callHandler as any)
      .subscribe((result) => {
        expect(result).toEqual({
          success: true,
          data: { id: 1, name: 'Test' },
          meta: null,
          errors: null,
        });
        done();
      });
  });

  it('should extract items and meta from paginated response', (done) => {
    const paginatedData = {
      items: [{ id: 1 }, { id: 2 }],
      meta: { total: 2, page: 1, limit: 10 },
    };
    const callHandler = { handle: () => of(paginatedData) };

    interceptor
      .intercept(mockContext, callHandler as any)
      .subscribe((result) => {
        expect(result).toEqual({
          success: true,
          data: [{ id: 1 }, { id: 2 }],
          meta: { total: 2, page: 1, limit: 10 },
          errors: null,
        });
        done();
      });
  });

  it('should handle null response data', (done) => {
    const callHandler = { handle: () => of(null) };

    interceptor
      .intercept(mockContext, callHandler as any)
      .subscribe((result) => {
        expect(result).toEqual({
          success: true,
          data: null,
          meta: null,
          errors: null,
        });
        done();
      });
  });

  it('should handle undefined response data', (done) => {
    const callHandler = { handle: () => of(undefined) };

    interceptor
      .intercept(mockContext, callHandler as any)
      .subscribe((result) => {
        expect(result).toEqual({
          success: true,
          data: null,
          meta: null,
          errors: null,
        });
        done();
      });
  });
});
