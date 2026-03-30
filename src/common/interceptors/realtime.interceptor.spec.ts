import { of } from 'rxjs';
import { RealtimeInterceptor } from './realtime.interceptor.js';

describe('RealtimeInterceptor', () => {
  let interceptor: RealtimeInterceptor;
  let mockGateway: { pushEntityChange: jest.Mock };

  const createMockContext = (
    method: string,
    url: string,
    params: Record<string, string> = {},
  ) =>
    ({
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          method,
          originalUrl: url,
          url,
          params,
        }),
      }),
    }) as any;

  beforeEach(() => {
    mockGateway = {
      pushEntityChange: jest.fn(),
    };
    interceptor = new RealtimeInterceptor(mockGateway as any);
  });

  it('should not emit for GET requests', (done) => {
    const context = createMockContext('GET', '/api/v1/products');
    const callHandler = { handle: () => of({ id: 1 }) };

    interceptor.intercept(context, callHandler as any).subscribe(() => {
      expect(mockGateway.pushEntityChange).not.toHaveBeenCalled();
      done();
    });
  });

  it('should emit entity:changed for POST request', (done) => {
    const context = createMockContext('POST', '/api/v1/products');
    const responseData = { _id: 'abc123', name: 'New Product' };
    const callHandler = { handle: () => of(responseData) };

    interceptor.intercept(context, callHandler as any).subscribe(() => {
      expect(mockGateway.pushEntityChange).toHaveBeenCalledWith({
        entity: 'products',
        action: 'create',
        id: 'abc123',
      });
      done();
    });
  });

  it('should extract entity name from URL correctly', (done) => {
    const context = createMockContext(
      'PUT',
      '/api/v1/orders/507f1f77bcf86cd799439011',
      {
        id: '507f1f77bcf86cd799439011',
      },
    );
    const callHandler = {
      handle: () => of({ _id: '507f1f77bcf86cd799439011' }),
    };

    interceptor.intercept(context, callHandler as any).subscribe(() => {
      expect(mockGateway.pushEntityChange).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'orders' }),
      );
      done();
    });
  });

  it('should map POST to create action', (done) => {
    const context = createMockContext('POST', '/api/v1/items');
    const callHandler = { handle: () => of({ _id: '1' }) };

    interceptor.intercept(context, callHandler as any).subscribe(() => {
      expect(mockGateway.pushEntityChange).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create' }),
      );
      done();
    });
  });

  it('should map PUT to update action', (done) => {
    const context = createMockContext('PUT', '/api/v1/items/123', {
      id: '123',
    });
    const callHandler = { handle: () => of({}) };

    interceptor.intercept(context, callHandler as any).subscribe(() => {
      expect(mockGateway.pushEntityChange).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'update' }),
      );
      done();
    });
  });

  it('should map DELETE to delete action', (done) => {
    const context = createMockContext('DELETE', '/api/v1/items/123', {
      id: '123',
    });
    const callHandler = { handle: () => of({}) };

    interceptor.intercept(context, callHandler as any).subscribe(() => {
      expect(mockGateway.pushEntityChange).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'delete' }),
      );
      done();
    });
  });

  it('should use params.id when available', (done) => {
    const context = createMockContext('DELETE', '/api/v1/products/my-id', {
      id: 'my-id',
    });
    const callHandler = { handle: () => of({}) };

    interceptor.intercept(context, callHandler as any).subscribe(() => {
      expect(mockGateway.pushEntityChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'my-id' }),
      );
      done();
    });
  });
});
