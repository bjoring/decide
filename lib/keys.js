// monitor key events
var _ = require("underscore");
var winston = require("winston");
var fs = require("fs");
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
    var bufsize = 24;
    var buf = new Buffer(bufsize);
    var fd;

    var par = {
        device: "/dev/input/event1",
        keymap: ["hopper_up", "peck_left", "peck_center", "peck_right"]
    };
    util.update(par, params);

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

    function reader() {
        fs.read(fd, buf, 0, bufsize, null, function (err, N) {
            if (err) throw err;
            // buffer is { struct timeval, unsigned short type, unsigned short code,
            // unsigned int value }
            if (buf.readUInt16LE(8) === EV_KEY) {
                var keycode = buf.readUInt16LE(10);
                var keyname = par.keymap[keycode - 1];
                data = {};
                data[keyname] = buf.readUInt32LE(12);
                if (data[keyname] != state[keyname]) {
                    state[keyname] = data[keyname];
                    pub.emit("state-changed", addr, data,
                             buf.readUInt32LE(0) * 1000 + buf.readUInt32LE(4) / 1000)
                }
            }
            // I'm surprised this can recurse indefinitely...
            if (fd !== null)
                reader();
        });
    }

    // close the file and stop the state machine. Only takes effect on the next
    // read, though.
    this.close = function () {
        fs.close(fd, function () {
            fd = null;
        });
    };

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
        fd = fs.openSync(par.device, "r");
        reader();
    }

    pub.emit("state-changed", addr, state)
}

module.exports = keypress;
