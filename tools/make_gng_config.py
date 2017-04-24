#!/usr/bin/env python
# -*- coding: utf-8 -*-
# -*- mode: python -*-
"""Generate a json config file for gng.js"""
import sys
import json

def strip_ext(fname):
    import os
    return os.path.splitext(os.path.basename(fname))[0]


def stimulus(stimulus, category, responses, stim_cues=None, resp_cues=None):
    return {
        "name": strip_ext(stimulus),
        "frequency": 1,
        "category": category,
        "cue_stim": stim_cues or [],
        "cue_resp": resp_cues or [],
        "responses": responses
    }


def go_responses(p, keys):
    d = {k: {"p_reward": p, "correct": True} for k in keys}
    d["timeout"] = {"correct": False}
    return d


def nogo_responses(p, keys):
    d = {k: {"p_punish": p, "correct": False} for k in keys}
    d["timeout"] = {"correct": True}
    return d


def probe_responses(p, keys):
    assert p <= 0.5
    d = {k: {"p_punish": p, "p_reward": p, "correct": "probe"} for k in keys}
    d["timeout"] = {"correct": "probe"}
    return d


default_parameters = {
    "correct_timeout": False,
    "rand_replace": True
}

if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="generate a gng json config file")
    p.add_argument("--name", "-n", help="experiment name (required)", required=True)
    p.add_argument("--root", "-r", help="root directory for stimuli (required)", required=True)
    p.add_argument("--stim-cue", help="cue light(s) during stimulus presentation", nargs="*")
    p.add_argument("--resp-cue", help="cue light(s) during response window", nargs="*")
    p.add_argument("--response", help="port(s) to monitor for responses", nargs="+",
                   default=["peck_right"])
    p.add_argument("--p-reward", type=float, default=1.0,
                   help="probability of reward for response to S+")
    p.add_argument("--p-punish", type=float, default=1.0,
                   help="probability of punishment for response to S+")
    p.add_argument("--p-probe", type=float, default=0.4,
                   help="probability of reward or punishment for probe stimulus")
    p.add_argument("--go", default=[],
                   help="stimuli in the S+ category", nargs="*")
    p.add_argument("--no-go", default=[],
                   help="stimuli in the S- category", nargs="*")
    p.add_argument("--probe", default=[],
                   help="stimuli in the probe category", nargs="*")

    args = p.parse_args()

    rgo = go_responses(args.p_reward, args.response)
    rnogo = nogo_responses(args.p_punish, args.response)
    rprobe = probe_responses(args.p_probe, args.response)

    go_stims = [stimulus(s, "S+", rgo, args.stim_cue, args.resp_cue) for s in args.go]
    nogo_stims = [stimulus(s, "S-", rnogo, args.stim_cue, args.resp_cue) for s in args.no_go]
    probe_stims = [stimulus(s, "probe", rprobe, args.stim_cue, args.resp_cue) for s in args.probe]

    cfg = {
        "experiment": args.name,
        "stimulus_root": args.root,
        "parameters": default_parameters,
        "stimuli": go_stims + nogo_stims + probe_stims
    }

    json.dump(cfg, sys.stdout)
