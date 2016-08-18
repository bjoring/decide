
var starboard;
var svg;
var omnitimer = {};

// need to force socket.io to use a relative path in case we are proxied
var sock = io.connect("/", {
    path: location.pathname + "socket.io"
});

sock.on("connect", function() {
    queue()
        .defer(d3.json, "components/")
        .defer(d3.json, "state/")
        .await(function(err, components, state) {
            if (err) console.warn(err);
            else {
                // merge the camponents and state object
                starboard = components;
                for (var key in starboard)
                    starboard[key].state = state[key];
                drawInterface();
                d3.select("#last-update").text(function() { return new Date().toLocaleTimeString();});
        }
    });

})

sock.on("disconnect", function() {
    d3.select("#state-hostname")
        .attr("class", "error")
        .text("disconnected");
});

sock.on("state-changed", function(msg) {
    // strip out the non-data fields
    var name = msg.name;
    var time = msg.time / 1000;
    delete msg.name;
    delete msg.time;
    var data = d3.entries(msg);
    if (data.length > 0) {
        if (!starboard.hasOwnProperty(name)) {
            starboard[name] = {state: {}};
        }
        data.forEach(function(x) {
            starboard[name].state[x.key] = x.value;
        });
    }
    else {
        delete starboard[name];
    }

    drawInterface();
    d3.select("#last-update").text(function() { return new Date(time).toLocaleTimeString();});
});

//sock.on("log", appendConsole);
//sock.on("trial-data", trialUpdate);

function drawInterface() {
    var w = window.innerWidth * 0.6;
    var h = w * 0.5626;

    var data = d3.entries(starboard);
    var numLeds = d3.sum(data.map(function(x) {
        return x.value.type == 'led';
    }));
    var numHouse = d3.sum(data.map(function(x) {
        return x.value.type == 'lights';
    }));
    var numFeeds = d3.sum(data.map(function(x) {
        return x.value.type == 'feeder';
    }));
    var numPecks = d3.sum(data.map(function(x) {
        return (x.value.type == "key") ? Object.keys(x.value.variables).length - 1 : 0;
    }));

    var xLedScale = d3.scale.ordinal()
        .domain(d3.range(numLeds))
        .rangeRoundBands([0, w], 0.16);

    var xOmniScale = d3.scale.ordinal()
        .domain(d3.range(numLeds / 3))
        .rangeRoundBands([0, w], 0.06);

    var xPeckScale = d3.scale.ordinal()
        .domain(d3.range(numPecks))
        .rangeRoundBands([0, w], 0.06);

    var xFeedScale = d3.scale.ordinal()
        .domain(d3.range(numFeeds))
        .rangeRoundBands([0, w], 0.04);

    var xHouseScale = d3.scale.ordinal()
        .domain(d3.range(numHouse))
        .rangeRoundBands([0, w], 0.02);

    var yScale = d3.scale.ordinal()
        .domain(d3.range(5))
        .rangeRoundBands([0, h], 0.1);

    svg = d3.select("#interface")
        .attr("width", w)
        .attr("height", h)
        .attr("display", "block");

    var omni = svg.selectAll(".omni")
        .data(data.filter(function(d) { return d.value.type == "led" && d.value.color == "red";}),
              function(d, i) {
                  var pos = ["cue_left", "cue_center", "cue_right"];
                  if (!omnitimer[d.key]) omnitimer[d.key] = {};
                  return pos[i];
              });

    omni.enter()
        .append("rect")
        .attr("class", "omni")
        .attr("x", function(d, i) {
            return xOmniScale(i);
        })
        .attr("y", yScale(1))
        .attr("width", xOmniScale.rangeBand())
        .attr("height", yScale.rangeBand() * (4 / 3))
        .append("title")
        .text(function(d, i) {
            var k = ["cue_left", "cue_center", "cue_right"];
            return k[i];
        });

    omni
        .attr("fill", function(d) {
            var key = d.key.split("_");
            var color = ["red", "green", "blue"].map(function(k) {
                var el = [key[0], key[1], k].join("_");
                return starboard[el].state.brightness * 244;
            });
            return "rgb(" + color + ")";
        })
        .classed("blinkomni", function(d, i) {
            var key = d.key.split("_");
            var ret = false;
            var list = ["red", "green", "blue"].map(function(k) {
                var el = [key[0], key[1], k].join("_");
                return el;
            });
            for (var i = 0; i < list.length; i++) {
                if (starboard[list[i]].state.trigger == "timer") {
                    omnitimer[d.key].color_index = i;
                    ret = true;
                }
            }
            if (ret === false) {
                clearInterval(omnitimer[d.key].timer);
            }
            return ret;
        });

    d3.selectAll(".blinkomni")
        .each(blinkOmni);

    function blinkOmni(d, i) {
        var selection = d3.select(this);

        var on_color = selection.attr("fill");

        var temp = on_color.split(/,|\(|\)/);
        temp[omnitimer[d.key].color_index * 1 + 1] = 0;
        temp = [temp[1], temp[2], temp[3]];

        var off_color = "rgb(" + temp + ")";

        var toggle = on_color;
        clearInterval(omnitimer[d.key].timer);
        omnitimer[d.key].timer = setInterval(loop, 500);

        function loop() {
            selection
                .transition()
                .attr("fill", function() {
                    toggle = toggle == off_color ? on_color : off_color;
                    return toggle;
                }).ease();
        }
    }


    var cues = svg.selectAll(".led")
        .data(data.filter(function(d) { return d.value.type == "led";}),
              function(d) { return d.key;});
    cues.enter()
        .append("rect")
        .attr("class", function(d) {
            return "led control " + d.value.color;
        })
        .attr("x", function(d, i) {
            return xLedScale(i);
        })
        .attr("y", yScale(2) + yScale.rangeBand() * (1 / 3))
        .attr("width", xLedScale.rangeBand())
        .attr("height", yScale.rangeBand() * (2 / 3))
        .on("click", function(d) {
            sock.emit("change-state", {
                name: d.key,
                brightness: !(d.value.state.brightness)
            });
        })
        .append("title");

    cues
        .classed("active", function(d) {
            return d.value.state.brightness;
        })
        .select("title")
        .text(function(d, i) {
            return d.key + ": " + JSON.stringify(d.value.state);

        });

    cues.exit().remove();

    var keygrp = svg.selectAll(".peckgroup")
        .data(data.filter(function(d) { return d.key == "keys";}),
              function(d) { return d.key; });
    keygrp.enter()
        .append("g")
        .attr("class", "peckgroup");
    keygrp.exit()
        .remove();

    var keys = keygrp.selectAll(".peck")
        .data(function(d, i) {
            var filter = d3.entries(d.value.state);
            var select = [];
            for (var num in filter) {
                if (filter[num].key != "hopper_up") select.push(filter[num]);
            }
            return select;
        },
              function(d) { return d.key; });

    keys.enter()
        .append("rect")
        .attr("class", "peck control")
        .attr("x", function(d, i) {
            return xPeckScale(i);
        })
        .attr("y", yScale(3))
        .attr("width", xPeckScale.rangeBand())
        .attr("height", yScale.rangeBand())
        .on("mousedown", function(d) {
            // could get "keys" from d3.select(this.parentNode).datum().key;
            var data = {name: "keys"};
            data[d.key] = true;
            sock.emit("change-state", data);
        })
        .on("mouseup", function(d) {
            var data = {name: "keys"};
            data[d.key] = false;
            sock.emit("change-state", data);
        })
        .append("title");

    keys
        .classed("active", function(d) {
            return d.value;
        })
        .select("title")
        .text(function(d, i) {
            return d.key;
        });

    keys.exit().remove();

    var lights = svg.selectAll(".houselights")
        .data(data.filter(function(x) { return x.value.type == "lights"; }),
              function(x) { return x.key;});

    // TODO show sun position?
    lights.enter()
        .append("rect")
        .attr("class", "houselights control")
        .attr("x", function(d, i) {
            return xHouseScale(i);
        })
        .attr("y", yScale(0) + yScale.rangeBand() / 2)
        .attr("width", xHouseScale.rangeBand())
        .attr("height", yScale.rangeBand() / 2)
        .on("click", function(d) {
            // TODO: support changing the brightness to other values?
            sock.emit("change-state", {
                name: d.key,
                brightness: !d.value.state.brightness * 255,
                clock_on: !d.value.state.clock_on,
                daytime: false
            });
        })
        .append("title");
    // .on("click", function(d) {
    //   if (starstate[d.key] >= 250) {
    //     updateServer(Date.now(),{"key": d.key, "state":0,"name":d.name});
    //   } else if (starstate[d.key] === 0) {
    //     updateServer(Date.now(),{"key": d.key, "state":100,"name":d.name});
    //   } else {
    //     updateServer(Date.now(),{"key": d.key, "state":starstate[d.key]+50,"name":d.name});
    //   }
    // });

    lights.attr("fill", function(d, i) {
        var brightness = d.value.state.brightness;
        var color = [brightness, brightness, 0];
        return "rgb(" + color + ")";
    });

    lights.select("title")
        .text(function(d, i) {
            return d.key + ": " + JSON.stringify(d.value.state);
        });

    lights.exit().remove();

    var feeders = svg.selectAll(".feeder")
        .data(data.filter(function(x) { return x.value.type == "feeder"; }),
              function(x) { return x.key; });

    feeders.enter()
        .append("rect")
        .attr("class", "feeder control")
        .attr("x", function(d, i) {
            return xFeedScale(i);
        })
        .attr("y", yScale(4))
        .attr("width", xFeedScale.rangeBand())
        .attr("height", yScale.rangeBand() / 2)
        .on("click", function(d) {
            var active = d.value.state.feeding;
            sock.emit("change-state", {
                name: d.key,
                feeding: !active
            });
        })
        .append("title");

    feeders
        .classed("active", function(d, i) {
            return d.value.state.feeding;
        })
        .select("title")
        .text(function(d, i) {
            return d.key + ": " + JSON.stringify(d.value.state);
        });

    feeders.exit().remove();

    // TEXT
    var text_data = ["controller", "experiment", "aplayer", "hopper"].map(function(k) {
        return {key: k, value: starboard[k]};
    });

    var components = d3.select("#component-list").selectAll("li")
        .data(text_data, function(d) { return d.key });

    components.enter()
        .append("li");
    components
        .text(function(d) { return d.value.name || d.key })
        .append("ul")
    components.exit().remove();

    var lines = components.selectAll("ul").selectAll("li")
        .data(function(d) { return d3.entries(d.value.state) }, function(d) { return d.key });

    lines.enter()
        .append("li");

    lines.text(function(d) { return d.key + ": "})
        .append("span")
        .attr("id", function(d) { return "state-" + d.key })
        .attr("class", function(d) {return (["warning", "error"].some(function(x) { return x == d.key})) ?
                             "error" : "success" })
        .text(function(d) { return d.value})

    lines.exit().remove();


    var expt = d3.select("#experiment-status").selectAll("li")
        .data(data.filter(function(d) { return d.key == starboard.experiment.state.procedure; }),
              function(d) { return d.key;});

    expt.enter()
        .append("li");
    expt
        .text(function(d) { return d.key })
        .append("ul")
    expt.exit().remove();

    expt.selectAll("ul").selectAll("li")
        .data(function(d) { return d3
                     .entries(d.value.state)
                     .filter(function(d) { return typeof d.value !== "object"}) },
              function(d) { return d.key })
        .enter()
        .append("li")
        .text(function(d) { return d.key + ": "})
        .append("span")
        .attr("id", function(d) { return "state-" + d.key })
        .attr("class", "success")
        .text(function(d) { return (/^last-/.test(d.key)) ?
                     new Date(d.value / 1000).toLocaleTimeString() :
                     d.value });
}

/*function appendConsole(data, console) {
  var target = "#"+console;
  d3.selectAll(target).append("p").text(data);

  var objDiv = document.getElementById(console);
  objDiv.scrollTop = objDiv.scrollHeight;

  }*/

    /*d3.selectAll("#message").text(function(){
      return (JSON.stringify(data) +" -  "+Date.now());
      });*/
