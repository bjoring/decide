(ns decide.core
  (:require [decide.json :as json]))

(def path (js/require "path"))

(def version "1.0a2")
(defn config-path [name] (.resolve path js/__dirname ".." "config" name))

(def config (json/read-json (config-path "host-config.json")))
