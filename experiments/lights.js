// lights is the simplest protocol. When running, it sets the lights to follow
// the clock.
var os = require("os");
var winston = require("winston");
var t = require("./toolkit");
var util = require("../lib/util");


t.connect("lights", null, function() {
    req("msg", {req: "change-state", addr: "house_lights", data: {clock_on: true}});
});

process.on("SIGINT", t.disconnect);
process.on("SIGTERM", t.disconnect);
