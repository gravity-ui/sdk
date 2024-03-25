import AxiosWrapper, {AxiosWrapperOptions} from '@gravity-ui/axios-wrapper';
import axiosRetry from 'axios-retry';

import {GatewayError} from '../models/common';

import {parseError} from './common';

// Symbols are not preserved in the Axios config
const csrfRetryKey = '__ CSRF retry';

export type ApiOptions = AxiosWrapperOptions & {
    updateCsrfEnabled?: boolean;
};

export default class Api extends AxiosWrapper {
    constructor(
        {updateCsrfEnabled, ...props}: ApiOptions = {},
        handleRequestError?: (error: unknown) => any,
    ) {
        super(props);

        if (updateCsrfEnabled) {
            this._axios.interceptors.response.use(null, async (error) => {
                const {config} = error;

                if (config && !config[csrfRetryKey] && error.response?.status === 419) {
                    if (error.response.headers['x-csrf-token']) {
                        this.setCSRFToken(error.response.headers['x-csrf-token']);
                    }

                    return this._axios({
                        ...config,
                        [csrfRetryKey]: true,
                    });
                }

                return Promise.reject(error);
            });
        }

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
