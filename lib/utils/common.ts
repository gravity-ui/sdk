import {ErrorCode} from '../constants';
import type {GatewayError} from '../models/common';

function withDefault<T>(value: T | undefined, defaultValue: T) {
    return value === undefined ? defaultValue : value;
}

export function parseError(errorResponse: unknown) {
    let parsedError = {} as GatewayError;
    const response = errorResponse as any;
    const errorData = response?.data;

    if (errorData) {
        // Properly handle nginx errors
        if (typeof errorData === 'string') {
            parsedError = {
                status: withDefault(response.status, 500),
                code: ErrorCode.SDKRequestError,
                message: 'SDK request error',
                details: {
                    title: response.status,
                    description: response.statusText,
                },
            };
        } else {
            parsedError = {
                status: withDefault(errorData.status, 500),
                code: withDefault(errorData.code, ErrorCode.SDKRequestError),
                message: withDefault(errorData.message, 'SDK request error'),
                details: errorData.details,
                debug: errorData.debug,
            };
        }
    } else {
        parsedError = {
            status: 500,
            code: ErrorCode.SDKRequestError,
            message: 'SDK request error',
            details: errorResponse as any,
        };
    }

    return parsedError;
}

export function isNeedResetError(
    errorResponse: unknown,
): errorResponse is {data: {code: ErrorCode.AccountChanged | ErrorCode.SessionExpired}} {
    const code = (errorResponse as any)?.data?.code;

    return code === ErrorCode.AccountChanged || code === ErrorCode.SessionExpired;
}
