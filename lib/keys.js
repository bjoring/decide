// monitor key events
var _ = require("underscore");
var winston = require("winston");
var fs = require("fs");
var tty = require("tty");
var util = require("./util");

function keypress(params, addr, pub) {
    // monitors a /dev/input device. This is used to capture events from GPIO
    // inputs that have been defined with gpio-keys in the device tree. For each
    // rising or falling event, callback is called with the timestamp [seconds,
    // microseconds], the key code, and the value (1 for falling and 0 for
    // rising). Dev is usually input1 or event1 for the BBB.

    // The state of the key can be changed by REQ if desired (for example, to
    // simulate a peck). If the environment variable BBB_ENV is 'dummy', this
    // object won't attempt to connect to the input device, but will still
    // respond to REQ events as if it were.

    var EV_KEY = 1;

    var par = {
        device: "/dev/input/event1",
        keymap: ["hopper_up", "peck_left", "peck_center", "peck_right"]
    };
    util.update(par, params);
    winston.debug("%s parameters:", addr, par);

    var meta = {
        type: "key",
        dir: "input",
        variables: {}
    }

    var state = {};
    par.keymap.forEach(function (x) {
        state[x] = 0;
        meta.variables[x] = [0, 1];
    });

    function reader(buf) {
        // each event is 32 bytes, but there may be more than one event in a buffer
        for (var i = 0; i < buf.length; i += 32) {
            var chunk = buf.slice(i, i + 32);
            if (chunk.readUInt16LE(8) === EV_KEY) {
                var keycode = chunk.readUInt16LE(10);
                var keyname = par.keymap[keycode - 1];
                data = {};
                data[keyname] = chunk.readUInt32LE(12);
                if (data[keyname] != state[keyname]) {
                    state[keyname] = data[keyname];
                    pub.emit("state-changed", addr, data,
                             chunk.readUInt32LE(0) * 1000 + chunk.readUInt32LE(4) / 1000)
                }
            }
        }
    }

    this.pub = function () {};

    this.req = function (msg, data, rep) {
        winston.debug("req to keys %s:", par.device, msg, data);
        if (msg == "change-state") {
            // allows dummy keypress
            var upd = {};
            for (var key in data) {
                if (key in state && state[key] != data[key]) {
                    state[key] = upd[key] = data[key];
                }
            }
            if (!_.isEmpty(upd))
                pub.emit("state-changed", addr, upd);
            rep();
        }
        else if (msg == "reset-state")
            rep();
        else if (msg == "get-state")
            rep(null, state);
        else if (msg == "get-meta")
            rep(null, meta);
        else if (msg == "get-params")
            rep(null, par);
        else
            rep("invalid or unsupported REQ type");
    };

    if (process.env.BBB_ENV != "dummy") {
        var stream = new tty.ReadStream(fs.openSync(par.device, "r"))
        stream.setRawMode(true);
        stream.on("data", reader);
    }

    pub.emit("state-changed", addr, state)
}

module.exports = keypress;
