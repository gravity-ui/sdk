import _get from 'lodash/get';

import {GatewayError} from '../models/common';

export function parseError(errorResponse: unknown) {
    let parsedError = {} as GatewayError;
    const errorData = _get(errorResponse, 'data');

    if (errorData) {
        // Properly handle nginx errors
        if (typeof errorData === 'string') {
            parsedError = {
                status: _get(errorResponse, 'status', 500),
                code: 'SDK_REQUEST_ERROR',
                message: 'SDK request error',
                details: {
                    title: _get(errorResponse, 'status'),
                    description: _get(errorResponse, 'statusText'),
                },
            };
        } else {
            parsedError = {
                status: _get(errorData, 'status', 500),
                code: _get(errorData, 'code', 'SDK_REQUEST_ERROR'),
                message: _get(errorData, 'message', 'SDK request error'),
                details: _get(errorData, 'details'),
                debug: _get(errorData, 'debug'),
            };
        }
    } else {
        parsedError = {
            status: 500,
            code: 'SDK_REQUEST_ERROR',
            message: 'SDK request error',
            details: errorResponse as any,
        };
    }

    return parsedError;
}
