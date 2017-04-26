#!/usr/bin/env python
# -*- coding: utf-8 -*-
# -*- mode: python -*-
"""Generate a json config file for gng.js"""
import sys
import json
import fractions

def strip_ext(fname):
    import os
    return os.path.splitext(os.path.basename(fname))[0]


def stimulus(stimulus, category, freq, responses, stim_cues=None, resp_cues=None):
    return {
        "name": strip_ext(stimulus),
        "frequency": freq,
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


def adjust_frequencies(stimuli):
    """ Adjust frequencies to integers"""
    from math import gcd
    from functools import reduce
    # multiply each value by lcm(denominators) / gcd(numerators)
    n_fac = reduce(gcd, (s["frequency"].numerator for s in stimuli))
    d_fac = reduce(lambda a, b: (a * b) // gcd(a, b),
                   (s["frequency"].denominator for s in stimuli))
    for s in stimuli:
        s["frequency"] = int(s["frequency"] * d_fac / n_fac)
        yield s


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

    p.add_argument("--f-go", type=fractions.Fraction, default="2/5",
                   help="proportion of S+ to total trials")
    p.add_argument("--f-no-go", type=fractions.Fraction, default="2/5",
                   help="proportion of S- to total trials")
    p.add_argument("--f-probe", type=fractions.Fraction, default="1/5",
                   help="proportion of probe to total trials")
    p.add_argument("--go", default=[],
                   help="stimuli in the S+ category", nargs="*")
    p.add_argument("--no-go", default=[],
                   help="stimuli in the S- category", nargs="*")
    p.add_argument("--probe", default=[],
                   help="stimuli in the probe category", nargs="*")

    args = p.parse_args()

    filenames = {"S+": args.go, "S-": args.no_go, "probe": args.probe}
    responses = {"S+": go_responses(args.p_reward, args.response),
                 "S-": nogo_responses(args.p_punish, args.response),
                 "probe": probe_responses(args.p_probe, args.response)}
    proportions = {"S+": args.f_go, "S-": args.f_no_go, "probe": args.f_probe}

    stimuli = []
    for category in ("S+", "S-", "probe"):
        n_cat = len(filenames[category])
        p_stim = proportions[category] / n_cat if n_cat else 1
        stimuli.extend(stimulus(s, "S+", p_stim, responses[category], args.stim_cue, args.resp_cue)
                       for s in filenames[category])

    cfg = {
        "experiment": args.name,
        "stimulus_root": args.root,
        "parameters": default_parameters,
        "stimuli": list(adjust_frequencies(stimuli))
    }

    json.dump(cfg, sys.stdout)
