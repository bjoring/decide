// utility functions for sysfs gpios

const fs = require("fs");
const path = require("path");
const util = require("./util");

function GPIO(id, device) {

    const { Epoll } = require("epoll");

    // can be used to infer the absolute number of the gpio from the controller
    if (device) {
        id += parseInt(fs.readFileSync(path.join(device, "base")));
    }

    const gdir = "/sys/class/gpio/gpio" + id;
    if (!fs.existsSync(gdir)) {
        fs.writeFileSync("/sys/class/gpio/export", id.toString());
    }

    const fd = fs.openSync(path.join(gdir, "value"), "r+");
    const buf = new Buffer(1);

    this.read = function(callback) {
        fs.read(fd, buf, 0, 1, 0, (err, bytes, buffer) => {
            if (callback) callback(err, parseInt(buffer.toString()));
        });
    };

    this.write = function(value, callback) {
        let val = ((value != 0) * 1).toString();
        fs.write(fd, val, 0, "ascii", (err, bytes, string) => {
            if (callback) callback(err, parseInt(string));
        });
    };

    this.active_low = function(value) {
        let val = ((value != 0) * 1).toString();
        let fn = path.join(gdir, "active_low");
        fs.writeFileSync(fn, val);
    };

    this.set_direction = function(value) {
        let fn = path.join(gdir, "direction");
        fs.writeFileSync(fn, value);
    };

    this.set_edge = function(value) {
        let fn = path.join(gdir, "edge");
        fs.writeFileSync(fn, value);
    };

    // creates a poller for the gpio that will run callback on state changes.
    // Returns the poller; caller is responsible for calling poller.close();
    this.new_poller = function(edge, callback) {
        let buffer = new Buffer(1);
        this.set_edge(edge);
        const poller = new Epoll((err, fd, events) => {
            if (err)
                callback(err);
            else {
                fs.readSync(fd, buffer, 0, 1, 0);
                callback(err, buf.toString());
            }
        });
        fs.readSync(fd, buffer, 0, 1, 0);
        poller.add(fd, Epoll.EPOLLPRI);
        return poller;
    }
}

function GPIO_dummy(id) {

    let state = 0;

    this.read = function(callback) {
        callback(null, state);
    }

    this.write = function(value, callback) {
        state = value;
        callback(null, value);
    }

    this.active_low = function(value) {}

    this.set_direction = function(value) {}

    this.set_edge = function(value) {}

    this.new_poller = function(callback) {
        var p = {
            close: function() {}
        }
        return p
    };
};

if (util.is_a_dummy())
    module.exports = GPIO_dummy;
else
    module.exports = GPIO;
