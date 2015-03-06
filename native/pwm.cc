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
#include <cmath>

#include <prussdrv.h>
#include <pruss_intc_mapping.h>
#define PRU_NUM 0
#define PRU_FIRMWARE "./pwm.bin"
#define PRU_STEP_USEC 0.005

// node headers
#include <node.h>
#include <v8.h>

using namespace v8;



static void * _pruDataMem;
static unsigned int * _pruDataMem0;

inline Handle<Value>
throw_exception(char const * arg)
{
        return ThrowException(Exception::Error(String::New(arg)));
}

static double
get_period()
{
        return (4.0 * _pruDataMem0[1] + 2 + 9) * PRU_STEP_USEC;
}


/** Initialize the PRU and start the PWM */
void
init()
{
        int ret;
        tpruss_intc_initdata pruss_intc_initdata = PRUSS_INTC_INITDATA;

        prussdrv_init();
        ret = prussdrv_open(PRU_EVTOUT_0);
        if (ret) {
                throw_exception("prussdrv_open open failed");
        }

        // Initialize interrupt
        prussdrv_pruintc_init(&pruss_intc_initdata);

        // assign the the data RAM address to pointers
        prussdrv_map_prumem(PRUSS0_PRU0_DATARAM, &_pruDataMem);
        _pruDataMem0 = reinterpret_cast<unsigned int*>(_pruDataMem);

        _pruDataMem0[0] = 1;
        _pruDataMem0[1] = 2497;         // default to 20 kHz period
        _pruDataMem0[2] = 0;
        _pruDataMem0[3] = 0;

        // prussdrv_exec_program(PRU_NUM, PRU_FIRMWARE);
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

        prussdrv_exec_program (PRU_NUM, (char*)programS.c_str());

        return scope.Close(Undefined());
}

Handle<Value> stop(const Arguments& args)
{
        HandleScope scope;
        _pruDataMem0[0] = 0;
        usleep(get_period());
        prussdrv_pru_clear_event(PRU_EVTOUT_0, PRU0_ARM_INTERRUPT);
        prussdrv_pru_disable(PRU_NUM);
        prussdrv_exit();
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
                if (usec <= 0) {
                        return throw_exception("period must be greater than 0");
                }
                _pruDataMem0[1] = (unsigned int)round((usec / PRU_STEP_USEC - 2 - 9) / 4);
        }
        return scope.Close(Number::New(get_period()));
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
        if (args.Length() > 1) {
                if (!args[1]->IsNumber()) {
                        return throw_exception("arg 2 must be a float between 0 and 100");
                }
                duty = args[1]->ToNumber()->Value();
                _pruDataMem0[2 + idx] = (unsigned int)round(duty * get_period());
        }
        duty = (double)_pruDataMem0[2 + idx] / (double)_pruDataMem0[1];
        return scope.Close(Number::New(duty));
}

Handle<Value> pulse_hold(const Arguments& args) {
        HandleScope scope;
        return scope.Close(String::New("world"));
}


void Init(Handle<Object> exports) {

        init();
        exports->Set(String::NewSymbol("start"),
                     FunctionTemplate::New(start)->GetFunction());
        exports->Set(String::NewSymbol("stop"),
                     FunctionTemplate::New(stop)->GetFunction());
        exports->Set(String::NewSymbol("period"),
                     FunctionTemplate::New(period)->GetFunction());
        exports->Set(String::NewSymbol("duty"),
                     FunctionTemplate::New(duty)->GetFunction());
}

NODE_MODULE(pwm, Init)
