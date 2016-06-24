/**!
Copyright 2016 SEITENBAU GmbH

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';

const express = require('express');
const request = require('request');
const fileExists = require('file-exists');
const path = require('path');
const url = require('url');

const getFilePath = require('./helpers/getFilePath');


let setup = (expressWare, roots, paths, localProxyConfig, serverProxyConfig, projectConfig) => {
    let setupMocks = (mockFilesDirAbs, projectConfig) => {
        /**
         * Sends back the given error and delays the response
         * @param {{error: string, status: number}} errorConfig The error configuration object
         * @param {number} delayBy The number of milliseconds by which the response is delayed
         * @param {string=} filePath
         * @param {{}} request The request object
         * @param {{}} response The response object
         */
        let sendDelayedError = (errorConfig, delayBy, filePath, request, response) => {
            let responseFunc;
            if (errorConfig.error) {
                responseFunc = response.send.bind(response, errorConfig.status, {faultCode: errorConfig.error});
            } else if (filePath) {
                responseFunc = () => response.status(errorConfig.status).sendfile(filePath);
            }
            setTimeout(responseFunc, delayBy);
        };

        /**
         * Sends back the specified error
         * @param {{status: string, error: string=}} errorConfig The error config holding the HTTP status and the
         * error id or the error response object
         * @param {string=} filePath
         * @param {{}} request The request object
         * @param {{}} response The response object
         */
        let sendError = (errorConfig, filePath, request, response) => {
            if (errorConfig.error) {
                response.send(errorConfig.status, {faultCode: errorConfig.error});
            } else if (filePath) {
                response.status(errorConfig.status).sendfile(filePath);
            }
        };

        /**
         * Returns a function for mocking the request based on the given mock configuration
         * @param {{
         *     file: string,
         *     delayBy: number,
         *     error: {
         *         status: number,
         *         error: string
         *     },
         *     path: string,
         *     active: boolean
         * }} mock The configuration object
         * @param {string} filePath The full path to the file which is send as a response
         * @return {Function|undefined}
         */
        let getMockingFunction = (mock, filePath) => {
            let mockFunc;
            if (mock.file && !mock.error) {
                if (mock.delayBy) {
                    mockFunc = (request, response) => setTimeout(() => response.sendfile(filePath), mock.delayBy);
                } else {
                    mockFunc = (request, response) => response.sendfile(filePath);
                }
            } else if (mock.error) {
                if (mock.delayBy) {
                    mockFunc = sendDelayedError.bind(this, mock.error, mock.delayBy, filePath);
                } else {
                    mockFunc = sendError.bind(this, mock.error, filePath);
                }
            }
            return mockFunc;
        };

        /**
         * Setups a mock service for the given path and method
         * @param {string} methodName The name of the HTTP method PUT, GET, POST, …
         * @param {{
         *     file: string,
         *     delayBy: number,
         *     error: {
         *         status: number,
         *         error: string
         *     },
         *     path: string,
         *     active: boolean
         * }} mock The configuration object
         * @param {string} mock.path The REST path which has to be mocked
         * @param {string} mock.file The JSON file which should be returned by the service mock
         */
        let setupRESTMock = (methodName, mock) => {
            let directory = path.resolve(mockFilesDirAbs, methodName.toUpperCase());
            let filePath = mock.file ? getFilePath(directory, mock.file) : '';
            let mockFunc = getMockingFunction(mock, filePath);
            if (mock.path.indexOf('/') === 0) {
                throw `${mock.path} should not start with a slash. The mocked service will not work!`;
            }
            if (mockFunc) {
                expressWare[methodName.toLowerCase()](roots.RESTRoot + '/' + mock.path, mockFunc);
            }
        };

        /**
         * Setups up the mock services for the given mock configuration using the given mocking function
         * @param {{}} mocks
         * @param {boolean} mocks.active Whether the mock should in general be enabled or not
         * @param {Array.<{active: boolean, path: string, file:string}>} mocks.services The description of the services which
         * @param {Function} mockFunc The function which is called on each entry and which is doing the actual mocking work
         * should be mocked
         */
        let setupRESTMocks = (mocks, mockFunc) => {
            if (mocks.active) {
                mocks.services.filter(s => s.active).forEach(mockFunc);
            }
        };

        ['get', 'put', 'post', 'delete'].forEach(method => {
            let mockCfg = projectConfig(`services/${method.toUpperCase()}.mock`);
            setupRESTMocks(mockCfg, setupRESTMock.bind(this, method));
        });
    };

    /**
     * Setups the proxying so the REST request can be answered by our real backend on a remote server
     */
    let setupProxying = (localProxyConfig, serverProxyConfig) => {
        /**
         * Takes the given request ands proxies it through to real backend
         * @param {{}} requestConfig The configuration for the request object
         * @param {string=} requestConfig.proxy The URL + port of the proxy server (if one should be used)
         * @param {Object} req The request object
         * @param {Object} res The response object
         */
        let pipeRequest = (requestConfig, req, res) => {
            let remote = request(Object.assign({}, requestConfig, {
                url: url.resolve(serverProxyConfig.backend, req.url.replace(roots.serverRoot, ''))
            }));
            req.pipe(remote);
            remote.pipe(res);
        };

        /**
         * Proxies REST calls through to the real backend. If the REST  services appears in the delayedServices in the proxy.json
         * it is delayed
         * @param {{}} requestConfig The configuration for the request object
         * @param {string=} requestConfig.proxy The URL + port of the proxy server (if one should be used)
         * @param req
         * @param res
         * @param next
         */
        let proxyREST = (requestConfig, req, res, next) => {
            if (req.url.indexOf(roots.RESTRoot) === 0) {
                if (serverProxyConfig.delayedServices) {
                    let key = decodeURIComponent(req.url.replace(roots.RESTRoot, ''));
                    let delay = serverProxyConfig.delayedServices[key] || serverProxyConfig.delayedServices[key.replace(/\//, '')];
                    if (delay) {
                        console.log(`delaying ${key} for ${delay} ms`);
                        setTimeout(pipeRequest.bind(this, requestConfig, req, res), delay);
                    } else {
                        pipeRequest(requestConfig, req, res);
                    }
                } else {
                    pipeRequest(requestConfig, req, res);
                }
            } else {
                next();
            }
        };

        let requestConfig = {
            rejectUnauthorized: serverProxyConfig.rejectUnauthorized !== false
        };
        if (localProxyConfig.active) {
            requestConfig.proxy = `${localProxyConfig.url}:${localProxyConfig.port}`;
        }
        expressWare.use(proxyREST.bind(this, requestConfig));
    };

    let setupStaticFiles = (paths) => {
        /**
         * Return the file system path for the requested file
         * @param {string} srcPath The path on the file system where the files are located
         * @param {string} relPath The relative path of the request
         * @param {Object} req The request object itself
         * @return {?string}
         */
        let getFilePathForRequest = (srcPath, relPath, req) => {
            let file;
            let requestedFile = path.resolve(srcPath, relPath);
            if (path.normalize(requestedFile) === path.normalize(paths.staticFilesDirAbs) && req.path.replace(/\/$/, '') !== roots.serverRoot) {
                // The requested file can be found in our static file directory and can therefore can be handled by
                // express.static AND is not our root path, which can of course not be found in the static dir
                file = null;
            } else if (paths.defaultFile && req.path.replace(/\/$/, '') === roots.serverRoot) {
                // The requested file is our server root, therefore we need to send index.html
                file = path.resolve(paths.staticFilesDirAbs, paths.defaultFile);
            } else if (fileExists(requestedFile)) {
                // The file is neither a file found in our dev path nor a request for the index, then it must be a file which
                // can only be found in the src directory (during development);
                file = requestedFile;
            }
            return file;
        };

        let proxyFilesystem = (req, res, next) => {
            let requestedUrl = req.path;
            let relPath = path.relative(roots.serverRoot, requestedUrl);
            let file = getFilePathForRequest(paths.staticFilesDirRel, relPath, req);
            if (file) {
                res.charset = 'utf-8'; // TODO: use https://www.npmjs.com/package/detect-encoding ? GH-15
                res.sendfile(file);
                return;
            }
            next(); // handled by express.static
        };

        expressWare.use(proxyFilesystem);
        expressWare.use(roots.serverRoot, express.static(paths.staticFilesDirAbs, {redirect: false}));
        expressWare.use('/', express.static(path.resolve(paths.sourceFolder, '..'), {redirect: false})); // TODO: This grants access to the mix-n-mock project folder. Do we want this? GH-16
    };

    setupMocks(paths.mockFilesDirAbs, projectConfig);
    setupProxying(localProxyConfig, serverProxyConfig);
    setupStaticFiles(paths);

    expressWare.use(roots.serverRoot, expressWare.router);
};

module.exports = {
    setup: setup
};
