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
const redirect = require('express-redirect');

module.exports = (roots) => {
    let expressWare = express();
    expressWare.use(express.compress());

    redirect(expressWare);
    expressWare.redirect('/', roots.serverRoot); // TODO: make configurable? GH-8
    expressWare.redirect(roots.serverRoot, `${roots.serverRoot}/`); // TODO: make configurable? GH-8

    expressWare.use(express.errorHandler({
        dumpExceptions: true,
        showStack: true
    }));

    expressWare.use(roots.serverRoot, express.json());
    expressWare.use(roots.serverRoot, express.urlencoded());

    return expressWare;
};
