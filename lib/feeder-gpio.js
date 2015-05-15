// state machine for feeder - uses gpio-led driver
var b = require("./starboard");
var _ = require("underscore");
var winston = require("winston");
var util = require("./util");

function feeder(params, name, pub) {

    var meta = {
        type: "feeder",
        dir: "output",
        variables: {
            feeding: [true, false],
            interval: "float"
        }
    }

    var par = {
        device: "starboard:hopper:left",
        max_duty: 0.25
    };
    util.update(par, params);

    var state = {
        feeding: false,
        interval: 4000,             // duration of feeding
    };
    var reset = _.clone(state);
    var led = new b.led(par.device);
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
                if (state.feeding) {
                    _.delay(set_state, state.interval, { feeding: false }, function() {});
                }
                pub.emit("state-changed", name, state);
                rep();
            });
        }
    }

    var me = {
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
