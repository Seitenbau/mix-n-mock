var path = require('path');

/**
 * Determine the project paths
 * @param projectName
 * @return {{sourceFolder: string, projectFolderRelative: string, projectFolderAbs: string}}
 */
module.exports = (projectName) => {
    var sourceFolder = path.resolve(__dirname, '..', '..');
    var projectFolderRelative = projectName || 'project';
    var projectFolderAbs;
    if (path.isAbsolute(projectFolderRelative)) {
        projectFolderAbs = projectFolderRelative;
    } else if (projectFolderRelative[0] === '.') {
        projectFolderAbs = path.resolve(projectFolderRelative);
    } else {
        projectFolderAbs = path.resolve(sourceFolder, projectFolderRelative);
    }
    return {sourceFolder, projectFolderRelative, projectFolderAbs};
};
