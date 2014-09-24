(ns decide.host
  "Host server; brokers messages from controllers and logs data"
  (:use [decide.core :only [version config]])
  (:require [decide.json :as json]
            [cljs.nodejs :as node]
            [clojure.string :as str]))

(def http (js/require "http"))
(def express (js/require "express"))
(def sockets (js/require "socket.io"))
(def sock-cli (js/require "socket.io-client"))
(def console (js/require "../lib/log"))


(defn- flatten-record [js & keys]
  (let [js (js->clj js :keywordize-keys true)]
    (merge (select-keys js keys) (:data js))))

;; connect to host
(def host (.connect sock-cli "http://localhost:8020" (clj->js {:transports ["websocket"]})))
(.on host "connect" (fn [] (.info console "connected to host")))
(.on host "disconnect" (fn []
                         (.error console "lost connection to host")
                         (.exit node/process -1)))
(.on host "state-changed"
     (fn [msg]
       (let [msg (flatten-record msg :time :addr)
             logfile (str "events_" (first (str/split (:addr msg) #"\.")) ".jsonl")]
         (json/write-record! logfile msg))))
(.on host "trial-data"
     (fn [msg]
       (let [msg (flatten-record msg :time)
             logfile (str (:subject msg) "_" (:program msg) ".jsonl")]
         (json/write-record! logfile msg))))

(defn- main [& args]
  (.info console "this is decide host, version" version))
(set! *main-cli-fn* main)
