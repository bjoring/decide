/*
 * interface to feeder on the starboard.
 *
 * There are two methods of interfacing with the feeder. One is to use the
 * gpio-led driver in the kernel and activate the feeder as a oneshot pulse. The
 * other, newer method is to use the PRU to operate the feeder gpios with PWM
 * which allows more control over the power. For example, with pull-configured
 * hoppers it's nice to use a brief pulse at high power followed by a
 * lower-power holding level.
 *
 * To maintain backwards compatibility, this module checks whether the gpio-led
 * devices are present under /sys/class/led and uses feeder-gpio.js if they are.
 * If not, it tries to load feeder-pwm.js. This may throw an error if the PRU code
 * fails to load.
 *
 */
var winston = require("winston");

var feeder_gpio = require("./feeder-gpio.js");
var feeder_pwm = require("./feeder-pwm.js");

// this is a wrapper that returns the first object that doesn't raise an error
function feeder(params, name, pub) {

    try {
        return feeder_pwm(params, name, pub);
    }
    catch (e) {
        winston.debug("unable to load pwm driver:", e);
        // may throw error
        return feeder_gpio(params, name, pub);
    }

}

module.exports = feeder;
