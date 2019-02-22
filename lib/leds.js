/*
 * interface to hardware devices using gpio-led and pwm-led drivers.
 *
 * We try to throw errors on construction but return them in callbacks for
 * methods. However, there are quite a few sync calls in methods that should
 * probably be removed.
 */

const fs = require("fs");
const glob = require("glob");
const queue = require("queue-async");

const util = require("./util");

function led(id) {

    const path = "/sys/class/leds/" + id;
    const fd_trig = fs.openSync(path + "/trigger", "r+");
    const fd_val = fs.openSync(path + "/brightness", "r+");
    const buf_trig = new Buffer(128);
    const buf_val = new Buffer(8);

    this.read = function(callback) {
        queue()
            .defer(fs.read, fd_trig, buf_trig, 0, buf_trig.length, 0)
            .defer(fs.read, fd_val, buf_val, 0, buf_val.length, 0)
            .await(function(err, n1, n2) {
                if (callback) {
                    if (err) callback(err);
                    else callback(null, {
                        trigger: /\[(\w+)\]/.exec(buf_trig)[1],
                        brightness: parseInt(buf_val.toString("utf-8", 0, n2))
                    });
                }
        })
    };

    this.write = function(value, trigger, callback) {
        const val = (value*1).toString();
        queue()
            .defer(fs.write, fd_trig, trigger, 0)
            .defer(fs.write, fd_val, val, 0)
            .await(function(err, n1, n2) {
                if (callback) {
                    if (err) callback(err)
                    else callback(null, {
                        brightness: value,
                        trigger: trigger,
                    });
                }
            });
    };

    this.timer = function(ms_period, callback) {
        fs.writeSync(fd_trig, "timer", 0);
        queue()
            .defer(fs.writeFile, path + "/delay_on", ms_period / 2)
            .defer(fs.writeFile, path + "/delay_off", ms_period / 2)
            .await(function(err) {
                if (callback) {
                    if (err) {
                        callback(err);
                    }
                    else callback(null, {
                        brightness: 1,
                        trigger: "timer",
                        period: ms_period
                    });
                }
            });
    };

    this.oneshot = function(ms_on, callback) {
        fs.writeSync(fd_trig, "oneshot", 0);
        queue()
            .defer(fs.writeFile, path + "/delay_on", ms_on)
            .defer(fs.writeFile, path + "/delay_off", "0")
            .await(function(err) {
                if (err) {
                    if (callback) callback(err);
                    return;
                }
                fs.writeFile(id + "/shot", 1, function(err) {
                    if (callback) {
                        if (err) callback(err);
                        else callback(null, {
                            brightness: 1,
                            trigger: "oneshot",
                            period: ms_on
                        });
                    }
                });
            });
    };
};

function dummy_led(id) {

    const state = {trigger: null, brightness: 0};

    this.read = function(callback) {
        callback(null, state);
    };

    this.write = function(value, trigger, callback) {
        util.update(state, {trigger: trigger, brightness: value});
        callback(null, state);
    };

    this.timer = function(ms_period, callback) {
        util.update(state, {trigger: "timer", period: ms_period, brightness: 1});
        callback(null, state);
    };

    this.oneshot = function(ms_on, callback) {
        util.update(state, {trigger: "oneshot", period: ms_on, brightness: 1});
        callback(null, state);
    };
};

if (util.is_a_dummy())
    module.exports = dummy_led;
else
    module.exports = led;
