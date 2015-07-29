/* utility functions */
var mailer = require("smtp-connection");
var os = require("os");
var fs = require("fs");
var _ = require("underscore");
var mt = require("microtime");
var pp = require("path");

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

// returns time with microsecond precision
function now() {
    return mt.now();
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

function load_config(name) {
    return load_json(__dirname + "/../config/" + name);
}

function load_json(path) {
    return JSON.parse(fs.readFileSync(path));
}

function StimSet(path) {
    this.config = load_json(path);
    this.root = this.config.stimulus_root;
    this.experiment = this.config.experiment || pp.basename(path, ".json");

    function check_probs(resp, key) {
        var tot = (resp.p_punish || 0) + (resp.p_reward || 0);
        //console.log(key + ": p(tot)=" + tot)
        if (tot > 1.0)
            throw "stimset response consequence probabilities must sum to <= 1.0";
    }

    // validate the probabilities in the stimset
    _.each(this.config.stimuli, function(stim) {
        _.each(stim.responses, check_probs)
    });

    this.generate = function() {
        this.stimuli = _.chain(this.config.stimuli)
            .map(function(stim) { return _.times(stim.frequency, _.constant(stim))})
            .flatten()
            .shuffle()
            .value();
        this.index = 0;
    }


    this.next = function(replace) {
        var n = _.keys(this.stimuli).length;
        if (replace) {
            var index = Math.floor(Math.random() * n);
        }
        else {
            var index = this.index++ % n;
        }
        return this.stimuli[index]
    }

    this.generate();

}

function StimSetPref(path) { //added a stimset for use in preference.js.
    //_.map makes an array
    //_.chain returns an object
    this.config = load_json(path);
    this.root = this.config.stimulus_root;
    this.experiment = this.config.experiment || pp.basename(path, ".json");

    this.generate = function() {

        this.stimuli = _.mapObject(this.config.choices,
                             function(val,key) {return _.chain(val.stimuli)
                                         .map(function(stim) {return _.times(stim.frequency, _.constant(stim))})
                                         .flatten()
                                         .shuffle()
                                         .value()
                                        });

        this.index = 0;
    }

    this.next = function(replace, pecked) {
        var n = _.keys(this.stimuli[pecked]).length;
        if (replace) {
            var index = Math.floor(Math.random() * n);
        }
        else {
            var index = this.index++ % n;
        }
                        return this.stimuli[pecked][index];
    }

    this.generate();

}

var config = load_config("host-config.json");
function mail(from, to, subject, message, callback) {
    if (!config.mail_transport)
        callback("no mail transport configured");
    else {
        var conn = new mailer(config.mail_transport);
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
    getIPAddress: getIPAddress,
    mail: mail,
    load_config: load_config,
    load_json: load_json,
    StimSet: StimSet,
        StimSetPref: StimSetPref,
    check_subject: check_subject,
    check_email: check_email
};
