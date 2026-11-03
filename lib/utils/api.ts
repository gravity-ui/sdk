import axios, {
    type AxiosError,
    type AxiosInstance,
    type AxiosRequestConfig,
    type CancelTokenSource,
    type HeadersDefaults,
} from 'axios';
import axiosRetry from 'axios-retry';

import type {GatewayError} from '../models/common';

import {parseError} from './common';

// Symbols are not preserved in the Axios config
const csrfRetryKey = '__ CSRF retry';
export const scopeServicePathKey = '__ SDK scope/service path';

const urlRegexp = /\/(?<api>\w+)\/(?<scope>\w+)\/(?<service>\w+)\/(?<action>\w+)/i;

export interface AxiosInterceptors {
    requestInterceptorSuccess?: (config: any) => Promise<any>;
    requestInterceptorError?: (error: any) => Promise<any>;
    responseInterceptorSuccess?: (data: any) => Promise<any>;
    responseInterceptorError?: (error: any) => Promise<any>;
}

type ServicesWithAxiosInterceptors = Record<string, AxiosInterceptors[]>;

export type ApiOptions = {
    config?: AxiosRequestConfig;
    csrfHeaderName?: string;
    updateCsrfEnabled?: boolean;
    axiosInterceptors?: ServicesWithAxiosInterceptors;
};

type RequestParams = {
    method: AxiosRequestConfig['method'];
    url: string;
    data?: unknown;
    params?: AxiosRequestConfig['params'];
    retries?: number;
    options?: {
        concurrentId?: string;
        timeout?: number;
        headers?: AxiosRequestConfig['headers'];
        requestConfig?: AxiosRequestConfig;
        onDownloadProgress?: AxiosRequestConfig['onDownloadProgress'];
    };
};

export function createScopeServicePath(service: string, scope?: string): string {
    return `${scope ?? 'root'}/${service}`;
}

export function getScopeServicePath(url: string): string {
    const groups = url.match(urlRegexp)?.groups;

    return groups ? createScopeServicePath(groups.service, groups.scope) : '';
}

type InterceptorsChainParams = {
    config?: {url?: string; [scopeServicePathKey]?: string};
    axiosInterceptors?: ServicesWithAxiosInterceptors;
    queryData: any;
    success: boolean;
    interceptorSelector: (
        interceptors: AxiosInterceptors,
    ) => ((data: any) => Promise<any>) | undefined;
};

export function makeInterceptorsChain({
    config,
    axiosInterceptors,
    queryData,
    success,
    interceptorSelector,
}: InterceptorsChainParams): Promise<any> {
    let result: Promise<any> = success ? Promise.resolve(queryData) : Promise.reject(queryData);

    const path = config?.[scopeServicePathKey] ?? (config?.url && getScopeServicePath(config.url));

    if (!path) {
        return result;
    }

    for (const interceptors of axiosInterceptors?.[path] || []) {
        const interceptor = interceptorSelector(interceptors);

        if (interceptor) {
            result = success
                ? result.then(async (data) => await interceptor(data))
                : result.catch(async (data) => await interceptor(data));
        }
    }

    return result;
}

export default class Api {
    private readonly _axios: AxiosInstance;
    private readonly requestTokens = new Map<string, CancelTokenSource>();
    private readonly csrfHeaderName: string;

    constructor(
        {
            config,
            csrfHeaderName = 'X-CSRF-Token',
            updateCsrfEnabled,
            axiosInterceptors,
        }: ApiOptions = {},
        handleRequestError?: (error: unknown) => any,
    ) {
        this._axios = axios.create({
            xsrfCookieName: '',
            timeout: 60000,
            withCredentials: true,
            ...config,
        });
        this.csrfHeaderName = csrfHeaderName;

        const requestSuccess = (config: any) => {
            return makeInterceptorsChain({
                config,
                axiosInterceptors,
                queryData: config,
                success: true,
                interceptorSelector: (interceptors) => interceptors.requestInterceptorSuccess,
            });
        };

        const requestError = (error: any) => {
            return makeInterceptorsChain({
                config: error?.config,
                axiosInterceptors,
                queryData: error,
                success: false,
                interceptorSelector: (interceptors) => interceptors.requestInterceptorError,
            });
        };

        const responseSuccess = (data: any) => {
            return makeInterceptorsChain({
                config: data?.config,
                axiosInterceptors,
                queryData: data,
                success: true,
                interceptorSelector: (interceptors) => interceptors.responseInterceptorSuccess,
            });
        };

        const responseError = (error: any) => {
            let result: Promise<any> = makeInterceptorsChain({
                config: error?.config,
                axiosInterceptors,
                queryData: error,
                success: false,
                interceptorSelector: (interceptors) => interceptors.responseInterceptorError,
            });

            if (updateCsrfEnabled) {
                result = result.catch(async (error) => {
                    const {config} = error;

                    if (config && !config[csrfRetryKey] && error.response?.status === 419) {
                        const csrfHeaderName = (
                            this.csrfHeaderName || 'x-csrf-token'
                        ).toLowerCase();

                        const newToken = error.response.headers[csrfHeaderName];

                        if (newToken) {
                            this.setCSRFToken(newToken);
                            // Retry headers override defaults: replace the stale token here.
                            // Callers may use AxiosHeaders from another Axios module instance.
                            if (typeof config.headers?.set === 'function') {
                                config.headers.set(this.csrfHeaderName, newToken);
                            } else {
                                config.headers = Object.fromEntries(
                                    Object.entries(config.headers ?? {}).filter(
                                        ([name]) => name.toLowerCase() !== csrfHeaderName,
                                    ),
                                );
                                config.headers[this.csrfHeaderName] = newToken;
                            }
                        }

                        return this._axios({
                            ...config,
                            // data is already serialized by the first attempt
                            transformRequest: [(data: unknown) => data],
                            [csrfRetryKey]: true,
                        });
                    }

                    return Promise.reject(error);
                });
            }

            return result;
        };

        this._axios.interceptors.request.use(requestSuccess, requestError);
        this._axios.interceptors.response.use(responseSuccess, responseError);

        axiosRetry(this._axios, {
            retries: 0,
            retryDelay: axiosRetry.exponentialDelay,
            retryCondition: (error) => {
                if (!error.config || error.code === 'ERR_CANCELED') {
                    return false;
                }

                return axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error);
            },
        });

        if (typeof handleRequestError === 'function') {
            this.handleRequestError = handleRequestError;
        }
    }

    setCSRFToken(token: string) {
        for (const method of ['post', 'put', 'delete'] as const) {
            this._axios.defaults.headers[method][this.csrfHeaderName] = token;
        }
    }

    setDefaultHeader({name, value, methods}: {name: string; value: string; methods?: string[]}) {
        const headers = this._axios.defaults.headers;

        if (Array.isArray(methods)) {
            for (const method of methods) {
                const key = method.toLowerCase() as keyof HeadersDefaults;
                if (Object.prototype.hasOwnProperty.call(headers, key)) {
                    const methodHeaders = headers[key];
                    if (methodHeaders) {
                        methodHeaders[name] = value;
                    }
                }
            }
        } else {
            headers.common[name] = value;
        }
    }

    async request<T = unknown>(requestParams: RequestParams): Promise<T> {
        const {method, url, data = null, params, options = {}, retries = 0} = requestParams;
        const {concurrentId, timeout, headers, onDownloadProgress} = options;
        const requestConfig = {...options.requestConfig};
        let source: CancelTokenSource | undefined;

        if (concurrentId) {
            this.cancelRequest(concurrentId);
            source = axios.CancelToken.source();
            this.requestTokens.set(concurrentId, source);
            requestConfig.cancelToken = source.token;
        }
        if (headers) {
            requestConfig.headers = headers;
        }
        if (timeout !== undefined) {
            requestConfig.timeout = timeout;
        }

        try {
            const response = await this._axios.request<T>({
                ...requestConfig,
                method,
                url,
                data,
                params,
                onDownloadProgress,
            });
            return response.data;
        } catch (thrown) {
            if (axios.isCancel(thrown)) {
                throw {isCancelled: true, error: thrown};
            }

            const error = thrown as AxiosError | undefined;
            const errorResponse = error?.response
                ? error.response
                : typeof error?.toJSON === 'function'
                ? error.toJSON()
                : thrown;

            return this.handleRequestError<T>(
                errorResponse,
                () => this.request<T>({...requestParams, retries: retries + 1}),
                retries,
                new Error(thrown instanceof Error ? thrown.message : 'Unknown error'),
            );
        } finally {
            // A replaced request must not clear the token belonging to its successor.
            if (concurrentId && this.requestTokens.get(concurrentId) === source) {
                this.requestTokens.delete(concurrentId);
            }
        }
    }

    cancelRequest(id?: string) {
        if (id) {
            this.requestTokens.get(id)?.cancel('Concurrent request');
        }
    }

    private handleRequestError<T = GatewayError>(
        errorResponse: unknown,
        _retry?: () => Promise<T>,
        _retries?: number,
        _error?: Error,
    ): Promise<T> | T {
        throw parseError(errorResponse);
    }
}
