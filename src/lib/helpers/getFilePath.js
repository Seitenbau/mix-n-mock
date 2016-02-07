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

const fileExists = require('file-exists');
const path = require('path');

const unVersionedFileNameInfix = 'development';

/**
 * Given a file path, it tries to find the local and un-versioned version of it (marked by *.development.*) and returns
 * it. If no local version exists the regular file path is returned. E.G. config.json & config.development.json
 * @param {string} filePath
 * @param {string} fileName
 * @return {string}
 */
module.exports = (filePath, fileName) => {
    let splitFileName = fileName.split('.');
    let name = splitFileName[0];
    let ending = splitFileName[1];
    let devFileName = name + `.${unVersionedFileNameInfix}.${ending}`;
    let devFilePath = path.resolve(filePath, devFileName);
    let regularFilePath = path.resolve(filePath, fileName);
    return fileExists(devFilePath) ? devFilePath : regularFilePath;
};
