/* utility functions */

module.exports = {};

// updates fields in object x with corresponding values in object y
module.exports.update = function(x, y) {
  for (var key in x) {
    if (x.hasOwnProperty(key) && y.hasOwnProperty(key)) {
      x[key] = y[key];
    }
  }
};

// updates fields in object x with values in y, including fields only in y
module.exports.extend = function(x, y) {
  for (var key in y) {
    if (y.hasOwnProperty(key)) {
      x[key] = y[key];
    }
  }
};

// creates a mini state machine that emits an event after an interval (in ms)
module.exports.make_timer = function(interval, id, callback) {
  if (interval && interval > 0) {
    setTimeout(function() { callback({id: "tick",
                               time: Date.now(),
                               interval: interval,
                               source: "timer"})},
               interval);
  }
}
