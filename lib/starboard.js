/*
 * interface to hardware devices on the starboard.
 *
 * If environment variable BBB_ENV is 'dummy' this module will load a dummy
 * implementation that doesn't attempt to talk to any actual devices
 *
 * example:
 * var b = require("./beaglebone");
 * // turn on center green led
 * b.led_write("starboard:center:green", 1, console.log)
 *
 */

if (process.env.BBB_ENV == "dummy") {
    module.exports = require("./starboard-dummy");
}
else {
    module.exports = require("./starboard-dtbo");
}
