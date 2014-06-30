// broker routes messages to and from components of apparatus

var winston = require("winston");

var eeprom = require("./eeprom");
var cues = require("./cues");
var feeder = require("./feeder");
var keys = require("./keys");
var lights = require("./lights");
var util = require("./util");

// components of the apparatus
var apparatus = {
  cape: [eeprom, {bus_addr: "0-0054"}],
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
  keys: [keys, {}]
};

var components = {
};

// deal with stupid javascript loop binding problem
function make_callback(key) {
  return function(err, data, time) {
    // publish results of event callbacks from components
    msg = {
      addr: key,
      time: time || Date.now(),
    };
    if (err) {
      msg.event = "log";
      msg.level = "error";
      msg.reason = err;
    }
    else {
      msg.event = "state-changed",
      msg.data = data;
    }
    pub(msg);
  }
}

// initialize apparatus
function init(params) {

  if (!arguments.length) params = {};

  // instantiate each element and specify callback
  for (var key in apparatus) {
    var klass = apparatus[key][0];
    var par   = apparatus[key][1];
    util.update(par, params[key]);
    var k = key;
    winston.info("initializing " + key + ":", par);
    // stupid javascript binding rules
    register(key, new (klass)(par, make_callback(key)));
  }
}

// broadcast pub messages to all components (excluding the source)
function pub(msg) {
  winston.log("pub", msg);
  for (var key in components) {
    if (key != msg.addr)
      components[key].pub(msg);
  }
}

// route req messages
function req(msg) {
  // address should already be stripped of any leading elements
  // change-state can only be routed to a single recipient
  winston.log("req", msg);
  if (msg.req == "change-state") {
    if (msg.addr in components) {
      return components[msg.addr].req(msg);
    }
  }
  else if (msg.addr in components) {
    return components[msg.addr].req(msg);
  }
  else if (msg.addr == "") {
    out = {};
    for (var key in components) {
      out[key] = components[key].req(msg);
    }
    return out;
  }
}

function register(key, obj) {
  components[key] = obj;
  pub({
    addr: "",
    time: Date.now(),
    event: "log",
    level: "info",
    reason: "component registered: " + key
  });
}

function unregister(key, obj) {
  components[key] = obj;
  pub({
    addr: "",
    time: Date.now(),
    event: "log",
    level: "info",
    reason: "component unregistered: " + key
  });
}

module.exports = {
  init: init,
  pub: pub,
  req: req,
  register: register,
  unregister: unregister
};
