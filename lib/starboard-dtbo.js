/*
 * interface to hardware devices on starboard using gpio-led and gpio-key drivers.
 *
 * Requires that a starboard be installed and that the appropriate overlay
 * mapping gpios to keys and leds is in place.
 *
 * NB: One consequence of using the gpio-led driver is that we aren't notified if
 * the state of the LED changes elsewhere (for example, when the LED is blinking
 * or if a user changes the brightness directly)
 *
 * Errors are always thrown by functions in this module; callbacks do not return
 * error codes
 */

var fs = require("fs");
var glob = require("glob");
var queue = require("queue-async");

var f = {};

f.read_eeprom = function(bus_addr, callback) {
    var path = "/sys/bus/i2c/devices/" + bus_addr + "/eeprom";
    fs.open(path, "r", function(err, fd) {
        if (err) throw err;
        var buf = new Buffer(244);
        fs.read(fd, buf, 0, 244, 0, function (err, bytes, buffer) {
            if (err) throw err;
            if (callback) callback({
                    "board": buf.toString("ascii", 6, 6 + 32).replace(/\u0000/g, ""),
                    "part": buf.toString("ascii", 58, 58 + 16).replace(/\u0000/g, ""),
                    "revision": buf.toString("ascii", 38, 38 + 4),
                    "serial": buf.toString("ascii", 76, 76 + 12)
            });
        });
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

f.led = function(led) {

    var path = "/sys/class/leds/" + led;
    var fd_trig = fs.openSync(path + "/trigger", "r+");
    var fd_val = fs.openSync(path + "/brightness", "r+");
    var buf_trig = new Buffer(128);
    var buf_val = new Buffer(8);

    this.read = function(callback) {
        queue()
            .defer(fs.read, fd_trig, buf_trig, 0, buf_trig.length, 0)
            .defer(fs.read, fd_val, buf_val, 0, buf_val.length, 0)
            .await(function(err, n1, n2) {
                if (err) throw err;
                if (callback) callback({
                    trigger: /\[(\w+)\]/.exec(buf_trig)[1],
                    brightness: parseInt(buf_val.toString("utf-8", 0, n2))
                });
        })
    };

    this.write = function(value, trigger, callback) {
        var val = (value*1).toString();
        buf_trig.write(trigger);
        buf_val.write(val);
        fs.writeSync(fd_trig, buf_trig, 0, trigger.length, 0);
        fs.writeSync(fd_val, buf_val, 0, val.length, 0);
        if (callback) callback({
            brightness: value,
            trigger: trigger,
        });
    };

    this.timer = function(ms_period, callback) {
        buf_trig.write("timer");
        fs.writeSync(fd_trig, buf_trig, 0, 5, 0);
        queue()
            .defer(fs.writeFile, path + "/delay_on", ms_period / 2)
            .defer(fs.writeFile, path + "/delay_off", ms_period / 2)
            .await(function(err) {
                if (err) throw err;
                if (callback) callback({
                    brightness: 1,
                    trigger: "timer",
                    period: ms_period
                });
            });
    };

    this.oneshot = function(ms_on, callback) {
        buf_trig.write("oneshot");
        fs.writeSync(fd_trig, buf_trig, 0, 7, 0);
        queue()
            .defer(fs.writeFile, path + "/delay_on", ms_on)
            .defer(fs.writeFile, path + "/delay_off", "0")
            .await(function(err) {
                if (err) throw err;
                fs.writeFile(led + "/shot", 1, function(err) {
                    if (err) throw err;
                    if (callback) callback({
                        brightness: 1,
                        trigger: "oneshot",
                        period: ms_on
                    });
                });
            });
    };
};

module.exports = f;
