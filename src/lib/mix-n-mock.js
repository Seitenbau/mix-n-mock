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

const konphyg = require('konphyg');
const path = require('path');

const routing = require('./routing');
const getExpressWare = require('./getExpressWare');
const launchServers = require('./launchServers');
const getProjectPaths = require('./helpers/getProjectPaths');

const privateKeyPath = 'sslcert/localhost.pem';
const certificatePath = 'sslcert/localhost.crt';

let errorCodes = {
    PROJECT_NOT_FOUND: 123
};

let run = projectName => {

    // Setup
    const paths = getProjectPaths(projectName);
    const globalConfig = konphyg(paths.sourceFolder);
    let projectConfig;
    try {
        projectConfig = konphyg(path.resolve(paths.projectFolderAbs, 'config'));
    } catch (e) {
        console.error(`FATAL: Could not open project "${paths.projectFolderRelative}".`);
        if (!projectName) {
            console.error(`Remember to pass the project folder name as an argument.`);
        }
        process.exit(errorCodes.PROJECT_NOT_FOUND);
    }

    // Server port configuration
    const configuredPort = projectConfig('server.port');

    // Mocking services
    const rootConfig = projectConfig('server.root');
    const roots = {
        serverRoot: rootConfig.root.replace(/\/+$/, '')
    };
    roots.RESTRoot = (roots.serverRoot + '/' + rootConfig.serviceBasePath).replace(/\/+$/, '').replace(/\/+/g, '/');

    // Path config
    paths.staticFilesDirRel = projectConfig('filesystem.path').public;
    paths.staticFilesDirAbs = path.resolve(paths.projectFolderAbs, paths.staticFilesDirRel);
    paths.mockFilesDirRel = projectConfig('filesystem.path').mock;
    paths.mockFilesDirAbs = path.resolve(paths.projectFolderAbs, paths.mockFilesDirRel);
    paths.defaultFile = rootConfig.defaultFile;

    /**
     * @typedef {{
     *     active: {boolean} Whether the above mentioned configuration should be used or not. If you are not behind a proxy set it to false,
     *     url: {string} The URL of the proxy server,
     *     port: {(string|number)} The port of the proxy server
     * }}
     */
    const localProxyConfig = globalConfig('local.proxy');

    /**
     * @typedef {{
     *     backend: {string} The base URL of the real backend,
     *     delayedServices: {Object} Services specified here are called after the given amount of time has passed,
     *     rejectUnauthorized: {boolean} Whether invalid certificates should be rejected or not
     * }}
     */
    const serverProxyConfig = projectConfig('server.proxy');

    let expressWare = getExpressWare(roots);
    routing.setup(expressWare, roots, paths, localProxyConfig, serverProxyConfig, projectConfig);



    launchServers(expressWare, roots, configuredPort, path.resolve(paths.sourceFolder, privateKeyPath), path.resolve(paths.sourceFolder, certificatePath), projectName);
};

module.exports = {
    run: run,
    errorCodes: errorCodes
};
