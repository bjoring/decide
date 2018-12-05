/* utility functions */
const mailer = require("smtp-connection");
const os = require("os");
const fs = require("fs");
const _ = require("underscore");
const mt = require("microtime");

// updates fields in object x with corresponding values in object y
function update(x, y) {
    if (y === undefined || y === null) return;
    for (let key in x) {
        if (x.hasOwnProperty(key) && y.hasOwnProperty(key)) {
            x[key] = y[key];
        }
    }
};

// updates fields in object x with values in y, including fields only in y
function extend(x, y) {
    if (y === undefined || y === null) return;
    for (let key in y) {
        if (y.hasOwnProperty(key)) {
            x[key] = y[key];
        }
    }
}

function defaultdict(factory) {
    const _dict = {};

    return function (key) {
        if (!_dict.hasOwnProperty(key))
            _dict[key] = factory(key);
        return _dict[key];
    }
}

// returns time with microsecond precision
function now() {
    return mt.now();
}

// returns a random item from a list
function random_item(arr) {
    let i = Math.floor(Math.random() * arr.length);
    return arr[i];
}

// get server IP address on LAN
function getIPAddress() {
    const interfaces = os.networkInterfaces();
    for (let devName in interfaces) {
        let iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            let alias = iface[i];
            if (alias.family === "IPv4" && alias.address !== "127.0.0.1" && !alias.internal) return alias.address;
        }
    }
    return "0.0.0.0";
}

function load_config(name) {
    return load_json(__dirname + "/../config/" + name);
}

function load_json(path) {
    return JSON.parse(fs.readFileSync(path));
}

// Returns true if BBB_ENV environment variable is 'dummy'
function is_a_dummy() {
    return process.env.BBB_ENV == "dummy"
}


const config = load_config("host-config.json");
function mail(from, to, subject, message, callback) {
    if (!config.mail_transport)
        callback("no mail transport configured");
    else {
        const conn = new mailer(config.mail_transport);
        // try {
            conn.on("connect", function() {
                conn.send({from: from, to: to},
                          "Subject: " + subject + "\n\n" + message,
                          function(err, info) {
                              conn.close();
                              callback(err, info)
                          });
            });
            conn.on("error", callback)
            conn.connect();
        // }
    }
}

function check_subject(name) {
    if (/^[a-zA-Z0-9-]+$/.test(name))
        return name;
    else
        throw "invalid subject name (only alphanumeric characters and dashes)"
}

function check_email(addr) {
    // from http://thedailywtf.com/articles/Validating_Email_Addresses

    if  (/^[-!#$%&'*+\/0-9=?A-Z^_a-z{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z{|}~])*@[a-zA-Z](-?[a-zA-Z0-9])*(\.[a-zA-Z](-?[a-zA-Z0-9])*)+$/.test(addr))
        return addr
    else
        throw "invalid email address"
}

module.exports = {
    update: update,
    defaultdict: defaultdict,
    now: now,
    random_item: random_item,
    getIPAddress: getIPAddress,
    mail: mail,
    load_config: load_config,
    load_json: load_json,
    check_subject: check_subject,
    check_email: check_email,
    is_a_dummy: is_a_dummy
};
