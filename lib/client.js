// toolkit.js
var _ = require("underscore");
var http = require("http");
var io = require("socket.io-client");
var logger = require("winston");
var queue = require("queue-async");
var util = require("../lib/util");
var jsonl = require("../lib/jsonl");

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
    logger.debug("sent req:", req, data)
    sock.emit(req, data, function(msg, results) {
        logger.debug("received response:", msg, results);
        if (msg == "err")
            error(results);
        else if (callback)
            callback(null, results);
    });
}

// sends a state-changed message
function state_changed(name, data, time) {
    sock.emit("state-changed", {name: name, time: time || Date.now(), data: data});
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
    var triallog =  util.defaultdict(jsonl);
}
// sends a trial log message, logging locally if configured
function trial_data(name, data, time) {
    var t = time || Date.now();
    sock.emit("trial-data", {name: name, time: t, data: data});
    if (host_params.log_local_trials) {
        var record = _.extend({time: t}, data)
        triallog(data.subject + "_" + name + ".jsonl")(record);
    }
}

/* Trial Management Functions */
// routes program "name" to apparatus and registers it in experiment. Once the
// connection is established, callback is called with the socket as an argument.
// If the connection is lost before disconnect is called, an error will occur.
function connect(name, callback) {

    // NB: have to use transports option for remote to get our IP
    sock = io.connect("http://localhost:" + host_params.port_ctrl,
                      {transports: ["websocket"]});

    sock.once("connect", function() {
        logger.info("connected to controller at %s", sock.io.uri);

        if (host_params.log_local_events) {
            logger.info("logging event data to current directory");
            var eventlog = jsonl("events.jsonl");
            sock.on("state-changed", function(msg) {
                // flatten the map
                eventlog(_.extend({name: msg.name, time: msg.time}, msg.data));
            });
        }

        // check that an experiment is not already running
        sock.emit("get-state", {name: "experiment"}, function(msg, result) {
            if (msg == "err")
                error(results);
            else if (result.procedure)
                error("controller is already running an experiment");
        })
        queue()
            .defer(req, "reset-state", {name: ""})
            .defer(req, "route", {name: name})
            .await(function(err, results) {
                req("change-state",
                    {name: "experiment", data: {procedure: name, pid: process.pid} });
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
    var timer;
    var running = true;

    function _listen(msg) {
        logger.debug("await @%s got event", name, msg);
        if (!running) return;
        if (msg && msg.name != name) return;
        if (test && !test(msg)) return;
        var time = (msg) ? msg.time : Date.now();
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

// state machine for adjusting lighting with the sun position. The update_state
// argument is a function that used to notify changes to the state
function ephemera(update_state) {
    var name = "house_lights";

    // turn on house lights
    req("change-state", {name: name, data: { clock_on: true }});

    daytime = function() {
        update_state({daytime: true});
        await(name, null, function(msg) { return !msg.data.daytime }, nighttime);
    }

    nighttime = function() {
        update_state({daytime: false})
        await(name, null, function(msg) { return msg.data.daytime }, daytime);
    }

    daytime();
}

// start an event loop to generate heartbeat log messages. These messages are
// useful for calculating activity statistics in that they allow distinguishing
// between blocks with no activity and blocks when the program wasn't running.
function heartbeat(data) {
    var name = data["program"];
    data["comment"] = "heartbeat";
    var timer = setInterval(function() {
        trial_data(name, data);
    }, host_params.heartbeat_interval)
    // allows node to exit
    timer.unref();
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
    state_changed: state_changed,
    state_changer: state_changer,
    trial_data: trial_data,
    await: await,
    error: error,
    ephemera: ephemera,
    heartbeat: heartbeat
};
