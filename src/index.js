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

var mixNmock = require('./lib/mix-n-mock');
var automaticRestart = require('./lib/automatic-restart');

var params = process.argv.slice(2); // node scriptName [...]

// main
var restartIndex = params.indexOf('--restart');
if (restartIndex !== -1) {
    params.splice(restartIndex, 1);
    params.forEach(automaticRestart);
} else {
    if (params.length) {
        params.forEach(mixNmock);
    } else {
        mixNmock();
    }
}
