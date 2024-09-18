# @gravity-ui/sdk &middot; [![npm package](https://img.shields.io/npm/v/@gravity-ui/sdk)](https://www.npmjs.com/package/@gravity-ui/sdk) [![CI](https://img.shields.io/github/actions/workflow/status/gravity-ui/sdk/.github/workflows/ci.yml?label=CI&logo=github)](https://github.com/gravity-ui/sdk/actions/workflows/ci.yml?query=branch:main)

SDK implementing work with REST/GRPC APIs

## Install

```shell
npm install --save-dev @gravity-ui/sdk
```

## Usage

You need to import `sdkFactory` and `Schema`, and create an instance of the class.

If the schema is not divided into scopes:

```typescript
import sdkFactory from '@gravity-ui/sdk';
import type Schema from '<schemas package>';

const config = {
  csrfToken: 'secret-token',
  endpoint: '/gateway',
};

const sdk = sdkFactory<{root: typeof Schema}>(config);
```

If the schema is divided into scopes:

```typescript
import sdkFactory from '@gravity-ui/sdk';
import type Schema from '<schemas package>';
import type LocalSchema from '../../shared/schemas';

const config = {
  csrfToken: 'secret-token',
  endpoint: '/gateway',
};

const sdk = sdkFactory<{root: typeof Schema; local: typeof LocalSchema}>(config);
```

Structure of `config`:

```typescript
import {AxiosRequestConfig} from 'axios';

interface SdkConfig {
  // Custom Axios settings
  axiosConfig?: AxiosRequestConfig;
  // CSRF-token
  csrfToken?: string;
  // The endpoint to which the request from the client will be sent. By default, "/api" is used
  endpoint?: string;
  // Custom error handler. If the configuration is not specified, the default one is used
  handleRequestError?: (error: unknown) => any;
}
```

In the code, the invocation of the SDK method looks like this:

```javascript
sdk.<scope>.<service>.<action>(data, options); // => returns a CancelablePromise
```

If the default endpoint value `/api` is specified, the full request path will look like this:

`/api/:scope/:service/:action`

There is a special scope called `root`. Its methods can be called without explicitly specifying the scope.

The following calls are equivalent:

`sdk.root.<service>.<action>(data, options);`

`sdk.<service>.<action>(data, options);`

But the full request path will always include the scope:

`/api/root/:service/:action`

Structure of `options`:

```typescript
interface SdkOptions {
  // Request identifier. The previous request with the same identifier will be canceled
  concurrentId?: string;
  // Ability to specify a specific number of retries for certain endpoints. By default, the number of retries is 0
  retries?: number;
  // Ability to specify a specific timeout for certain endpoints.
  // By default, the configuration is taken from axiosConfig or set to 60 seconds
  timeout?: number;
  // Ability to specify specific headers when making a call
  headers?: Record<string, unknown>;
}
```

## Invoking External Methods

Through the `sdk`, you have the ability to make calls to external methods that are not defined in the schemas. Such a call looks like this:

`sdk(config, options);`

The argument `config` has the type `AxiosRequestConfig`, and the argument options has the type `SdkOptions` described above.

## CancellablePromise

For the convenience of creating cancelable promises, the package exports a class called `CancellablePromise(promise: Promise, cancel: () => void)`.

## Additional methods

### sdk.setLang()

Allows setting the user's language, which will be passed to all invoked endpoints through a special `accept-language` header.

### sdk.setDefaultHeader()

Allows setting base headers that will be passed to all invoked endpoints.
