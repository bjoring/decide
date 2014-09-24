(ns decide.logger
  "Standalone logging program; runs on host"
  (:require [cljs.nodejs :as node]
            [clojure.string :as str]))

(def version "1.0a2")

(def fs (js/require "fs"))
(def sock-cli (js/require "socket.io-client"))
(def console (js/require "../lib/log"))

;; logging
(defn- write-stream [path]
  (.info console "opened" path "for logging")
  (.createWriteStream fs path (clj->js {:flags "a" :encoding "utf-8"})))
(defn- flatten-record [js & keys]
  (let [js (js->clj js :keywordize-keys true)]
    (merge (select-keys js keys) (:data js))))

(def logfiles (atom {}))
(defn write-record!
  "Writes javascript [record] as serialized, line-delimited JSON to file at [path]"
  [path record]
  (let [*w* (or (get @logfiles path)
                (get (swap! logfiles assoc path (write-stream path)) path))]
    (.write *w* (str (JSON/stringify (clj->js record)) "\n"))))

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
         (write-record! logfile msg))))
(.on host "trial-data"
     (fn [msg]
       (let [msg (flatten-record msg :time)
             logfile (str (:subject msg) "_" (:program msg) ".jsonl")]
         (write-record! logfile msg))))

(defn- main [& args]
  (.info console "this is decide console, version" version))
(set! *main-cli-fn* main)
