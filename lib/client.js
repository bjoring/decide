// toolkit.js
var _ = require("underscore");
var http = require("http");
var io = require("socket.io-client");
var winston = require("winston");
var queue = require("queue-async");
var util = require("../lib/util");
var jsonl = require("../lib/jsonl");

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

// sends a state-changed message
function state_changed(addr, data, time) {
    sock.emit("state-changed", {addr: addr, time: time || Date.now(), data: data});
}

// bind a state object in a closure for updates
function state_changer(name, state) {
    return function (kwargs) {
        _.extend(state, kwargs);
        state_changed(name, kwargs);
    }
}

if (host_params.log_local_trials) {
    winston.info("logging trial data to current directory");
    var triallog =  util.defaultdict(jsonl);
}
else
    var triallog = util.defaultdict(function() {});
// sends a trial log message, logging locally if configured
function trial_data(addr, data, time) {
    var t = time || Date.now();
    sock.emit("trial-data", {addr: addr, time: t, data: data});
    var record = _.extend({addr: addr, time: t}, data)
    triallog(data.subject + "_" + addr + ".jsonl")(record);
}

/* Trial Management Functions */
// routes program "name" to apparatus and registers it in experiment. Once the
// connection is established, callback is called with the socket as an argument.
// If the connection is lost before disconnect is called, an error will occur.
function connect(name, callback) {

    // NB: have to use transports option for remote to get our IP
    sock = io.connect("http://localhost:" + host_params.port_ctrl, {transports: ["websocket"]});

    sock.once("connect", function() {
        winston.info("connected to bbb controller at %s", sock.io.uri);


        if (host_params.log_local_events) {
            winston.info("logging event data to current directory");
            var eventlog = jsonl("events.jsonl");
            sock.on("state-changed", function(msg) {
                // flatten the map
                eventlog(_.extend({addr: msg.addr, time: msg.time}, msg.data));
            });
        }

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

// This is a minature state machine that awaits a state-changed message from
// addr or optionally times out. If a message is recieved, it's passed to test.
// If test returns true, or if a timeout occurs, callback is invoked and the
// state machine stops.
function await(addr, timeout, test, callback) {
    var timer;
    var running = true;

    function _listen(msg) {
        if (!running) return;
        if (msg && msg.addr != addr) return;
        if (test && !test(msg)) return;
        var time = (msg) ? msg.time : Date.now();
        _exit(time);
    }

    function _exit(time) {
        running = false;
        callback(time);
        sock.removeListener("state-changed", _listen);
        clearTimeout(timer);
    }

    if (addr)
        sock.on("state-changed", _listen);
    if (timeout)
        timer = setTimeout(_listen, timeout);

    return timer;
}

// state machine for adjusting lighting with the sun position. The update_state
// argument is a function that used to notify changes to the state
function ephemera(update_state) {
    var addr = "house_lights";

    // turn on house lights
    req("change-state", {addr: addr, data: { clock_on: true }});

    daytime = function() {
        update_state({daytime: true});
        await(addr, null, function(msg) { return !msg.data.daytime }, nighttime);
    }

    nighttime = function() {
        update_state({daytime: false})
        await(addr, null, function(msg) { return msg.data.daytime }, daytime);
    }

    daytime();
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
    state_changer: state_changer,
    trial_data: trial_data,
    await: await,
    error: error,
    ephemera: ephemera,
    loop: loop,
    run_by_clock: run_by_clock,
    cue: cue,
    lights: lights,
    hopper: hopper,
    keys: keys,
    aplayer: aplayer,
    log_info: log_info,
};
