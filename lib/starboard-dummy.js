/*
 * dummy interface to hardware devices on starboard using gpio-led and gpio-key drivers.
 *
 * Maintains internal state, but otherwise doesn't interact with any system hardware.
 */

var state = {};

f = {};

f.read_eeprom = function(bus_addr, callback) {
    callback(null,  {
        board: 'BeagleBone Starboard Cape (software dummy)',
        part: 'BBB-StarBoard',
        revision: '00A2',
        serial: '271400000000'
    });
};

f.init_overlay = function(board, revision) {};

f.led_read = function(led, callback) {
    // reads the current brightness of LED and returns it in a callback. This is
    // broken for timer and oneshot modes, but I don't think this fxn gets used much.
    callback(null, state[led] || {trigger: null, brightness: 0});
};

f.led_write = function(led, value, callback) {
  // write a value to an LED. The LED trigger is set to 'none' and value is
  // written to brightness. For LEDs on a GPIO, any nonzero value turns the LED
  // on. For LEDs on a PWM, the value determines the duty of the timer. When the
  // write is complete, callback(err, {"led": led, "value": value}) is called.
    state[led] = { trigger: null, brightness: value};
    callback(null, state[led]);
};

f.led_timer = function(led, ms_period, callback) {
  // flash an LED using the internal kernel timer. The LED trigger is set to
  // 'timer' and the ms_period value is used to set the timer period (duty cycle
  // is always 50%). When the setup is complete, callback is called. The
  // behavior during the first cycle may be undefined if the default on and off
  // times are different from the ones requested. Use led_write to turn the
  // timer off.
    state[led] = { trigger: "timer", brightness: 1, period: ms_period};
    callback(null, state[led]);
};

f.led_oneshot = function(led, ms_on, callback) {
  // Turn on a LED once for a specified period of time. The LED trigger is set
  // to 'oneshot'. When the LED is turned on, the callback is called. There
  // doesn't seem to be a way to generate a callback when the event is over. If
  // this is important, use led_write
    state[led] = { trigger: "oneshot", brightness: 1, period: ms_period};
    callback(null, state[led]);
};

module.exports = f;
