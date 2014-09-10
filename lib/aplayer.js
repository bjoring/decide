/*
 * interface to alsa playback on the starboard.
 *
 * If environment variable BBB_ENV is 'dummy' this module will load a dummy
 * implementation that doesn't attempt to talk to any actual devices
 *
 *
 */

if (process.env.BBB_ENV == "dummy") {
    module.exports = require("./aplayer-dummy");
}
else {
    module.exports = require("./aplayer-alsa");
}
