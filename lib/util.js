/* utility functions */
f = {};

// updates fields in object x with corresponding values in object y
f.update = function(x, y) {
  if (y === undefined || y === null) return;
  for (var key in x) {
    if (x.hasOwnProperty(key) && y.hasOwnProperty(key)) {
      x[key] = y[key];
    }
  }
};

// updates fields in object x with values in y, including fields only in y
f.extend = function(x, y) {
  if (y === undefined || y === null) return;
  for (var key in y) {
    if (y.hasOwnProperty(key)) {
      x[key] = y[key];
    }
  }
};

// creates a mini state machine that emits an event after an interval (in ms)
f.make_timer = function(interval, callback) {
  if (interval && interval > 0) {
    setTimeout(function() { callback({id: "tick",
                               time: Date.now(),
                               interval: interval,
                               source: "timer"})},
               interval);
  }
}

// save some typing when generating event
f.make_event = function(emitter, id, source, data) {
  f.extend(data, {id: id, time: Date.now(), source: source});
  emitter.emit(id, data);
}

module.exports = f;
