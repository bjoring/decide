/*
 * interface to hardware devices on starboard using gpio-led and gpio-key drivers.
 *
 * Requires that a starboard be installed and that the appropriate overlay
 * mapping gpios to keys and leds is in place.
 *
 */

var fs = require("fs");
var glob = require("glob");
var queue = require("queue-async");

var f = {};

f.read_eeprom = function(bus_addr, callback) {
    var path = "/sys/bus/i2c/devices/" + bus_addr + "/eeprom";
    fs.open(path, "r", function(err, fd) {
        if (err)
            callback(err);
        else {
            var buf = new Buffer(244);
            fs.read(fd, buf, 0, 244, 0, function (err, bytes, buffer) {
                if (err) callback(err);
                else {
                    callback(null, {
                        "board": buf.toString("ascii", 6, 6 + 32).replace(/\u0000/g, ""),
                        "part": buf.toString("ascii", 58, 58 + 16).replace(/\u0000/g, ""),
                        "revision": buf.toString("ascii", 38, 38 + 4),
                        "serial": buf.toString("ascii", 76, 76 + 12)
                    });
                }
            });
    }
  });
};

f.init_overlay = function(board, revision) {
    // loads the device tree overlay, if it hasn't been already
    var capemgr = glob.sync("/sys/devices/bone_capemgr.*");
    var slots = fs.readFileSync(capemgr[0] + "/slots");
    // not a very good test
    var re = new RegExp(board);
    if (re.exec(slots)) return;
    fs.writeFileSync(capemgr[0] + "/slots", board + ":" + revision);
}

f.led_read = function(led, callback) {
    // reads the current brightness of LED and returns it in a callback
    var led = "/sys/class/leds/" + led;
    fs.readFile(led + "/brightness", function(err, data) {
        if (callback) {
            if (err && !dummy) callback(err, null);
            else callback(null, {
                led: led,
                value: parseInt(data)
            });
        }
    });
};

f.led_write = function(led, value, callback) {
    // write a value to an LED. The LED trigger is set to 'none' and value is
    // written to brightness. For LEDs on a GPIO, any nonzero value turns the LED
    // on. For LEDs on a PWM, the value determines the duty of the timer. When the
    // write is complete, callback(err, {"led": led, "value": value}) is called.
    var led = "/sys/class/leds/" + led;
    queue()
        .defer(fs.writeFile, led + "/trigger", "none")
        .defer(fs.writeFile, led + "/brightness", value * 1)
        .await(function(err) {
            if (callback){
                if (err && !dummy) callback(err, null);
                else if (callback) callback(null, {
                    brightness: value,
                    trigger: null
                });
            }
        });
};

f.led_timer = function(led, ms_period, callback) {
    // flash an LED using the internal kernel timer. The LED trigger is set to
    // 'timer' and the ms_period value is used to set the timer period (duty cycle
    // is always 50%). When the setup is complete, callback is called. The
    // behavior during the first cycle may be undefined if the default on and off
    // times are different from the ones requested. Use led_write to turn the
    // timer off.
    var led = "/sys/class/leds/" + led;
    fs.writeFileSync(led + "/trigger", "timer");
    queue()
        .defer(fs.writeFile, led + "/delay_on", ms_period / 2)
        .defer(fs.writeFile, led + "/delay_off", ms_period / 2)
        .await(function(err) {
            if (callback) {
                if (err && !dummy) callback(err, null);
                else callback(null, {
                    brightness: 1,
                    trigger: "timer",
                    period: ms_period
                });
            }
        });
};

f.led_oneshot = function(led, ms_on, callback) {
    // Turn on a LED once for a specified period of time. The LED trigger is set
    // to 'oneshot'. When the LED is turned on, the callback is called. There
    // doesn't seem to be a way to generate a callback when the event is over. If
    // this is important, use led_write
    var led = "/sys/class/leds/" + led;
    fs.writeFileSync(led + "/trigger", "oneshot");
    fs.writeFileSync(led + "/delay_on", ms_on);
    fs.writeFileSync(led + "/delay_off", "0");
    fs.writeFile(led + "/shot", 1, function(err) {
        if (callback){
            if (err) callback(err, null);
            else if (callback) callback(null, {
                brightness: 1,
                trigger: "oneshot",
                period: ms_on
            });
        }
    })

}

module.exports = f;
