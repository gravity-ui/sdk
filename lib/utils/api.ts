import AxiosWrapper, {AxiosWrapperOptions} from '@gravity-ui/axios-wrapper';
import axiosRetry from 'axios-retry';

import {GatewayError} from '../models/common';

import {parseError} from './common';

// Symbols are not preserved in the Axios config
const csrfRetryKey = '__ CSRF retry';

const urlRegexp = /\/(?<api>\w+)\/(?<scope>\w+)\/(?<service>\w+)\/(?<action>\w+)/i;

export interface RequestResponseInterceptors {
    requestInterceptorSuccess?: (config: any) => Promise<any>;
    requestInterceptorError?: (error: any) => Promise<any>;
    responseInterceptorSuccess?: (data: any) => Promise<any>;
    responseInterceptorError?: (error: any) => Promise<any>;
}

type QueriesInterceptors = Record<string, RequestResponseInterceptors[]>;

export type ApiOptions = AxiosWrapperOptions & {
    updateCsrfEnabled?: boolean;
    queriesInterceptors?: QueriesInterceptors;
};

export function createScopeServicePath(service: string, scope?: string): string {
    return `${scope ?? 'root'}/${service}`;
}

export function getScopeServicePath(url: string): string {
    const groups = url.match(urlRegexp)?.groups;

    return groups ? createScopeServicePath(groups.service, groups.scope) : '';
}

type InterceptorsChainParams = {
    url?: string;
    queriesInterceptors?: QueriesInterceptors;
    queryData: any;
    success: boolean;
    interceptorSelector: (
        interceptors: RequestResponseInterceptors,
    ) => ((data: any) => Promise<any>) | undefined;
};

export function makeInterceptorsChain({
    url,
    queriesInterceptors,
    queryData,
    success,
    interceptorSelector,
}: InterceptorsChainParams): Promise<any> {
    let result: Promise<any> = success ? Promise.resolve(queryData) : Promise.reject(queryData);

    if (!url) {
        return result;
    }

    const path = getScopeServicePath(url);

    for (const interceptors of queriesInterceptors?.[path] || []) {
        const interceptor = interceptorSelector(interceptors);

        if (interceptor) {
            result = success
                ? result.then(async (data) => await interceptor(data))
                : result.catch(async (data) => await interceptor(data));
        }
    }

    return result;
}

export default class Api extends AxiosWrapper {
    constructor(
        {updateCsrfEnabled, queriesInterceptors, ...props}: ApiOptions = {},
        handleRequestError?: (error: unknown) => any,
    ) {
        super(props);

        const requestSuccess = (config: any) => {
            return makeInterceptorsChain({
                url: config?.url,
                queriesInterceptors,
                queryData: config,
                success: true,
                interceptorSelector: (interceptors) => interceptors.requestInterceptorSuccess,
            });
        };

        const requestError = (error: any) => {
            return makeInterceptorsChain({
                url: error?.config?.url,
                queriesInterceptors,
                queryData: error,
                success: false,
                interceptorSelector: (interceptors) => interceptors.requestInterceptorError,
            });
        };

        const responseSuccess = (data: any) => {
            return makeInterceptorsChain({
                url: data?.config?.url,
                queriesInterceptors,
                queryData: data,
                success: true,
                interceptorSelector: (interceptors) => interceptors.responseInterceptorSuccess,
            });
        };

        const responseError = (error: any) => {
            let result: Promise<any> = makeInterceptorsChain({
                url: error?.config?.url,
                queriesInterceptors,
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

                        if (error.response.headers[csrfHeaderName]) {
                            this.setCSRFToken(error.response.headers[csrfHeaderName]);
                        }

                        return this._axios({
                            ...config,
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
                if (!error.config) {
                    return false;
                }

                return axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error);
            },
        });

        if (typeof handleRequestError === 'function') {
            this.handleRequestError = handleRequestError;
        }
    }

    handleRequestError<T = GatewayError>(errorResponse: unknown): Promise<T> | T {
        throw parseError(errorResponse);
    }
}
