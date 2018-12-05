// state machine for feeder - uses gpio-led driver
const _ = require("underscore");
const winston = require("winston");
const util = require("./util");
const LED = require("./leds");

const dummy = util.is_a_dummy();

function feeder(params, name, pub) {

    const meta = {
        type: "feeder",
        dir: "output",
        variables: {
            feeding: [true, false],
            interval: "float"
        }
    }

    const par = {
        device: "starboard:hopper:left",
        max_duty: 0.25,
        default_interval: 4000
    };
    util.update(par, params);

    const state = {
        feeding: false,
        interval: par.default_interval,             // duration of feeding
    };
    const reset = _.clone(state);
    const led = new LED(par.device);
    winston.debug("%s feeder using gpio-led driver", par.device);

    function set_state(data, rep) {
        if (data.interval)
            state.interval = data.interval;
        if (state.feeding == data.feeding) {
            rep();
        }
        else {
            led.write(data.feeding, "none", function(value) {
                state.feeding = (value.brightness > 0);
                pub.emit("state-changed", name, state);
                if (state.feeding && state.interval > 0) {
                    _.delay(set_state, state.interval, { feeding: false }, function() {});
                }
                // simulate hopper detector
                if (dummy) {
                    pub.emit("state-changed", "hopper", {up: data.feeding * 1});
                }
                rep();
            });
        }
    }

    const me = {
        req: function(msg, data, rep) {
            winston.debug("req to feeder %s:", par.device, msg, data);
            if (msg == "change-state")
                set_state(data, rep);
            else if (msg == "reset-state")
                set_state(reset, rep);
            else if (msg == "get-state")
                rep(null, state);
            else if (msg == "get-meta")
                rep(null, meta);
            else if (msg == "get-params")
                rep(null, par);
            else
                rep("invalid or unsupported REQ type");
        }
    };

    pub.emit("state-changed", name, state);

    return me;
}

module.exports = feeder;
