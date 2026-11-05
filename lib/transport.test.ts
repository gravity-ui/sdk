import axios, {
    AxiosError,
    type AxiosRequestConfig,
    type AxiosResponse,
    type InternalAxiosRequestConfig,
} from 'axios';

import sdkFactory from './index';

function response(config: InternalAxiosRequestConfig, data: unknown = 'ok'): AxiosResponse {
    return {data, status: 200, statusText: 'OK', headers: {}, config};
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return {promise, resolve};
}

describe('transport contracts', () => {
    test('keeps defaults and returns response data', async () => {
        const adapter = jest.fn(async (config: InternalAxiosRequestConfig) =>
            response(config, {ok: true}),
        );
        const sdk = sdkFactory({axiosConfig: {adapter}});

        await expect(sdk({url: '/test'})).resolves.toEqual({ok: true});
        expect(adapter.mock.calls[0][0]).toMatchObject({
            method: 'post',
            timeout: 60000,
            withCredentials: true,
            xsrfCookieName: '',
        });
    });

    test('keeps config precedence and replaces request headers with option headers', async () => {
        const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => response(config));
        const sdk = sdkFactory({
            axiosConfig: {
                adapter,
                timeout: 100,
                withCredentials: false,
                xsrfCookieName: 'custom',
                headers: {'x-default': 'default'},
            },
        });

        await sdk({url: '/test', timeout: 200, headers: {'x-request': 'request'}});
        await sdk(
            {url: '/test', timeout: 200, headers: {'x-request': 'request'}},
            {timeout: 0, headers: {'x-option': 'option'}},
        );

        expect(adapter.mock.calls[0][0]).toMatchObject({timeout: 200});
        expect(adapter.mock.calls[0][0].headers.get('x-request')).toBe('request');
        const config = adapter.mock.calls[1][0];
        expect(config).toMatchObject({
            timeout: 0,
            withCredentials: false,
            xsrfCookieName: 'custom',
        });
        expect(config.headers.get('x-default')).toBe('default');
        expect(config.headers.get('x-option')).toBe('option');
        expect(config.headers.has('x-request')).toBe(false);
    });

    test('isolates default headers and CSRF tokens between SDK instances', async () => {
        const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => response(config));
        const first = sdkFactory({axiosConfig: {adapter}});
        const second = sdkFactory({axiosConfig: {adapter}});
        first.setDefaultHeader({name: 'x-sdk-test', value: 'first'});
        first.setLang('ru');
        first.setCSRFToken('secret');

        await first({url: '/test'});
        await second({url: '/test'});

        const firstHeaders = adapter.mock.calls[0][0].headers;
        expect(firstHeaders.get('x-sdk-test')).toBe('first');
        expect(firstHeaders.get('accept-language')).toBe('ru');
        expect(firstHeaders.get('x-csrf-token')).toBe('secret');
        const secondHeaders = adapter.mock.calls[1][0].headers;
        expect(secondHeaders.has('x-sdk-test')).toBe(false);
        expect(secondHeaders.has('accept-language')).toBe(false);
        expect(secondHeaders.has('x-csrf-token')).toBe(false);
        expect(axios.defaults.headers.common['x-sdk-test']).toBeUndefined();
        expect(axios.defaults.headers.post['X-CSRF-Token']).toBeUndefined();
    });

    test.each(['get', 'head', 'post', 'put', 'delete', 'patch'])(
        'keeps CSRF method selection for %s',
        async (method) => {
            const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => response(config));
            const sdk = sdkFactory({axiosConfig: {adapter}, csrfToken: 'secret'});

            await sdk({url: '/test', method});

            expect(adapter.mock.calls[0][0].headers.get('x-csrf-token')).toBe(
                ['post', 'put', 'delete'].includes(method) ? 'secret' : undefined,
            );
        },
    );

    test('sets default headers only for the selected methods', async () => {
        const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => response(config));
        const sdk = sdkFactory({axiosConfig: {adapter}});
        sdk.setDefaultHeader({name: 'x-method', value: 'selected', methods: ['post', 'PUT']});

        for (const method of ['post', 'put', 'get']) {
            await sdk({url: '/test', method});
        }

        expect(adapter.mock.calls.map(([config]) => config.headers.get('x-method'))).toEqual([
            'selected',
            'selected',
            undefined,
        ]);
    });

    test.each(['response', 'json', 'raw'] as const)(
        'passes the %s error representation and all four arguments to the handler',
        async (kind) => {
            const error = new Error('failed');
            const errorData = {status: 403, data: {code: 'FORBIDDEN'}};
            const thrown =
                kind === 'response'
                    ? Object.assign(error, {response: errorData, toJSON: () => ({ignored: true})})
                    : kind === 'json'
                    ? Object.assign(error, {toJSON: () => errorData})
                    : error;
            const handleRequestError = jest.fn((..._args: unknown[]) => 'recovered');
            const sdk = sdkFactory({
                axiosConfig: {adapter: async () => Promise.reject(thrown)},
                handleRequestError,
            });

            await expect(sdk({url: '/test'})).resolves.toBe('recovered');
            expect(handleRequestError).toHaveBeenCalledWith(
                kind === 'raw' ? error : errorData,
                expect.any(Function),
                0,
                expect.objectContaining({message: 'failed'}),
            );
            expect(handleRequestError.mock.calls[0][3]).not.toBe(error);
        },
    );

    test('keeps the handler retry callback and retry counter', async () => {
        const adapter = jest.fn(async () => {
            throw new AxiosError('offline', 'ERR_NETWORK');
        });
        const handleRequestError = jest.fn(
            (_error: unknown, retry?: () => Promise<unknown>, retries?: number): unknown =>
                retries === 0 ? retry!() : Promise.resolve('fallback'),
        );
        const sdk = sdkFactory({axiosConfig: {adapter}, handleRequestError});

        await expect(sdk({url: '/test'})).resolves.toBe('fallback');
        expect(adapter).toHaveBeenCalledTimes(2);
        expect(handleRequestError.mock.calls.map((call) => call[2])).toEqual([0, 1]);
    });

    test('preserves normalized gateway errors', async () => {
        const sdk = sdkFactory({
            axiosConfig: {
                adapter: async () => {
                    throw {response: {data: {status: 403, code: 'FORBIDDEN', message: 'Denied'}}};
                },
            },
        });

        await expect(sdk({url: '/test'})).rejects.toMatchObject({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Denied',
        });
    });

    test.each([null, undefined])(
        'passes a nullish retry-hook error (%p) to the handler',
        async (error) => {
            const handleRequestError = jest.fn((..._args: unknown[]) => 'recovered');
            const sdk = sdkFactory({
                axiosConfig: {
                    adapter: async (config) => {
                        throw new AxiosError('offline', 'ERR_NETWORK', config);
                    },
                    'axios-retry': {
                        retries: 1,
                        retryCondition: () => {
                            throw error;
                        },
                    },
                } as AxiosRequestConfig,
                handleRequestError,
            });

            await expect(sdk({url: '/test'})).resolves.toBe('recovered');
            expect(handleRequestError).toHaveBeenCalledWith(
                error,
                expect.any(Function),
                0,
                expect.objectContaining({message: 'Unknown error'}),
            );
        },
    );

    test('can cancel a retry started by the custom error handler', async () => {
        const retryStarted = deferred<void>();
        let attempts = 0;
        const adapter = jest.fn((config: InternalAxiosRequestConfig) => {
            if (attempts++ === 0) {
                return Promise.reject(new AxiosError('offline', 'ERR_NETWORK', config));
            }
            return new Promise<AxiosResponse>((_resolve, reject) => {
                config.cancelToken!.promise.then(reject);
                retryStarted.resolve();
            });
        });
        const handleRequestError = jest.fn((_error: unknown, retry?: () => Promise<unknown>) =>
            retry!(),
        );
        const sdk = sdkFactory({axiosConfig: {adapter}, handleRequestError});
        const request = sdk({url: '/test'}, {concurrentId: 'shared'});
        const result = request.catch((error) => error);
        await retryStarted.promise;

        request.cancel();

        expect(sdk.isCancel(await result)).toBe(true);
        expect(adapter).toHaveBeenCalledTimes(2);
        expect(handleRequestError).toHaveBeenCalledTimes(1);
    });

    test.each(['promise', 'id', 'replacement'])(
        'keeps cancellation via %s after replacing a concurrent request',
        async (cancelVia) => {
            const starts = [deferred<void>(), deferred<void>(), deferred<void>()];
            let started = 0;
            const handleRequestError = jest.fn();
            const adapter = jest.fn(
                (config: InternalAxiosRequestConfig) =>
                    new Promise<AxiosResponse>((_resolve, reject) => {
                        config.cancelToken!.promise.then(reject);
                        starts[started++].resolve();
                    }),
            );
            const sdk = sdkFactory({axiosConfig: {adapter}, handleRequestError});
            const first = sdk({url: '/first'}, {concurrentId: 'shared'}).catch((error) => error);
            await starts[0].promise;
            const second = sdk({url: '/second'}, {concurrentId: 'shared'});
            const secondResult = second.catch((error) => error);
            await starts[1].promise;
            expect(sdk.isCancel(await first)).toBe(true);

            if (cancelVia === 'promise') {
                second.cancel();
            } else if (cancelVia === 'id') {
                sdk.cancelRequest('shared');
            } else {
                const third = sdk({url: '/third'}, {concurrentId: 'shared'});
                const thirdResult = third.catch((error) => error);
                await starts[2].promise;
                third.cancel();
                expect(sdk.isCancel(await thirdResult)).toBe(true);
            }

            const error = await secondResult;
            expect(sdk.isCancel(error)).toBe(true);
            expect(axios.isCancel(error.error)).toBe(true);
            expect(handleRequestError).not.toHaveBeenCalled();
        },
    );

    test('keeps the caller signal alongside SDK cancellation', async () => {
        const controller = new AbortController();
        const started = deferred<InternalAxiosRequestConfig>();
        const finish = deferred<void>();
        const handleRequestError = jest.fn();
        const sdk = sdkFactory({
            axiosConfig: {
                adapter: async (config) => {
                    started.resolve(config);
                    await finish.promise;
                    return response(config);
                },
            },
            handleRequestError,
        });
        const request = sdk({url: '/test'}, {signal: controller.signal});
        const result = request.catch((error) => error);
        const config = await started.promise;
        expect(config.signal).toBe(controller.signal);
        expect(config.cancelToken).toBeDefined();

        controller.abort();
        finish.resolve();

        expect(sdk.isCancel(await result)).toBe(true);
        expect(handleRequestError).not.toHaveBeenCalled();
    });
});
