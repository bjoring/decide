
const fs = require("fs");
const tty = require("tty");
const evdev = require("evdev");
const reader = new evdev({raw: true});
reader.on("event", function(data) {
    console.log(data);
});

const dev = reader.open("/dev/input/event1");

// var input = new tty.ReadStream(fs.openSync("/dev/input/event2", "r"));
// input.setRawMode(true);

// input.on("data", function(chunk) {
//     console.log(chunk);
//     if (chunk.readUInt16LE(8) === EV_KEY) {
//         var keycode = chunk.readUInt16LE(10);
//      var data = chunk.readUInt32LE(12);
//      var time = chunk.readUInt32LE(0) * 1000 + chunk.readUInt32LE(4) / 1000;
//      console.log(keycode, data, time);
//     }
// });

function shutdown() {
    console.log("shutting down on user interrupt");
    //dev.stream.close()
    dev.stream.push(null)
    dev.stream.read(0)
    process.exit(0)
}

process.on("SIGINT", shutdown);
//process.on("SIGTERM", shutdown);
