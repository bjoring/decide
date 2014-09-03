// toolkit.js
var _ = require("underscore");
var http = require("http");
var io = require("socket.io-client");
var winston = require("winston");
var queue = require("queue-async");
var util = require("../lib/util");

if (process.env.NODE_ENV == 'debug') {
    winston.level = 'debug';
}

var host_params = util.load_config("host-config.json")

/* Basic communications */
var sock;

// This is a wrapper for sending REQ messages, which are always associated with
// a response. If the response returned is an error, the error is logged and the
// program terminates (because this implies a programming error on the client's
// part. If callback is set, it"s called with the returned data (using the node
// convention of sending errors in the first argument, but the error is always
// null).
function req(req, data, callback) {
    if (!sock) return;
    winston.debug("sent req:", req, data)
    sock.emit(req, data, function(msg, results) {
        winston.debug("received response:", msg, results);
        if (msg == "err")
            error(results);
        else if (callback)
            callback(null, results);
    });
}


/* Trial Management Functions */
// routes program "name" to apparatus and registers it in experiment. Once the
// connection is established, callback is called with the socket as an argument.
// If the connection is lost before disconnect is called, an error will occur.
function connect(name, callback) {

    sock = io.connect("http://localhost:" + host_params.port_int);

    sock.once("connect", function() {
        winston.info("connected to bbb controller at %s", sock.io.uri);
        // check that an experiment is not already running
        sock.emit("get-state", {addr: "experiment"}, function(msg, result) {
            if (msg == "err")
                error(results);
            else if (result.procedure)
                error("controller is already running an experiment");
        })
        queue()
            .defer(req, "reset-state", {addr: ""})
            .defer(req, "route", {ret_addr: name})
            .await(function(err, results) {
                req("change-state",
                    {addr: "experiment", data: {procedure: name, pid: process.pid} });
            });
        if (callback) callback(sock);
    });

    sock.once("disconnect", disconnect_error);
}

// disconnect without throwing an error
function disconnect(callback) {
    winston.info("disconnecting from bbb-server");
    queue()
        .defer(req, "unroute")
        .defer(req, "reset-state", { addr: ""})
        .await(function(err, results) {
            sock.removeAllListeners();
            sock.disconnect();
            sock = null;
            if (callback) callback();
        });
}

// await a state-changed message from addr. If test is defined, it's passed the
// message and must return true or false. If test is undefined or returns true,
// callback is executed
function await(addr, test, callback) {
    function _listen(msg) {
        if (msg.addr != addr) return;
        if (test ? test(msg) : true) {
            sock.removeListener("state-changed", _listen);
            callback();
        }
    }
    sock.on("state-changed", _listen);
}

// sends a state-changed message
function state_changed(addr, data, time) {
    sock.emit("state-changed", {addr: addr,
                                time: time || Date.now(),
                                data: data});
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
        sock.emit("msg", {
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
            sock.emit("msg", {
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
            sock.emit("msg", {
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
    var addr = "aplayer";

    return {
        play: function(callback) {

            sock.emit("change-state", {
                addr: addr,
                data: {
                    stimulus: what,
                    playing: true
                }
            });
            await(addr, function(msg) { return !msg.data.playing }, callback)
        }
        // TODO: more functions?
    };
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
    sock.emit("change-state", {
        addr: which == "house_lights" ? which : "cue_" + which,
        data: {
            brightness: state,
            trigger: trigger ? trigger : null,
            period: period ? period : null
        }
    });
}

function write_feed(which, state, duration) {
    sock.emit("change-state", {
        addr: "feeder_" + which,
        data: {
            feeding: state,
            interval: duration
        }
    });
}

/* Error handling */
function error(msg) {
    // log fatal error and exit
    winston.error(msg);
    process.exit(-1);
}

function disconnect_error() {
    error("unexpected disconnection from bbb-server");
}


/* Module-izing */
module.exports = {
    connect: connect,
    disconnect: disconnect,
    req: req,
    state_changed: state_changed,
    await: await,
    error: error,
    loop: loop,
    run_by_clock: run_by_clock,
    cue: cue,
    lights: lights,
    hopper: hopper,
    keys: keys,
    aplayer: aplayer,
    log_data: log_data,
    log_info: log_info,
};
