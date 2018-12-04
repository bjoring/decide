// broker routes messages to and from components of apparatus
const winston = require("winston");
const queue = require("queue-async");
const events = require("events");
const _ = require("underscore");

const eeprom = require("./eeprom");
const cues = require("./cues");
const feeder = require("./feeder");
const keys = require("./keys");
const lights = require("./lights");
const aplayer = require ("./aplayer");
const experiment = require("./experiment");
const util = require("./util");

// components of the apparatus. Each component needs to provide the following methods:
//
// constructor(params, pub): params - dict of parameters for the
// component. pub is an EventEmitter than can be used to send and receive PUB
// messages (see spec)
//
// req(msg, rep): called whenever the component recieves an REQ. msg - the
// message. rep(err, data) - callback to return a response. IMPORTANT: most
// clients expect a response, so this method MUST BE CALLED ONCE AND ONLY ONCE.
// Call with no arguments to indicate a successful operation.
//
const apparatus = {
    cape: [eeprom, {bus_addr: "1-0054"}],
    house_lights: [lights, {device: "starboard::lights"}],
    cue_left_red: [cues, {device: "starboard:left:red"}],
    cue_left_green: [cues, {device: "starboard:left:green"}],
    cue_left_blue: [cues, {device: "starboard:left:blue"}],
    cue_center_red: [cues, {device: "starboard:center:red"}],
    cue_center_green: [cues, {device: "starboard:center:green"}],
    cue_center_blue: [cues, {device: "starboard:center:blue"}],
    cue_right_red: [cues, {device: "starboard:right:red"}],
    cue_right_green: [cues, {device: "starboard:right:green"}],
    cue_right_blue: [cues, {device: "starboard:right:blue"}],
    feeder_left: [feeder, {device: "starboard:hopper:left"}],
    feeder_right: [feeder, {device: "starboard:hopper:right"}],
    keys: [keys, { device: "/dev/input/by-path/platform-sbd-keys-event"}],
    hopper: [keys, { device: "/dev/input/by-path/platform-sbd-hopdet-event", keymap: ["up"]}],
    aplayer: [aplayer, {}],
    experiment: [experiment, {}],
};

const components = {};

// event handler for pub messages from components - this allows components
// to both broadcast and subscribe to events
const pub = new events.EventEmitter();

pub.state_changed = function (name, changed, state) {
    if (state) _.extend(state, changed);
    pub.emit("state-changed", name, changed);
}

// initialize apparatus
function init(params) {

    if (!arguments.length) params = {};

    // instantiate each element and specify callback
    for (let key in apparatus) {
        let klass = apparatus[key][0];
        let par   = apparatus[key][1];
        register(key, klass, _.extend(par, params[key]));
    }
}

// route req messages.
function req(msg, data, rep) {
    // address should already be stripped of any leading elements
    // change-state can only be routed to a single recipient
    winston.log("req", msg, data);
    let name = data.name;
    data = _.omit(data, "name")
    if (name == "" && msg != "change-state") {
        let keys = _.keys(components);
        let q = queue();
        keys.forEach(function(k) {
            q.defer(components[k].req, msg, data);
        });
        q.awaitAll(function(err, results) {
            // presuming order does not change!
            rep(err, _.object(keys, results));
        })
    }
    else if (_.has(components, name)) {
        components[name].req(msg, data, rep);
    }
    else
        rep("component does not exist " + name);
}

function register(key, klass, par) {
    components[key] = klass(par, key, pub);
    winston.info("component registered: " + key);
    return components[key]
}

function unregister(key) {
    if (is_registered(key)) {
        const component = components[key];
        if (_.has(component, "disconnect"))
            component.disconnect();
        delete components[key];
        // notifies subscribers that this component is not part of the state any more
        pub.emit("state-changed", key, undefined);
        winston.info("component unregistered: " + key);
    }
}

function is_registered(key) {
    return _.has(components, key);
}

// cleanup on each component
function shutdown() {
    const keys = _.keys(components);
    keys.forEach(unregister);
}

module.exports = {
    init: init,
    pub: pub,
    req: req,
    register: register,
    unregister: unregister,
    is_registered: is_registered,
    shutdown: shutdown
};
