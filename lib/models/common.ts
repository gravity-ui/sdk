export interface GatewayError {
    status: number;
    message: string;
    code: string;
    details?: {
        title?: string;
        description?: string;
    } & Record<string, unknown>;
    debug?: any;
}
