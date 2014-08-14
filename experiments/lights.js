var os = require("os");
var winston = require("winston");
var t = require("./toolkit");
var util = require("../lib/util");

t.connect("lights", null, function() {
    setTimeout(function() {
        t.disconnect();
    }, 2000);
})
