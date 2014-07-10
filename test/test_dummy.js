var b = require("../lib/bonescript-lite");
// if cape not already loaded
b.init_overlay("BBB-StarBoard", "00A0");
// turn on center green led
b.led_write("starboard:center:green", 1, console.log)

