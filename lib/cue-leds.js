const LED = require("./leds");
const _ = require("underscore");
const winston = require("winston");
const util = require("./util");

function cues(params, name, pub) {

    const par = {
        device: "starboard:center:green"
    };
    util.update(par, params);

    const meta = {
        type: "led",
        dir: "output",
        color: par.device.split(":")[2],
        variables: {
            brightness: [0, 1],
            trigger: [null, "timer", "oneshot"]
        }
    };

    // state is managed by the led object
    const led = new LED(par.device);
    const reset = {
        brightness: 0,
        trigger: "none"
    };

    function set_state(data, rep) {
        function cb(err, result) {
            if (err) {
                pub.emit("warning", name, "unable to write to GPIO: " + err);
                rep(err);
            }
            else {
                pub.emit("state-changed", name, result);
                rep();
            }
        }
        if (data.trigger == "timer")
            led.timer(data.period, cb);
        else if (data.trigger == "oneshot")
            led.oneshot(data.period, cb);
        else
            led.write(data.brightness, "none", cb);
    }

    const me = {
        req: function (req, data, rep) {
            winston.debug("req to cue %s:", par.device, req, data);
            if (req == "change-state")
                set_state(data, rep);
            else if (req == "reset-state")
                set_state(reset, rep);
            else if (req == "get-state")
                led.read(rep);
            else if (req == "get-meta")
                rep(null, meta);
            else if (req == "get-params")
                rep(null, par);
            else
                rep("invalid or unsupported REQ type");
        }
    };

    set_state(reset, function() {});

    return me;
}

module.exports = cues;
