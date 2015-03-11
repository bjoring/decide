{
  "targets": [
    {
        "target_name": "pwm",
        "sources": [ "native/pwm.cc", "native/pruss_pwm.cc" ],
        "libraries": [ "-lprussdrv" ],
        "cflags_cc": ["-fexceptions"]
    }
  ]
}
