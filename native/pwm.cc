/*
 * node.js addon for PRU PWM control
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * Copyright (C) 2015 C Daniel Meliza <dan || meliza.org>
 */
#include <string>

// node headers
#include <node.h>
#include <v8.h>

#include "pruss_pwm.hh"

using namespace v8;

static pruss::pwm PWM(50);

inline Handle<Value>
throw_exception(char const * arg)
{
        return ThrowException(Exception::Error(String::New(arg)));
}


/** Load a program in the PRU and run it */
Handle<Value> start(const Arguments& args) {
        HandleScope scope;
        // check arguments
        if (args.Length() != 1 || !args[0]->IsString()) {
                return throw_exception("start() requires one string argument");
        }

        //Get a C++ string
        String::Utf8Value program(args[0]->ToString());
        std::string programS = std::string(*program);

        PWM.start(programS.c_str());

        usleep(1);
        if (!PWM.running())
                return throw_exception("failed to run program - check path");
        return scope.Close(Undefined());
}


Handle<Value> period(const Arguments& args)
{
        HandleScope scope;
        double usec;
        // PRU loop is 4 instructions except on cycles where the GPIO is flipped
        // on, so the actual period is going to be 4*_pruDataMem0[1] + 2 + 9. PRU
        // clock is 200 MHz, so instructions are 5 ns

        if (args.Length() > 0) {
                if (!args[0]->IsNumber()) {
                        return throw_exception("period() takes 0 or 1 numeric argument");
                }
                usec = args[0]->ToNumber()->Value();
                PWM.period(usec);
        }
        return scope.Close(Number::New(PWM.period()));
}

Handle<Value> duty(const Arguments& args) {
        HandleScope scope;
        unsigned int idx;
        double duty;
        if (args.Length() == 0) {
                return throw_exception("duty() requires 1 or two arguments");
        }
        if (!args[0]->IsNumber()) {
                return throw_exception("first argument must be an unsigned integer");
        }
        idx = args[0]->ToUint32()->Value();
        if (idx >= pruss::pwm::n_pwms) {
                return throw_exception("invalid PWM index");
        }
        if (args.Length() > 1) {
                if (!args[1]->IsNumber()) {
                        return throw_exception("arg 2 must be a float between 0 and 100");
                }
                duty = args[1]->ToNumber()->Value();
                PWM.duty(idx, duty);
        }
        return scope.Close(Number::New(PWM.duty(idx)));
}

Handle<Value> pulse_hold(const Arguments& args) {
        HandleScope scope;
        unsigned int idx;
        double duration;
        double pulse, hold;
        // argument boilerplate
        if (args.Length() < 4) {
                return throw_exception("pulse_hold(idx, pulse_duty, pulse_dur, hold_duty)");
        }
        for (int i = 0; i < 4; ++i) {
                if (!args[i]->IsNumber())
                        return throw_exception("arguments must be numbers");
        }
        idx = args[0]->ToUint32()->Value();
        pulse = args[1]->ToNumber()->Value();
        duration = args[2]->ToNumber()->Value();
        hold = args[3]->ToNumber()->Value();
        if (idx >= pruss::pwm::n_pwms)
                return throw_exception("invalid PWM index");
        if (pulse < 0 || pulse > 100)
                return throw_exception("pulse duty cycle must be between [0, 100]");
        if (hold < 0 || hold > 100)
                return throw_exception("hold duty cycle must be between [0, 100]");
        if (duration <= 0)
                return throw_exception("duration must be greater than zero");
        PWM.duty(idx, pulse);
        // pulses should be short - okay to hold the interpreter?
        usleep(duration * 1000);
        PWM.duty(idx, hold);

        return scope.Close(Undefined());
}


void Init(Handle<Object> exports) {

        exports->Set(String::NewSymbol("start"),
                     FunctionTemplate::New(start)->GetFunction());
        exports->Set(String::NewSymbol("period"),
                     FunctionTemplate::New(period)->GetFunction());
        exports->Set(String::NewSymbol("duty"),
                     FunctionTemplate::New(duty)->GetFunction());
        exports->Set(String::NewSymbol("pulse"),
                     FunctionTemplate::New(pulse_hold)->GetFunction());
}

NODE_MODULE(pwm, Init)
