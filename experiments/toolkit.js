// toolkit.js
var _ = require("underscore");
var io = require("socket.io-client");
var winston = require("winston");
var queue = require("queue-async");
var util = require("../lib/util");

var host_params = util.load_config("host-config.json")

/* Toolkit Variables */
var par = {
    name: null,                 // name of program using toolkit
    use_clock: false            // flag, lights are set by clock
}

/* State Machine Setup*/
var state = {
    running: false,     // flag for whether the program is running trials
    phase: "idle"       // present phase of the program
};

var meta = {
    type: "experiment",
    dir: "input",
    variables: {
        running: [true, false],
        phase: ["rewarding",
                "punishing",
                "wating-for-response",
                "evaluating-response",
                "presenting-stimulus",
                "inter-trial"]
    }
};

/* Basic communications */
var pubc, reqc;

function pub(msg) {
    pubc.emit("msg", msg);
}

// This is a wrapper for sending REQ messages. If the response returned is an
// error, the error is logged and the program terminates. If callback is set,
// it"s called with the returned data (using the node convention of sending
// errors in the first argument). To sent an REQ without checking for a
// response, just use reqc.emit directly.
function req(req, data, callback) {
    reqc.emit(req, data, function(msg, repdata) {
        if (/err$/.test(msg))
            error(msg, repdata);
        else if (callback)
            callback(null, msg, repdata);
    });
}



/* Trial Management Functions */
// routes program "name" to apparatus and registers it in experiment
function connect(name, subject, callback) {
    pubc = io.connect("http://localhost:" + host_params.port_int + "/PUB");
    reqc = io.connect("http://localhost:" + host_params.port_int + "/REQ");
    state = { subject: subject, procedure: name, pid: process.pid};

    pubc.once("connect", function() {
        winston.info("connected to bbb-server at %s", pubc.io.uri);
    })

    reqc.once("connect", function() {
        winston.info("connected to bbb-server at %s", reqc.io.uri);
        req("msg", {req: "reset-state", addr: ""});
        req("route", name);
        callback();
    });

    reqc.on("msg", function(msg, rep) {
        // changing state is not supported yet
        if (msg.req == "get-state")
            rep(null, state);
        else if (msg.req == "reset-state")
            rep();
        else if (msg.req == "get-meta")
            rep(null, meta);
        else if (msg.req == "get-params")
            rep(null, par);
        else
            rep("invalid or unsupported REQ type");
    });

    // disconnection is a fatal error because it means messages were lost or delayed
    reqc.once("disconnect", disconnect_error);
}

function disconnect() {

    winston.info("disconnecting from bbb-server at %s", pubc.io.uri);
    req("unroute", state.name, function() {
        req("msg", {req: "reset-state", addr: ""});
        reqc.removeListener(disconnect_error);
        pubc.disconnect();
        reqc.disconnect();
        pubc = null;
        reqc = null;
        winston.info("unregistered and disconnected", pubc.io.uri);
    })

}

// runs trial in a loop if state.running is true, otherwise checks state.running every 65 seconds
function loop(trial) {
    if (state.running === true) {
        trial(function() {
            setTimeout(function() {
                loop(trial);
            }, 2000);
        });
    } else {
        setTimeout(function() {
            loop(trial);
        }, 65000);
    }
}

// sets state.running according to sun"s altitude every minute
function run_by_clock(callback) {
    var initial = true;
    request_lights_state();
    setInterval(request_lights_state, 61000);

    function request_lights_state() {
        reqc.emit("msg", {
            req: "get-state",
            addr: "house_lights"
        }, check_state);
    }

    function check_state(result, data) {
        if (result != "req-ok") winston.error(result);
        if (data.sun_altitude > Math.PI || data.sun_altitude < 0.1) {
            state_update("running", false);
            pubc.emit("msg", {
                addr: par.name,
                event: "log",
                level: "info",
                reason: "night time, " + par.name + " sleeping"
            });
        } else {
            if (state.running === false) {
                state_update("running", true);
                pubc.emit("msg", {
                    addr: par.name,
                    event: "log",
                    level: "info",
                    reason: "day time, " + par.name + "running trials"
                });
            }
            if (initial) {
                initial = false;
                callback();
            }
        }
    }
}

// sends emails on unhandled exceptions
function mail_on_disaster(list) {
    mail_list = list;
    mail_disaster = true;
}

/* Apparatus Manipulation Functions */
// These functions send REQ msgs to apparatus to manipulate component states.
// All follow this format: component("specific_component").action(args),
// with all "args" optional

// manipulates cues (LEDS) of the apparatus
function cue(which) {
    return {
        on: function(duration, callback) {
            write_led(which, true);
            if (duration) setTimeout(function() {
                cue(which).off();
                if (callback) callback();
            }, duration);
        },
        off: function(duration, callback) {
            if (duration) setTimeout(function() {
                cue(which).on();
                if (callback) callback();
            }, duration);
            write_led(which, false, null, null);
        },
        blink: function(duration, interval, callback) {
            var inter = interval ? interval : 300;
            write_led(which, true, "timer", inter);
            if (duration) setTimeout(function() {
                cue(which).off();
                if (callback) callback();
            }, duration);
        }
    };
}

// manipulates hoppers (feeders)
function hopper(which) {
    return {
        feed: function(duration, callback) {
            write_feed(which, true, duration);
            var next = duration + 1000;
            setTimeout(function() {
                if (callback) callback();
            }, next);
        }
    };
}

// manipulates house lights, supports setting brightness both manually and by clock
function lights() {
    var which = "house_lights";
    return {
        man_set: function(brightness, callback) {
            if (par.use_clock) {
                pubc.emit("msg", {
                    addr: par.name,
                    event: "log",
                    level: "error",
                    reason: "clock mode must be off to set brightness manually"
                });
                return;
            }
            write_led(which, brightness);
            if (callback) callback();
        },
        clock_set: function(callback) {
            reqc.emit("msg", {
                req: "change-state",
                addr: "house_lights",
                data: {
                    clock_on: true
                }
            });
            par.use_clock = true;
            if (callback) callback();
        },
        clock_set_off: function(callback) {
            reqc.emit("msg", {
                req: "change-state",
                addr: "house_lights",
                data: {
                    clock_on: false
                }
            });
            if (callback) callback();
        },
        on: function(duration, callback) {
            if (par.use_clock) {
                pubc.emit("msg", {
                    addr: par.name,
                    event: "log",
                    level: "error",
                    reason: "Error: clock mode must be off to set brightness manually"
                });
                return;
            }
            write_led(which, 255);
            if (duration) setTimeout(function() {
                lights().off();
                if (callback) callback();
            }, duration);
        },
        off: function(duration, callback) {
            lights().clock_set_off(function() {
                write_led(which, 0);
            });
            if (duration) setTimeout(function() {
                if (par.use_clock) lights().clock_set();
                else lights().on();
                if (callback) callback();
            }, duration);
        }
    };
}

// checks for responses from apparatus keys
function keys(target) {
    var response = {
        response: "none"
    };
    var correct;
    var timer;
    return {
        response_window: function(duration, callback) {
            timer = setInterval(function() {
                pubc.removeListener("msg");
                clearInterval(timer);
                report();
            }, duration);
            pubc.on("msg", function(msg) {
                if (msg.event == "state-changed" && msg.addr == "keys") {
                    pubc.removeListener("msg");
                    clearInterval(timer);
                    var rep = Object.keys(msg.data);
                    response = {
                        time: msg.time,
                        response: rep[0]
                    };
                    if (target == "none" || !msg.data[target]) correct = false;
                    else if (msg.data[target]) correct = true;
                    report();
                }
            });

            function report() {
                if (response.response != "none") {
                    if (target == "none") correct = false;
                } else {
                    if (target == "none") correct = true;
                    else correct = false;
                    var now = Date.now();
                    response = {
                        time: now,
                        response: "none"
                    };
                }
                response.correct = correct;
                if (callback) callback(response);
            }
        },
        wait_for: function(repeat, callback) {
            pubc.on("msg", function(msg) {
                if (msg.event == "state-changed" && msg.data[target]) {
                    if (repeat === false) pubc.removeListener("msg");
                    var rep = Object.keys(msg.data);
                    var data = {
                        time: msg.time,
                        response: rep[0],
                        target: target
                    };
                    if (callback) callback(data);
                }
            });
        }
    };
}

// play sounds using alsa
function aplayer(what) {
    return {
        play: function(callback) {
            reqc.emit("msg", {
                req: "change-state",
                addr: "aplayer",
                data: {
                    stimulus: what,
                    playing: true
                }
            });
            pubc.on("msg", function(msg) {
                if (msg.event == "state-changed" && msg.data.playing === false) {
                    pubc.removeListener("msg");
                    if (callback) callback();
                }
            });
        }
        // TODO: more functions?
    };
}

// updates states of "active_program"
function state_update(key, new_state) {
    state[key] = new_state;
    var msg = {
        event: "state-changed",
        addr: par.name,
        time: Date.now(),
        data: {}
    };
    msg.data[key] = new_state;
    pub(msg);
}

function log_data(indata, callback) {
    pubc.emit("msg", {
        addr: par.name,
        event: "trial-data",
        data: indata
    });
    if (callback) callback();
}

function log_info(indata, callback) {
    pubc.emit("msg", {
        addr: par.name,
        event: "log",
        level: "info",
        reason: indata
    });
    if (callback) callback();
}

/* Not-Exported Functions */
function write_led(which, state, trigger, period) {
    reqc.emit("msg", {
        req: "change-state",
        addr: which == "house_lights" ? which : "cue_" + which,
        data: {
            brightness: state,
            trigger: trigger ? trigger : null,
            period: period ? period : null
        }
    });
}

function write_feed(which, state, duration) {
    reqc.emit("msg", {
        req: "change-state",
        addr: "feeder_" + which,
        data: {
            feeding: state,
            interval: duration
        }
    });
}

function reset_apparatus(callback) {
    winston.info("resetting apparatus state");
    var def = require(__dirname + "/default_state.json");
    for (var key in def) {
        reqc.emit("msg", {
            req: "change-state",
            addr: key,
            data: def[key]
        });
    }
    if (callback) setTimeout(callback, 2000); // 2  second delay to allow time for all the req to send
}

/* Error handling */
function error(msg) {
    // log fatal error and exit
    winston.error(msg, arguments);
    process.exit(-1);
}

function disconnect_error() {
    error("unexpected disconnection from bbb-server");
}

process.on("uncaughtException", function(err) {
    error("fatal exception:", err);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);


/* Module-izing */
module.exports = {
    initialize: initialize,
    loop: loop,
    run_by_clock: run_by_clock,
    cue: cue,
    lights: lights,
    hopper: hopper,
    keys: keys,
    aplayer: aplayer,
    state_update: state_update,
    log_data: log_data,
    log_info: log_info,
    mail_on_disaster: mail_on_disaster
};
