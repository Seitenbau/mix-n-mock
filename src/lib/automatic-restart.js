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

var forever = require('forever-monitor');
var path = require('path');

module.exports = (projectName) => {

    var projectFolderRelative = projectName || 'project';
    var projectFolderAbs = path.join(__dirname, projectFolderRelative);
    var child = new forever.Monitor(path.join(__dirname, 'index.js'), {
        args: [projectFolderRelative],
        watch: true,
        watchDirectory: path.join(projectFolderAbs, 'config'),
        killTree: true
    });

    child.on('exit', console.info.bind(console, `mix-n-mock in ${projectFolderRelative} has terminated`));

    child.on('watch:restart', info => {
        console.log(`\nRestarting mix-n-mock in ${projectFolderRelative} because the following file has changed: ${info.stat}\n`); // should be info.file, but forever-monitor 1.7.0 is buggy (cf. https://github.com/foreverjs/forever-monitor/pull/116)
    });

    process.on('SIGINT', () => {
        console.log(`Killing mix-n-mock in ${projectFolderRelative}`);
        child.kill();
        process.nextTick(process.exit.bind(process));
    });
    child.start();
};