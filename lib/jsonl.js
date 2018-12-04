// this module provides support for streaming line-delimited log records to
// multiple files
const fs = require("fs");
const winston = require("winston");

function jsonl(path) {
    const enc = "utf-8";
    const fd = fs.openSync(path, "a");
    const out = fs.createWriteStream(null, { fd: fd, encoding: enc});

    const write = function (data) {
        out.write(JSON.stringify(data));
        out.write("\n")
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
