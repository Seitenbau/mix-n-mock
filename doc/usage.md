# Usage    <img alt="mix-n-mock logo" src="https://cdn.rawgit.com/Seitenbau/mix-n-mock/master/doc/mix-n-mock-logo.svg" align="right" height="50">

## Running mix-n-mock


To launch mix-n-mock on a project named `foo`, just run

    $ node index.js foo

You can also use

    $ npm start foo

If no project name is passed, it defaults to `project`

    $ node index.js # same as node index.js project

### Advanced pathnames

The project folder must be located under `src`. If your project folder is elsewhere, use an absolute path or a pathname starting with `.` like this:

    $ node index.js ./foo
    $ node index.js ./foo/bar
    $ node index.js /home/johndoe/foo
    > node.exe index.js C:\projects\foo

### Multi-project mode

You can launch multiple projects at once

    $ node index.js foo bar ./baz

### Automatic restart

To have mix-n-mock restart automatically when any of the config files changes, pass the `--restart` parameter, or `-r` for short

    $ node index.js -r foo
    $ node index.js --restart foo bar
    $ npm start -- --restart foo bar

Note that the extra `--` is mandatory for `npm start`.

TODO: write the rest of this <!-- GH-2 -->

## Configuration
### defaultFile
optional
### delay
### local proxy server
`local.proxy.json`
