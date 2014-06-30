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

module.exports = f;
