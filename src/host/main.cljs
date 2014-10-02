(ns decide.host
  "Host server; brokers messages from controllers and logs data"
  (:use [decide.core :only [version config mail]])
  (:require [decide.json :as json]
            [decide.mongo :as mongo]
            [cljs.nodejs :as node]
            [clojure.string :as str]))

(def Date (js* "Date"))
(def __dirname (js* "__dirname"))
(def http (js/require "http"))
(def express (js/require "express"))
(def sock-io (js/require "socket.io"))
(def console (js/require "../lib/log"))

;; external http app
(def app (express))
;; sockets
(def io-internal (atom nil))
(def io-external (atom nil))
;; our connected clients
(def controllers (atom {}))
;; database collections for logging
(def events (atom nil))
(def trials (atom nil))

(defn- list-controllers [] (or (keys @controllers) []))

(defn- flatten-record
  "Returns (:data js) plus any of :keys present in js"
  [js & keys]
  (let [js (js->clj js :keywordize-keys true)]
    (merge (select-keys js keys) (:data js))))

(defn- error [& args]
  (let [msg (apply str args)]
    (.error console msg)
    (when (:send_email config)
      ;; TODO send emails on first instance of certain error classes
      (mail "decide-host" (:admins config) "major error in decide" msg))))

(defn- log-callback [err msg]
  (when err (.error console "unable to write log record to database" err)))

(defn- log-event!
  "Logs msg to the event log and (if connected) the event database"
  [msg]
  (let [msg (flatten-record msg :time :addr)
        logfile (str "events_" (first (str/split (:addr msg) #"\.")) ".jsonl")]
    (json/write-record! logfile msg)
    (when @events (mongo/save! @events msg log-callback))))

(defn- log-trial!
  "Logs msg to the trial log and (if connected) the trial database"
  [msg]
  (let [msg (flatten-record msg :time)
        logfile (str (:subject msg) "_" (:program msg) ".jsonl")]
    (json/write-record! logfile msg)
    (when @trials (mongo/save! @trials msg log-callback))))

(defn- route-req
  "Generates function to route REQ messages to controller"
  [req]
  (fn [msg rep]
    (let [msg (js->clj msg)
          [addr-1 addr-2] (str/split (:addr msg) #"\.")]
      (if-let [ctrl (@controllers addr-1)]
        (.emit (:socket ctrl) req (clj->js (assoc msg :addr addr-2)) rep)
        (rep "err" (str "no such controller " addr-1 " registered"))))))

(defn state-changed
  [name data]
  (.emit @io-external "state-changed"
           (js-obj "addr" name "time" (.now Date) "data" (clj->js data))))

(defn- remove-controller!
  "Unregisters a controller. Returns the new controllers value if successful; nil if not"
  [name]
  (when-let [data (get @controllers name)]
    (.info console "%s unregistered as" (data :address) name)
    (swap! controllers dissoc name)
    (state-changed "_controllers" (list-controllers))))

(defn- connect-internal
  "Handles connections to internal socket"
  [socket]
  (let [address (or (aget socket "handshake" "headers" "x-forwarded-for")
                    (aget socket "request" "connection" "remoteAddress"))
        key (atom nil)]
    (.info console "connection on internal port from" address)
    (-> socket
        (.on "route"
         (fn [msg rep]
           (let [msg (js->clj msg :keywordize-keys true)
                 from (msg :ret_addr)]
             (cond
              @key (rep "err" (str "connection from " address " already registered as " @key))
              (get @controllers from) (rep "err" (str "address " from " already taken"))
              :else (do
                      (reset! key from)
                      (swap! controllers assoc from {:address address :socket socket})
                      (state-changed "_controllers" (list-controllers))
                      (.info console "%s registered as" address from)
                      (rep "ok"))))))
        (.on "unroute"
             (fn [msg rep]
               (when (remove-controller! @key)
                 (reset! key nil))
               (rep "ok")))
        (.on "disconnect"
         (fn []
           (.info console "disconnection from internal port by" address)
           (when (remove-controller! @key)
             (error "client " @key " disconnected unexpectedly")
             (reset! key nil))))
        (.on "state-changed"
         (fn [msg]
           (.log console "pub" "state-changed" msg)
           (.emit @io-external "state-changed" msg)
           (log-event! msg)))
        (.on "trial-data"
         (fn [msg]
           (.log console "pub" "trial-data" msg)
           (.emit @io-external "trial-data" msg)
           (log-trial! msg))))))


(defn connect-external
  "Handles socket connections from external clients"
  [socket]
  (let [address (or (aget socket "handshake" "headers" "x-forwarded-for")
                    (aget socket "request" "connection" "remoteAddress"))]
    (.info console "connection on external port from" address)
    ;; all req messages get routed
    (map #(.on socket % (route-req %))
         ["change-state" "reset-state" "get-state" "get-meta" "get-params"])
    ;; TODO route external clients? - do they need to be addressed?
    (.on socket "disconnect"
         #(.info console "disconnection from external port by" address))))

;;; HTTP/sockets servers
(defn server []
  (let [server-internal (.createServer http (express))
        server-external (.createServer http app)]
    (reset! io-internal (sock-io server-internal))
    (reset! io-external (sock-io server-external))
    (.enable app "trust proxy")
    (.on server-external "listening"
         (fn []
           (let [address (.address server-external)]
             (.info console "external endpoint is http://%s:%s" (.-address address)
                    (.-port address)))))
    (.on server-internal "listening"
         (fn []
           (let [address (.address server-internal)]
             (.info console "internal endpoint is http://%s:%s" (.-address address)
                    (.-port address)))))
    (.on @io-internal "connection" connect-internal)
    (.on @io-external "connection" connect-external)
    (.listen server-external (:port_ext config) (:addr_ext config))
    (.listen server-internal (:port_int config) (:addr_int config))))

;; HTTP methods
(defn- send-trials
  "Sends all the trials for a subject"
  [req res]
  (let [subject (aget req "params" "subject")
        query (merge {"subject" subject} (js->clj (aget req "query")))]
    (mongo/find-all @trials query
                    (fn [err docs]
                      (.set res "Content-Type" "application/json")
                      (if err
                        (.send res 500 err)
                        (.json res docs))))))

(-> app
    (.get "/" #(.sendfile %2 "host.html"
                          (js-obj "root" (str __dirname "/../static"))))
    (.get "/controllers" #(.send %2 (clj->js (list-controllers))))
    (.get "/trials/:subject" send-trials)
    (.use "/static" ((aget express "static") (str __dirname "/../static"))))

;;; TODO
;; 1. publish information about unexpected disconnects by internal clients to
;; external clients. Does this mean storing information from state-changed?

(defn- main [& args]
  (.info console "this is decide-host, version" version)
  (.info console (str __dirname "/../static"))
  (when-let [mongo-uri (:log_db config)]
    (mongo/connect mongo-uri
                   (fn [err db]
                     (if err
                       (.error console "unable to connect to log database at " mongo-uri)
                       (do
                         (.info console "connected to mongodb for logging")
                         (reset! events (mongo/collection db "events"))
                         (reset! trials (mongo/collection db "trials"))))
                     (server)))))
(set! *main-cli-fn* main)
