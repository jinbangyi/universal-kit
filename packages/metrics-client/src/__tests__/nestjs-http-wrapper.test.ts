import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import { NestJsHttpWrapper } from '../http-client/nestjs-http-wrapper';
import { Logger } from '@universal-kit/logger';

describe('NestJsHttpWrapper', () => {
  let wrapper: NestJsHttpWrapper;
  let httpService: HttpService;
  let logger: Logger;

  const mockConfig = {
    provider: 'test-api',
    apiKeyHeader: 'x-api-key',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
            put: jest.fn(),
            patch: jest.fn(),
            delete: jest.fn(),
            head: jest.fn(),
            options: jest.fn(),
            request: jest.fn(),
            axiosRef: jest.fn(),
          },
        },
        Logger,
      ],
    }).compile();

    httpService = module.get<HttpService>(HttpService);
    logger = module.get<Logger>(Logger);
    wrapper = new NestJsHttpWrapper(mockConfig, httpService, logger);
  });

  it('should be defined', () => {
    expect(wrapper).toBeDefined();
  });

  describe('HTTP methods', () => {
    const mockResponse: AxiosResponse = {
      data: { result: 'success' },
      status: 200,
      statusText: 'OK',
      headers: { 'content-length': '100' },
      config: {
        url: 'https://api.example.com/test',
        method: 'GET',
        headers: {},
        metadata: {
          startTime: Date.now(),
          requestId: 'test-req-id',
        },
      },
    };

    it('should wrap GET requests', () => {
      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      const result = wrapper.get('https://api.example.com/test');

      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          metadata: expect.objectContaining({
            startTime: expect.any(Number),
            requestId: expect.any(String),
          }),
        })
      );
      expect(result).toBeDefined();
    });

    it('should wrap POST requests', () => {
      const postData = { name: 'test' };
      jest.spyOn(httpService, 'post').mockReturnValue(of(mockResponse));

      const result = wrapper.post('https://api.example.com/test', postData);

      expect(httpService.post).toHaveBeenCalledWith(
        'https://api.example.com/test',
        postData,
        expect.objectContaining({
          metadata: expect.objectContaining({
            startTime: expect.any(Number),
            requestId: expect.any(String),
          }),
        })
      );
      expect(result).toBeDefined();
    });

    it('should wrap PUT requests', () => {
      const putData = { name: 'updated' };
      jest.spyOn(httpService, 'put').mockReturnValue(of(mockResponse));

      const result = wrapper.put('https://api.example.com/test', putData);

      expect(httpService.put).toHaveBeenCalledWith(
        'https://api.example.com/test',
        putData,
        expect.objectContaining({
          metadata: expect.objectContaining({
            startTime: expect.any(Number),
            requestId: expect.any(String),
          }),
        })
      );
      expect(result).toBeDefined();
    });

    it('should wrap PATCH requests', () => {
      const patchData = { name: 'patched' };
      jest.spyOn(httpService, 'patch').mockReturnValue(of(mockResponse));

      const result = wrapper.patch('https://api.example.com/test', patchData);

      expect(httpService.patch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        patchData,
        expect.objectContaining({
          metadata: expect.objectContaining({
            startTime: expect.any(Number),
            requestId: expect.any(String),
          }),
        })
      );
      expect(result).toBeDefined();
    });

    it('should wrap DELETE requests', () => {
      jest.spyOn(httpService, 'delete').mockReturnValue(of(mockResponse));

      const result = wrapper.delete('https://api.example.com/test');

      expect(httpService.delete).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          metadata: expect.objectContaining({
            startTime: expect.any(Number),
            requestId: expect.any(String),
          }),
        })
      );
      expect(result).toBeDefined();
    });

    it('should wrap HEAD requests', () => {
      jest.spyOn(httpService, 'head').mockReturnValue(of(mockResponse));

      const result = wrapper.head('https://api.example.com/test');

      expect(httpService.head).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          metadata: expect.objectContaining({
            startTime: expect.any(Number),
            requestId: expect.any(String),
          }),
        })
      );
      expect(result).toBeDefined();
    });

    it('should wrap OPTIONS requests', () => {
      jest.spyOn(httpService, 'options').mockReturnValue(of(mockResponse));

      const result = wrapper.options('https://api.example.com/test');

      expect(httpService.options).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          metadata: expect.objectContaining({
            startTime: expect.any(Number),
            requestId: expect.any(String),
          }),
        })
      );
      expect(result).toBeDefined();
    });

    it('should wrap generic requests', () => {
      const requestConfig = {
        method: 'GET' as const,
        url: 'https://api.example.com/test',
      };
      jest.spyOn(httpService, 'request').mockReturnValue(of(mockResponse));

      const result = wrapper.request(requestConfig);

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          ...requestConfig,
          metadata: expect.objectContaining({
            startTime: expect.any(Number),
            requestId: expect.any(String),
          }),
        })
      );
      expect(result).toBeDefined();
    });
  });

  describe('skipMetrics option', () => {
    it('should skip metrics when skipMetrics is true', () => {
      const mockResponse: AxiosResponse = {
        data: { result: 'success' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          url: 'https://api.example.com/test',
          method: 'GET',
          headers: {},
          skipMetrics: true,
        },
      };

      jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse));

      wrapper.get('https://api.example.com/test', { skipMetrics: true });

      expect(httpService.get).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          skipMetrics: true,
          metadata: undefined,
        })
      );
    });
  });

  describe('utility methods', () => {
    it('should return the underlying HttpService', () => {
      expect(wrapper.getHttpService()).toBe(httpService);
    });

    it('should return the axiosRef', () => {
      expect(wrapper.axiosRef).toBe(httpService.axiosRef);
    });
  });
});