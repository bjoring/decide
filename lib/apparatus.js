// broker routes messages to and from components of apparatus
const winston = require("winston");
const queue = require("queue-async");
const events = require("events");
const _ = require("underscore");
const util = require("./util");

// all drivers need to be imported here
const drivers = {
    eeprom: require("./eeprom"),
    cue_leds: require("./cue-leds"),
    feeder_leds: require("./feeder-leds"),
    key_evdev: require("./key-evdev"),
    key_peckboard: require("./key-peckboard"),
    lights_leds: require("./lights-leds"),
    sound_aplayer: require ("./sound-aplayer"),
    sound_dummy: require("./sound-dummy"),
    sound_jstim: require("./sound-jstim"),
    experiment:  require("./experiment")
};

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

    // instantiate each element and specify callback
    for (let component of params) {
        let key = component.name;
        let driver = component.driver;
        let par   = component.params;
        register(key, driver, par);
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

function register(key, driver, par) {
    let f;
    if (typeof driver === 'function')
        f = driver;
    else {
        winston.debug("attempting to instantiate %s", driver);
        f = drivers[driver];
    }
    components[key] = f(par, key, pub);
    winston.info("component registered: " + key);
    return components[key]
}

function unregister(key) {
    if (is_registered(key)) {
        const component = components[key];
        if (component.disconnect)
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
