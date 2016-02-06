'use strict';

/**
 * Detect local IP address
 * @returns {string|null}
 */
module.exports = () => {
    let interfaces = require('os').networkInterfaces();
    for (let device in interfaces) {
        if (interfaces.hasOwnProperty(device)) {
            let details = interfaces[device];
            for (let i = 0; i < details.length; i++) {
                let detail = details[i];
                if (detail.family === 'IPv4' && !detail.internal) {
                    return detail.address;
                }
            }
        }
    }
    return null;
};
