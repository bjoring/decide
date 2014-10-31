
var fs = require("fs");
var tty = require("tty");
var EV_KEY = 1;

var input = new tty.ReadStream(fs.openSync("/dev/input/event2", "r"));
input.setRawMode(true);

input.on("data", function(chunk) {
    console.log(chunk);
    if (chunk.readUInt16LE(8) === EV_KEY) {
        var keycode = chunk.readUInt16LE(10);
	var data = chunk.readUInt32LE(12);
	var time = chunk.readUInt32LE(0) * 1000 + chunk.readUInt32LE(4) / 1000;
	console.log(keycode, data, time);
    }
});

