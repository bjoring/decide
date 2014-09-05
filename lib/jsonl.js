// this module provides support for streaming line-delimited log records to
// multiple files
var fs = require("fs");

function jsonl(path) {
    var out = fs.createWriteStream(path, { flags: "a", encoding: "utf-8"});

    var write = function (data) {
        out.write(JSON.stringify(data));
        out.write("\n");
    }

    write.close = function() {
        out.close();
    }

    return write;
}

module.exports = jsonl;
