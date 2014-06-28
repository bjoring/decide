// apparatus is a composite of various devices

// var cues = require("./cues");
// var feeder = require("./feeder");
// var keys = require("./keys");
var lights = require("./lights");
// var util = require("./util");

var components = {
  house_lights: {
  }
};

function apparatus(params) {

  var components = {
    house_lights: lights(params.house_lights, function());
  }

}

