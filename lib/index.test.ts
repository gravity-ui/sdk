import axios, {type AxiosRequestConfig} from 'axios';
import nock from 'nock';

import {GatewayError} from './models/common';

import sdkFactory from './index';

axios.defaults.adapter = 'http';

const baseSchema = {
    root: {
        rootService: {
            actions: {
                getRoot: {
                    path: () => '/root',
                    method: 'GET' as const,
                },
                getRoot2: {
                    path: () => '/root',
                    method: 'GET' as const,
                },
            },
        },
    },
    tool: {
        toolService: {
            actions: {
                getTool: {
                    path: () => '/tool',
                    method: 'GET' as const,
                },
            },
        },
    },
    rootService: {
        getRoot: {
            actions: {
                testOverride: {
                    path: () => '/testOverride',
                    method: 'GET' as const,
                },
            },
        },
    },
};

const testIf = (condition: boolean) => (condition ? test : test.skip);

describe('sdk', () => {
    beforeEach(() => {
        if (!nock.isActive()) {
            nock.activate();
        }
    });

    afterEach(() => {
        nock.cleanAll();
        nock.restore();
    });

    test('correct calls', async () => {
        const scope = nock('http://localhost');
        const sdk = sdkFactory<typeof baseSchema>();

        let req = sdk.rootService.getRoot();
        scope.post('/api/root/rootService/getRoot').reply(200, 'test');
        expect(await req).toBe('test');

        req = sdk.rootService.getRoot.testOverride();
        scope.post('/api/rootService/getRoot/testOverride').reply(200, 'testOverride');
        expect(await req).toBe('testOverride');

        req = sdk.root.rootService.getRoot();
        scope.post('/api/root/rootService/getRoot').reply(200, 'test 2');
        expect(await req).toBe('test 2');

        req = sdk.root.rootService.getRoot();
        scope.post('/api/root/rootService/getRoot').reply(200, 'test 3');
        expect(await req).toBe('test 3');

        req = sdk.tool.toolService.getTool();
        scope.post('/api/tool/toolService/getTool').reply(200, 'tool test');
        expect(await req).toBe('tool test');

        scope.done();
    });

    test('used through call/apply', async () => {
        const scope = nock('http://localhost');
        const payload = {a: 'test', b: 123};
        const sdk = sdkFactory<typeof baseSchema>();

        let req = sdk.root.rootService.getRoot.apply(null, [payload]);
        scope.post('/api/root/rootService/getRoot').reply(200, function (_uri, requestBody) {
            expect(requestBody).toEqual(payload);
            return 'test';
        });
        expect(await req).toBe('test');

        req = sdk.root.rootService.getRoot.call(null, payload);
        scope.post('/api/root/rootService/getRoot').reply(200, function (_uri, requestBody) {
            expect(requestBody).toEqual(payload);
            return 'test2';
        });
        expect(await req).toBe('test2');

        req = sdk.rootService.getRoot.apply(null, [payload]);
        scope.post('/api/root/rootService/getRoot').reply(200, function (_uri, requestBody) {
            expect(requestBody).toEqual(payload);
            return 'test3';
        });
        expect(await req).toBe('test3');

        req = sdk.rootService.getRoot.call(null, payload);
        scope.post('/api/root/rootService/getRoot').reply(200, function (_uri, requestBody) {
            expect(requestBody).toEqual(payload);
            return 'test4';
        });
        expect(await req).toBe('test4');

        scope.done();
    });

    test('used through bind', async () => {
        const scope = nock('http://localhost');
        const payload = {a: 'test', b: 123};
        const sdk = sdkFactory<typeof baseSchema>();

        let req = sdk.root.rootService.getRoot.bind(null)(payload);
        scope.post('/api/root/rootService/getRoot').reply(200, function (_uri, requestBody) {
            expect(requestBody).toEqual(payload);
            return 'test';
        });
        expect(await req).toBe('test');

        req = sdk.rootService.getRoot.bind(null)(payload);
        scope.post('/api/root/rootService/getRoot').reply(200, function (_uri, requestBody) {
            expect(requestBody).toEqual(payload);
            return 'test2';
        });
        expect(await req).toBe('test2');

        req = sdk.rootService.getRoot.bind(null, payload)();
        scope.post('/api/root/rootService/getRoot').reply(200, function (_uri, requestBody) {
            expect(requestBody).toEqual(payload);
            return 'test3';
        });
        expect(await req).toBe('test3');

        scope.done();
    });

    test('external calls', async () => {
        let scope = nock('http://localhost');
        const payload = {a: 'test', b: 123};
        const sdk = sdkFactory<typeof baseSchema>();

        let req = sdk({data: payload});
        scope.post('/api').reply(200, function (_uri, requestBody) {
            expect(requestBody).toEqual(payload);
            return 'test';
        });
        expect(await req).toBe('test');

        scope.done();

        scope = nock('https://ya.ru');

        req = sdk({data: payload, method: 'GET', url: 'https://ya.ru'});
        scope.get('/').reply(200, function (_uri, requestBody) {
            expect(requestBody).toEqual(payload);
            return 'test2';
        });
        expect(await req).toBe('test2');

        req = sdk({data: payload, method: 'POST', url: 'https://ya.ru'}, {retries: 2});
        scope.post('/').reply(200, function (_uri, requestBody) {
            expect(requestBody).toEqual(payload);
            return 'test3';
        });
        expect(await req).toBe('test3');

        scope.done();
    });

    test('external calls keep axios config without options', async () => {
        const scope = nock('http://localhost', {reqheaders: {'x-custom': 'value'}});
        const sdk = sdkFactory<typeof baseSchema>();

        const req = sdk({url: '/custom', method: 'GET', headers: {'x-custom': 'value'}});
        scope.get('/custom').reply(200, 'test');
        expect(await req).toBe('test');

        scope.done();
    });

    test('retries option overrides axios config', async () => {
        let calls = 0;
        nock('http://localhost')
            .post('/api/root/rootService/getRoot')
            .times(3)
            .reply(() => {
                calls++;
                return [503];
            });
        const sdk = sdkFactory<typeof baseSchema>({
            axiosConfig: {'axios-retry': {retries: 2}} as AxiosRequestConfig,
        });

        await expect(sdk.rootService.getRoot(undefined, {retries: 0})).rejects.toBeDefined();
        expect(calls).toBe(1);
    });

    test('errors calls', async () => {
        const scope = nock('http://localhost');
        const sdk = sdkFactory<typeof baseSchema>();

        try {
            // @ts-expect-error
            await sdk.root.rootServiceNotDefined.getRoot();
        } catch (err) {
            const sdkError = err as GatewayError;
            if (sdkError?.code) {
                expect(sdkError.code).toBe('SDK_REQUEST_ERROR');
            }
        }

        try {
            // @ts-expect-error
            await sdk.rootServiceNotDefined.getRoot();
        } catch (err) {
            const sdkError = err as GatewayError;
            if (sdkError?.code) {
                expect(sdkError.code).toBe('SDK_REQUEST_ERROR');
            }
        }

        try {
            // @ts-expect-error
            await sdk.root.rootService.getRootNotDefined();
        } catch (err) {
            const sdkError = err as GatewayError;
            if (sdkError?.code) {
                expect(sdkError.code).toBe('SDK_REQUEST_ERROR');
            }
        }

        try {
            // @ts-expect-error
            await sdk.rootService.getRootNotDefined();
        } catch (err) {
            const sdkError = err as GatewayError;
            if (sdkError?.code) {
                expect(sdkError.code).toBe('SDK_REQUEST_ERROR');
            }
        }

        try {
            // @ts-expect-error
            await sdk.toolService.getTool();
        } catch (err) {
            const sdkError = err as GatewayError;
            if (sdkError?.code) {
                expect(sdkError.code).toBe('SDK_REQUEST_ERROR');
            }
        }

        expect.assertions(5);

        scope.done();
    });

    test('action memoize', async () => {
        const scope = nock('http://localhost');
        const sdk = sdkFactory<typeof baseSchema>();

        const reqA = sdk.rootService.getRoot();
        scope.post('/api/root/rootService/getRoot').reply(200, 'test');
        expect(await reqA).toBe('test');

        const reqB = sdk.rootService.getRoot2();
        scope.post('/api/root/rootService/getRoot2').reply(200, 'test2');
        expect(await reqB).toBe('test2');

        scope.done();
    });

    test('separate actions memoization for instances', async () => {
        const sdk1 = sdkFactory<typeof baseSchema>();
        const sdk2 = sdkFactory<typeof baseSchema>();

        expect(typeof sdk1.root.rootService.getRoot).toBe('function');
        expect(typeof sdk2.root.rootService.getRoot).toBe('function');

        expect(sdk1.root.rootService.getRoot).toBe(sdk1.root.rootService.getRoot);
        expect(sdk2.root.rootService.getRoot).toBe(sdk2.root.rootService.getRoot);
        expect(sdk1.root.rootService.getRoot).not.toBe(sdk2.root.rootService.getRoot);
    });

    test('action cancelation: cancel method', async () => {
        const sdk = sdkFactory<typeof baseSchema>();

        try {
            const req = sdk.rootService.getRoot();
            req.cancel();
            await req;
        } catch (err) {
            expect(sdk.isCancel(err)).toBe(true);
        }
        expect.hasAssertions();
    });

    testIf(typeof AbortController !== 'undefined')(
        'action cancelation: abort controller',
        async () => {
            const sdk = sdkFactory<typeof baseSchema>();
            try {
                const abortController = new AbortController();
                const req = sdk.rootService.getRoot(undefined, {signal: abortController.signal});
                abortController.abort();
                await req;
            } catch (err) {
                expect(sdk.isCancel(err)).toBe(true);
            }
            expect.hasAssertions();
        },
    );

    testIf(typeof AbortController !== 'undefined')(
        'action cancelation: no retries for cancelled requests',
        async () => {
            const sdk = sdkFactory<typeof baseSchema>();
            const abortController = new AbortController();
            abortController.abort();

            const start = Date.now();
            const error = await sdk.rootService
                .getRoot(undefined, {signal: abortController.signal, retries: 3})
                .catch((err) => err);

            expect(sdk.isCancel(error)).toBe(true);
            // retries use exponential delay, so three of them take more than 700ms
            expect(Date.now() - start).toBeLessThan(500);
        },
    );
});

describe('csrf retry', () => {
    beforeEach(() => {
        if (!nock.isActive()) {
            nock.activate();
        }
    });

    afterEach(() => {
        nock.cleanAll();
        nock.restore();
    });

    const replyWithTokenCheck = (sent: {token: unknown; body: unknown}[]) =>
        function (this: nock.ReplyFnContext, _uri: string, body: nock.Body) {
            const token = this.req.headers['x-csrf-token'];
            sent.push({token, body});
            return token === 'new'
                ? ([200, 'ok'] as const)
                : ([419, {}, {'x-csrf-token': 'new'}] as const);
        };

    test('retries once with the token from the 419 response', async () => {
        const sent: {token: unknown; body: unknown}[] = [];
        const scope = nock('http://localhost')
            .post('/api/root/rootService/getRoot')
            .times(2)
            .reply(replyWithTokenCheck(sent));
        const sdk = sdkFactory<typeof baseSchema>({csrfToken: 'old', updateCsrfEnabled: true});

        expect(await sdk.rootService.getRoot({a: 1})).toBe('ok');
        expect(sent).toEqual([
            {token: 'old', body: {a: 1}},
            {token: 'new', body: {a: 1}},
        ]);
        scope.done();
    });

    test('does not retry twice', async () => {
        const scope = nock('http://localhost')
            .post('/api/root/rootService/getRoot')
            .times(2)
            .reply(419, {}, {'x-csrf-token': 'old'});
        const sdk = sdkFactory<typeof baseSchema>({csrfToken: 'old', updateCsrfEnabled: true});

        await expect(sdk.rootService.getRoot()).rejects.toBeDefined();
        scope.done();
    });

    test('updates plain object headers', async () => {
        const sent: {token: unknown; body: unknown}[] = [];
        const scope = nock('http://localhost')
            .post('/api/root/rootService/getRoot')
            .times(2)
            .reply(replyWithTokenCheck(sent));
        const sdk = sdkFactory<typeof baseSchema>({
            csrfToken: 'old',
            updateCsrfEnabled: true,
            axiosInterceptors: [
                {
                    service: 'rootService',
                    interceptors: {
                        responseInterceptorError: async (error) => {
                            error.config.headers = {...error.config.headers.toJSON()};
                            throw error;
                        },
                    },
                },
            ],
        });

        expect(await sdk.rootService.getRoot()).toBe('ok');
        expect(sent.map(({token}) => token)).toEqual(['old', 'new']);
        scope.done();
    });
});

describe('axios interceptors', () => {
    beforeEach(() => {
        if (!nock.isActive()) {
            nock.activate();
        }
    });

    afterEach(() => {
        nock.cleanAll();
        nock.restore();
    });

    const createInterceptors = (calls: string[]) => ({
        requestInterceptorSuccess: async (config: any) => {
            calls.push(`request ${config.url}`);
            return config;
        },
        responseInterceptorSuccess: async (response: any) => {
            calls.push(`response ${response.config.url}`);
            return response;
        },
    });

    test.each([
        ['default endpoint', '/api'],
        ['nested endpoint', '/gateway/api'],
        ['absolute endpoint', 'http://localhost/api'],
    ])('applied with %s', async (_name, endpoint) => {
        const calls: string[] = [];
        const url = `${endpoint}/tool/toolService/getTool`;
        const scope = nock('http://localhost')
            .post(url.replace('http://localhost', ''))
            .reply(200, 'test');
        const sdk = sdkFactory<typeof baseSchema>({
            endpoint,
            axiosInterceptors: [
                {scope: 'tool', service: 'toolService', interceptors: createInterceptors(calls)},
                {service: 'toolService', interceptors: createInterceptors(calls)},
            ],
        });

        expect(await sdk.tool.toolService.getTool()).toBe('test');
        expect(calls).toEqual([`request ${url}`, `response ${url}`]);
        scope.done();
    });

    test('applied to root services with dashes in names', async () => {
        const calls: string[] = [];
        const scope = nock('http://localhost').post('/api/root/my-service/my-action').reply(200);
        const sdk = sdkFactory<any>({
            axiosInterceptors: [{service: 'my-service', interceptors: createInterceptors(calls)}],
        });

        await sdk['my-service']['my-action']();
        expect(calls).toHaveLength(2);
        scope.done();
    });

    test('applied to base sdk calls by url', async () => {
        const calls: string[] = [];
        const scope = nock('http://localhost').post('/api/root/rootService/getRoot').reply(200);
        const sdk = sdkFactory<typeof baseSchema>({
            axiosInterceptors: [{service: 'rootService', interceptors: createInterceptors(calls)}],
        });

        await sdk({url: '/api/root/rootService/getRoot'});
        expect(calls).toHaveLength(2);
        scope.done();
    });
});
