/*
 * dummy interface to hardware devices on starboard using gpio-led and gpio-key drivers.
 *
 * Maintains internal state, but otherwise doesn't interact with any system hardware.
 */

var f = {};

f.read_eeprom = function(bus_addr, callback) {
    callback({
        board: 'BeagleBone Starboard Cape (software dummy)',
        part: 'BBB-StarBoard',
        revision: '00A2',
        serial: '271400000000'
    });
};

f.init_overlay = function(board, revision) {};

f.led = function(led) {

    var state = {trigger: null, brightness: 0};

    this.read = function(callback) {
        callback(state);
    };

    this.write = function(value, trigger, callback) {
        state = {trigger: trigger, brightness: value};
        callback(state);
    };

    this.timer = function(ms_period, callback) {
        state = {trigger: "timer", period: ms_period, brightness: 1};
    };

    this.oneshot = function(ms_on, callback) {
        state = {trigger: "oneshot", period: ms_on, brightness: 1};
    };
};

module.exports = f;
