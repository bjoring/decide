// state machine for feeder - uses PRU PWM

const winston = require("winston");
const fs = require("fs");
const path = require("path");
const _ = require("underscore");
const bindings = require("bindings");
const util = require("./util");
const glob = require("glob");

// if the PRU-enabled dts is loaded, this device will be present
const muxfile = glob.sync("/sys/devices/ocp.*/sbd-hoppers.*/state");

const pwm_index = {
    "starboard:hopper:left": 1,
    "starboard:hopper:right": 0
}

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
        max_duty: 1.0,
        mode: "pulse-hold",
        pulse_dur: 100,
        pulse_duty: 35,
        hold_duty: 10,
        default_interval: 4000
    };
    util.update(par, params);

    const state = {
        feeding: false,
        interval: par.default_interval,             // duration of feeding
    };
    const reset = _.clone(state);

    // test that the PRU-enabled dts file is loaded
    // will throw error if the mux-helper device doesn't exist
    fs.readFileSync(muxfile[0]);

    // this will get called once for each feeder, so hopefully the module
    // initialization code is left alone
    const pwm = bindings("pwm");
    const pru_code = path.resolve(__dirname, "../native/pwm.bin");
    winston.debug("loading PRU code from %s", pru_code);
    pwm.start(pru_code);
    winston.debug("%s feeder using PRU-PWM driver", par.device);

    // only once firmware is loaded and running do we set the mux to r30 -
    // otherwise r30 may be in an undefined state
    fs.writeFileSync(muxfile[0], "pruout");

    function set_state(data, rep) {
        if (state.feeding == data.feeding) {
            rep();
            return;
        }
        if (data.interval) state.interval = data.interval;
        state.feeding = data.feeding;
        pub.emit("state-changed", name, state);
        if (data.feeding) {
            pwm.pulse(pwm_index[par.device],
                      par.pulse_duty,
                      par.pulse_dur,
                      par.hold_duty);
            if (state.interval > 0)
                _.delay(set_state, state.interval, {feeding: false}, function() {});
        }
        else {
            pwm.duty(pwm_index[par.device], 0);
        }
        rep();
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
