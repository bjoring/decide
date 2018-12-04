// monitor key events
const _ = require("underscore");
const winston = require("winston");
const util = require("./util");
const evdev = require("evdev");

function keypress(params, name, pub) {
    // monitors a /dev/input device. This is used to capture events from GPIO
    // inputs that have been defined with gpio-keys in the device tree. For each
    // rising or falling event, callback is called with the timestamp [seconds,
    // microseconds], the key code, and the value (1 for falling and 0 for
    // rising). Dev is usually input1 or event1 for the BBB.

    // to figure out what the keymappings are for a device, use evtest

    // The state of the key can be changed by REQ if desired (for example, to
    // simulate a peck). If the environment variable BBB_ENV is 'dummy', this
    // object won't attempt to connect to the input device, but will still
    // respond to REQ events as if it were.

    const EV_KEY = 1;

    const par = {
        device: "/dev/input/event1",
        keymap: ["hopper_up", "peck_left", "peck_center", "peck_right"]
    };
    util.update(par, params);
    winston.debug("%s parameters:", name, par);

    const meta = {
        type: "key",
        dir: "input",
        variables: {}
    }

    const state = {};
    par.keymap.forEach(function (x) {
        state[x] = 0;
        meta.variables[x] = [0, 1];
    });

    const conn = {
        dev: null
    };


    function reader(data) {
        if (data.type != 1)
            return;
        let keyname = par.keymap[data.code];
        let ret = {};
        if (data.value != state[keyname]) {
            state[keyname] = data.value;
            pub.emit("state-changed", name, {[keyname] : data.value},
                     data.time.tv_sec * 1000000 + data.time.tv_usec);
        }
    }

    const me = {
        pub: function () {},

        req: function (msg, data, rep) {
            winston.debug("req to keys %s:", par.device, msg, data);
            if (msg == "change-state") {
                // allows dummy keypress
                let upd = {};
                for (let key in data) {
                    if (key in state && state[key] != data[key]) {
                        state[key] = upd[key] = data[key];
                    }
                }
                if (!_.isEmpty(upd))
                    pub.emit("state-changed", name, upd);
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
        },

        disconnect: function() {
            if (conn.dev) {
                winston.debug("closing connection to %s", par.device);
                conn.dev.stream.close();
            }
        }
    }

    if (process.env.BBB_ENV != "dummy") {
        const ev = new evdev({raw: true});
        ev.on("event", reader);
        conn.dev = ev.open(par.device);
    }

    pub.emit("state-changed", name, state)
    return me;
}

module.exports = keypress;
