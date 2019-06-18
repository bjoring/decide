// This device driver interfaces with four gpios on the Beaglebone that serve as
// response keys.
const fs = require("fs");
const path = require("path");
const _ = require("underscore");
const GPIO = require("./gpio");
const winston = require("winston");
const util = require("./util");

function starboard(params, name, pub) {

    const par = {
        device: "/sys/class/gpio/gpiochip64",
        keymap: {
            // these are offset from the base of the gpiochip
            hopper: 6,
            peck_left: 7
            peck_center: 8,
            peck_right: 9
        }
    };
    util.update(par, params);

    const meta = {
        type: "key",
        dir: "input",
        variables: {}
    };

    const gpios = {};
    const pollers = {};
    const state = {};

    _.each(par.keymap, (v, key) => {
        state[key] = 0;
        gpios[key] = new GPIO(v, par.device);
        gpios[key].set_direction("in");
        gpios[key].active_low(true);
        pollers[key] = gpios[key].new_poller("rising", (err, trig_state) => {
            gpios[key].read((err, value) => {
                if (err)
                    pub.emit("warning", name, "error reading from " + key);
                else if (state[key] != value) {
                    state[key] = value;
                    pub.emit("state-changed", name, {[key] : value});
                }
            });
        });
        meta.variables[key] = [0, 1];
    });

    if (!util.is_a_dummy())
        winston.debug("starboard: start monitoring gpio%s for events", par.interrupt_gpio);
    else
        winston.debug("starboard: in dummy mode; only simulated keypresses will work");

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
            winston.debug("starboard: stop monitoring gpio%s for events", par.interrupt_gpio);
            _.each(pollers, (v, k) => {
                v.close()
            });
        }
    };

    pub.emit("state-changed", name, state);
    return me;

}

module.exports = starboard;
