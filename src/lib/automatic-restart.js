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

const forever = require('forever-monitor');
const path = require('path');

const getProjectPaths = require('./helpers/getProjectPaths');
const mixNmock = require('./mix-n-mock');

module.exports = (projectName) => {

    const paths = getProjectPaths(projectName);
    const sourceFolder = paths.sourceFolder;
    const projectFolderRelative = paths.projectFolderRelative;
    const projectFolderAbs = paths.projectFolderAbs;

    let bigBrother = new forever.Monitor(path.resolve(sourceFolder, 'index.js'), {
        args: [projectFolderRelative],
        watch: true,
        watchDirectory: path.resolve(projectFolderAbs, 'config'),
        killTree: true
    });

    bigBrother.on('exit:code', (code, signal) => {
        if (code === mixNmock.errorCodes.PROJECT_NOT_FOUND) {
            bigBrother.stop();
            process.exit(code);
        }
        console.info(`mix-n-mock in ${projectFolderRelative} has terminated`);
    });

    bigBrother.on('watch:restart', info => {
        console.log(`\nRestarting mix-n-mock in ${projectFolderRelative} because the following file has changed: ${info.stat}\n`); // should be info.file, but forever-monitor 1.7.0 is buggy (cf. foreverjs/forever-monitor#116)
    });

    process.on('SIGINT', () => {
        console.log(`Killing mix-n-mock in ${projectFolderRelative}`);
        bigBrother.kill();
        process.nextTick(process.exit.bind(process));
    });

    bigBrother.start();
};
