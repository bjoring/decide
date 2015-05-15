// this module provides support for streaming line-delimited log records to
// multiple files
var fs = require("fs");
var winston = require("winston");

function jsonl(path) {
    var enc = "utf-8";
    var fd = fs.openSync(path, "a");
    var out = fs.createWriteStream(null, { fd: fd, encoding: enc});

    var write = function (data) {
        out.write(JSON.stringify(data));
        if (!out.write("\n"))
            winston.error("unable to write to", path);
    }

    // used to sync write a sequence of entries after the stream is closed
    write.end = function(seq) {
        seq.forEach(function(d) {
            fs.writeSync(fd, JSON.stringify(d));
            fs.writeSync("\n");
        });
        fs.fsyncSync(fd);
    }

    write.close = function() {
        out.end();
        console.log("closing");
    }

    return write;
}

module.exports = jsonl;
