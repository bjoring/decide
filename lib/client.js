// toolkit.js
const _ = require("underscore");
const http = require("http");
const io = require("socket.io-client");
const logger = require("winston");
const queue = require("queue-async");
const util = require("../lib/util");
const jsonl = require("../lib/jsonl");

const host_params = util.load_config("host-config.json")

/* Basic communications */
let sock;
let triallog;

// This is a wrapper for sending REQ messages, which are always associated with
// a response. If the response returned is an error, the error is logged and the
// program terminates (because this implies a programming error on the client's
// part. If callback is set, it"s called with the returned data (using the node
// convention of sending errors in the first argument, but the error is always
// null).
function req(req, data, callback) {
    if (!sock) return;
    logger.debug("sent req:", req, data)
    sock.emit(req, data, function(msg, results) {
        logger.debug("received response:", msg, results);
        if (msg == "err")
            error(results);
        else if (callback)
            callback(null, results);
    });
}

function change_state(name, new_state, callback) {
    req("change-state", _.extend({name: name}, new_state), callback);
}

// sends a state-changed message
function state_changed(name, data, time) {
    sock.emit("state-changed", _.extend({name: name, time: time || util.now()},
                                        data));
}

// bind a state object in a closure for updates
function state_changer(name, state) {
    return function (kwargs) {
        _.extend(state, kwargs);
        state_changed(name, kwargs);
    }
}

if (host_params.log_local_trials) {
    logger.info("logging trial data to current directory");
    triallog = util.defaultdict(jsonl);
}

// sends a trial log message, logging locally if configured
function trial_data(name, data, time) {
    let out = _.extend({name: name, time: time || util.now()}, data);
    sock.emit("trial-data", out);
    if (host_params.log_local_trials) {
        triallog(data.subject + "_" + name + ".jsonl")(_.omit(out, "name"));
    }
}

/* Trial Management Functions */
// routes program "name" to apparatus and registers it in experiment. Once the
// connection is established, callback is called with the socket as an argument.
// If the connection is lost before disconnect is called, an error will occur.
function connect(name, callback) {

    // NB: have to use transports option for remote to get our IP
    sock = io.connect("http://localhost:" + host_params.port_ctrl);
//                      {transports: ["websocket"]});

    sock.once("connect", function() {
        logger.info("connected to controller at %s", sock.io.uri);

        if (host_params.log_local_events) {
            logger.info("logging event data to current directory");
            let eventlog = jsonl("events.jsonl");
            sock.on("state-changed", eventlog);
        }

        // check that an experiment is not already running
        req("get-state", {name: "experiment"}, function(err, result) {
            if (result.procedure)
                error("controller is already running an experiment");
        })
        queue()
            .defer(req, "reset-state", {name: ""})
            .defer(req, "route", {name: name})
            .await(function(err, results) {
                req("change-state",{name: "experiment",
                                    procedure: name,
                                    pid: process.pid});
                if (callback) callback(sock);
            });

    });

    sock.on("disconnect", disconnect_error);
}

// disconnect without throwing an error
function disconnect(callback) {
    logger.info("disconnecting from decide-host");
    queue()
        .defer(req, "unroute")
        .defer(req, "reset-state", { name: ""})
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
function await(name, timeout, test, callback) {
    let timer;
    let running = true;

    function _listen(msg) {
        logger.debug("await @%s got event", name, msg);
        if (!running) return;
        if (msg && msg.name != name) return;
        if (test && !test(msg)) return;
        let time = (msg) ? msg.time : util.now();
        _exit(time);
    }

    function _exit(time) {
        logger.debug("await @%s exiting at", name, time);
        running = false;
        sock.removeListener("state-changed", _listen);
        clearTimeout(timer);
        callback(time);
    }

    if (name)
        sock.on("state-changed", _listen);
    if (timeout)
        timer = setTimeout(_listen, timeout);

    return timer;
}

//keeps track of the state of just peck center for now
function monitor() {
    let occupied;
    sock.on("state-changed", function(msg) {
            if (msg.name == "peck_center")
                occupied = msg; //if peck_center is true, occupied is true
            logger.debug("peck_center changed state to ", occupied);
});
    return occupied;
}

// state machine for adjusting lighting with the sun position. The update_state
// argument is a function that used to notify changes to the state
function ephemera(update_state) {
    const name = "house_lights";

    // turn on house lights
    req("change-state", {name: name, clock_on: true});

    daytime = function() {
        update_state({daytime: true});
        await(name, null, function(msg) { return !msg.daytime }, nighttime);
    }

    nighttime = function() {
        update_state({daytime: false})
        await(name, null, function(msg) { return msg.daytime }, daytime);
    }

    daytime();
}

// start an event loop to generate heartbeat log messages. These messages are
// useful for calculating activity statistics in that they allow distinguishing
// between blocks with no activity and blocks when the program wasn't running.
function heartbeat(name, data) {
    data["comment"] = "heartbeat";
    let timer = setInterval(function() {
        req("get-state", {name: "experiment"}, function(err, result) {
            if (result.active)
                trial_data(name, data);
        })
    }, host_params.heartbeat_interval)
    // allows node to exit
    timer.unref();
}

/* some utility functions */
// Plays one or more stimuli. If stim is a string, plays the stimulus; if it's
// an array of strings, plays the files in sequence
function play_stims(stims, isi, root, callback) {
    // if the stimulus is an array, play the sounds in sequence
    const playlist = (typeof stims === "object") ? stims : [stims];

    function play_stims(stim, rest) {
        change_state("aplayer", {playing: true,
                                   stimulus: stim + ".wav",
                                   root: root});
        await("aplayer", null, function(msg) { return msg && !msg.playing }, function() {
            if (rest.length > 0)
                _.delay(play_stims, isi, _.first(rest), _.rest(rest));
            else
                callback();
        })
    }
    play_stims(_.first(playlist), _.rest(playlist));
}

// this is a utility function for setting a bunch of cues either on or off
function set_cues(cuelist, value) {
    _.map(cuelist || [], function(cue) {
        change_state("cue_" + cue, {brightness: value})
    });
}

/* Error handling */
function error(msg) {
    // log fatal error and exit
    logger.error(msg);
    process.exit(-1);
}

function disconnect_error() {
    error("unexpected disconnection from controller");
}

/* Module-izing */
module.exports = {
    connect: connect,
    disconnect: disconnect,
    req: req,
    change_state: change_state,
    state_changed: state_changed,
    state_changer: state_changer,
    trial_data: trial_data,
    await: await,
    play_stims: play_stims,
    set_cues: set_cues,
    error: error,
    ephemera: ephemera,
    heartbeat: heartbeat
};
