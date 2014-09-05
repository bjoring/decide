/* utility functions */
var mailer = require("nodemailer").createTransport();
var os = require("os");
var fs = require("fs");

// updates fields in object x with corresponding values in object y
function update(x, y) {
    if (y === undefined || y === null) return;
    for (var key in x) {
        if (x.hasOwnProperty(key) && y.hasOwnProperty(key)) {
            x[key] = y[key];
        }
    }
};

// updates fields in object x with values in y, including fields only in y
function extend(x, y) {
    if (y === undefined || y === null) return;
    for (var key in y) {
        if (y.hasOwnProperty(key)) {
            x[key] = y[key];
        }
    }
}

function defaultdict(factory) {
    var _dict = {};

    return function (key) {
        if (!_dict.hasOwnProperty(key))
            _dict[key] = factory(key);
        return _dict[key];
    }
}

// get server IP address on LAN
function getIPAddress() {
    var interfaces = os.networkInterfaces();
    for (var devName in interfaces) {
        var iface = interfaces[devName];
        for (var i = 0; i < iface.length; i++) {
            var alias = iface[i];
            if (alias.family === "IPv4" && alias.address !== "127.0.0.1" && !alias.internal) return alias.address;
        }
    }
    return "0.0.0.0";
}

function mail(from, to, subject, message, callback) {
    mailer.sendMail({
        from: from + "@" + os.hostname(),
        to: to,
        subject: subject,
        text: message,
    }, function() {
        if (callback) callback();
    });
}

function load_config(name) {
    return JSON.parse(fs.readFileSync(__dirname + "/../config/" + name));
}

module.exports = {
    update: update,
    defaultdict: defaultdict,
    getIPAddress: getIPAddress,
    mail: mail,
    load_config: load_config

};
