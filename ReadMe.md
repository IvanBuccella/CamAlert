# CamAlert

CamAlert is an application built using a Serverless Computing approach. The application alerts the user via email of an emergency that is detected from the movement detection alerts that the IoT sensors of the house-installed cameras send into an MQTT queue. 

The application is mainly composed by:
- MongoDB NoSQL DBaaS service.
- Mongo Express service that can be used for managing the MongoDB databases.
- One serverless Sender Function which sends a new alert message `{motionBlock: x, cameraID: y,}` value on the MQTT Topic `iot/sensors/cam`.
- One serverless Consume Function which is triggered by a new MQTT message on the Topic `iot/sensors/cam`. It sends a new message `{motionBlock: x, cameraID: y,}` value on the MQTT Topic `iot/logs`.
- A NodeJS server that logs the invocation of the consume function; this server waits for new messages on the MQTT queue `iot/logs` and it's executed in a dedicated nodeJS service. The server processes and stores the logs into the MongoDB database and, if an alarm is detected, sends an email to the user email address (the env `SENDER_EMAIL_ADDRESS` variable value). The alarm detection of a camera depends on the `y` number of detections received from a camera in the last `x` seconds (`y` is env `MINIMUM_NUMBER_OF_MOVEMENT_DETECTIONS` variable value and `c` is the `MOVEMENT_DETECTION_TIME_WINDOW_IN_SECONDS` variable value). The sending of an email depends on the emergency situation detected but, if an email is sent (it will be known because the email logs are stored in the database), the server waits `z` seconds before sending a new email in case of a persistent emergency (`z` is the env `EMAIL_SENDING_TIME_WINDOW_IN_SECONDS` variable value).

## Talk about the code
### The serverless functions
#### Sender Function

#### Consume Function
The Consume Function is written in JavaScript and uses the `amqplib` JavaScript library in order to send a new alert message on the queue specified from the `AMQP_QUEUE = iot/logs` env varibale value; the invocation of the function is triggered by a new MQTT message on the topic specified from the `MQTT_QUEUE = iot/sensors/cam` env varibale value. The JavaScript code is the following:
```javascript
var amqp = require("amqplib");

function send_feedback(msg) {
  var q = process.env.AMQP_QUEUE;
  amqp
    .connect(process.env.AMQP_URL)
    .then(function (conn) {
      return conn
        .createChannel()
        .then(function (ch) {
          var ok = ch.assertQueue(q, { durable: false });
          return ok.then(function (_qok) {
            ch.sendToQueue(q, Buffer.from(msg));
            return ch.close();
          });
        })
        .finally(function () {
          conn.close();
        });
    })
    .catch(console.warn);
}

function bin2string(array) {
  var result = "";
  for (var i = 0; i < array.length; ++i) {
    result += String.fromCharCode(array[i]);
  }
  return result;
}

exports.handler = function (context, event) {
  var _event = JSON.parse(JSON.stringify(event));
  var _data = bin2string(_event.body.data);

  context.callback("Received " + _data);
  send_feedback(_data);
};
```
The function is deployed using the Docker compose specifics for Nuclio: using a `.yaml` file that defines all functions configurations and the source code.
- The source code (the JavaScript code) is encoded in base64 and copied in the attribute `functionSourceCode` of the `.yaml` file. 
- The trigger on the MQTT topic is defined under the `triggers` attribute of the `.yaml` file; it allows to auto-invoke the function on a new message receiving from the topic.
- The Javascript dependencies (libraries) install commands are defined in the `commands` attribute of the `.yaml` file. 
```yaml
metadata:
  name: consumer
  labels:
    nuclio.io/project-name: c4f033ae-fbb7-4649-abf9-f8b75f7c436b
spec:
  handler: "main:handler"
  runtime: nodejs
  env:
    - name: AMQP_URL
      value: "amqp://guest:guest@10.10.1.1:5672"
    - name: AMQP_QUEUE
      value: iot/logs
  resources: {}
  image: "nuclio/processor-consumer:latest"
  minReplicas: 1
  maxReplicas: 1
  targetCPU: 75
  triggers:
    mqtt:
      class: ""
      kind: mqtt
      url: "guest:guest@10.10.1.1:1883"
      attributes:
        subscriptions:
          - qos: 0
            topic: iot/sensors/cam
  build:
    image: ""
    noCache: true
    offline: true
    dependencies: []
    runtimeAttributes:
      repositories: []
    functionSourceCode: dmFyIGFtcXAgPSByZXF1aXJlKCJhbXFwbGliIik7DQoNCmZ1bmN0aW9uIHNlbmRfZmVlZGJhY2sobXNnKSB7DQogIHZhciBxID0gcHJvY2Vzcy5lbnYuQU1RUF9RVUVVRTsNCiAgYW1xcA0KICAgIC5jb25uZWN0KHByb2Nlc3MuZW52LkFNUVBfVVJMKQ0KICAgIC50aGVuKGZ1bmN0aW9uIChjb25uKSB7DQogICAgICByZXR1cm4gY29ubg0KICAgICAgICAuY3JlYXRlQ2hhbm5lbCgpDQogICAgICAgIC50aGVuKGZ1bmN0aW9uIChjaCkgew0KICAgICAgICAgIHZhciBvayA9IGNoLmFzc2VydFF1ZXVlKHEsIHsgZHVyYWJsZTogZmFsc2UgfSk7DQogICAgICAgICAgcmV0dXJuIG9rLnRoZW4oZnVuY3Rpb24gKF9xb2spIHsNCiAgICAgICAgICAgIGNoLnNlbmRUb1F1ZXVlKHEsIEJ1ZmZlci5mcm9tKG1zZykpOw0KICAgICAgICAgICAgcmV0dXJuIGNoLmNsb3NlKCk7DQogICAgICAgICAgfSk7DQogICAgICAgIH0pDQogICAgICAgIC5maW5hbGx5KGZ1bmN0aW9uICgpIHsNCiAgICAgICAgICBjb25uLmNsb3NlKCk7DQogICAgICAgIH0pOw0KICAgIH0pDQogICAgLmNhdGNoKGNvbnNvbGUud2Fybik7DQp9DQoNCmZ1bmN0aW9uIGJpbjJzdHJpbmcoYXJyYXkpIHsNCiAgdmFyIHJlc3VsdCA9ICIiOw0KICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7DQogICAgcmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYXJyYXlbaV0pOw0KICB9DQogIHJldHVybiByZXN1bHQ7DQp9DQoNCmV4cG9ydHMuaGFuZGxlciA9IGZ1bmN0aW9uIChjb250ZXh0LCBldmVudCkgew0KICB2YXIgX2V2ZW50ID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShldmVudCkpOw0KICB2YXIgX2RhdGEgPSBiaW4yc3RyaW5nKF9ldmVudC5ib2R5LmRhdGEpOw0KDQogIGNvbnRleHQuY2FsbGJhY2soIlJlY2VpdmVkICIgKyBfZGF0YSk7DQogIHNlbmRfZmVlZGJhY2soX2RhdGEpOw0KfTsNCg==
    commands:
      - "npm install amqplib"
    codeEntryType: sourceCode
  platform: {}
  readinessTimeoutSeconds: 10
  timeoutSeconds: 10
```
### The server

## Installation

### Prerequisites
  - Docker and Docker Compose (Application containers engine). Install it from here https://www.docker.com
  - Nuclio (Serverless computing provider)
  - RabbitMQ (AMQP and MQTT message broker)
  - Node.js 

### First Step

Clone the repository:

```sh
$ git clone https://github.com/IvanBuccella/CamAlert
```

### Second Step

Edit .env file variables by following these instructions:

```
- COMPUTER_IP: your computer IP address
- SMTP_HOST: your SMTP server host
- SMTP_PORT: your SMTP server port
- SMTP_SECURE: true if your SMTP server uses SSL/TLS, else false
- SMTP_USER: your SMTP server username
- SMTP_PASS: your SMTP server password
- SENDER_EMAIL_ADDRESS: your SMTP server associated "sender" email address
- RECIPIENT_EMAIL_ADDRESS: the email address where you want to receive the alerts
- MINIMUM_NUMBER_OF_MOVEMENT_DETECTIONS: the number of detections to bufferize for MOVEMENT_DETECTION_TIME_WINDOW_IN_SECONDS seconds before sending an email
- MOVEMENT_DETECTION_TIME_WINDOW_IN_SECONDS: the number of seconds in which the application look the movement detections backward
- EMAIL_SENDING_TIME_WINDOW_IN_SECONDS: the number of seconds to wait before sending a new email to the SENDER_EMAIL_ADDRESS address, in case of detection
```

Edit these environment variables by following these instructions:

- In the `Nuclio/functions/sender.yaml` edit the `MQTT_URL` by replacing the IP with your COMPUTER_IP variable value; e.g. `mqtt://guest:guest@YOUR_COMPUTER_IP_VARIABLE_VALUE:1883`
- In the `Nuclio/functions/consumer.yaml` edit the `AMQP_URL` by replacing the IP with your COMPUTER_IP variable value; e.g. `amqp://guest:guest@YOUR_COMPUTER_IP_VARIABLE_VALUE:5672`
- In the `Nuclio/functions/consumer.yaml` edit the `mqtt` trigger `url` by replacing the IP with your COMPUTER_IP variable value; e.g. `guest:guest@YOUR_COMPUTER_IP_VARIABLE_VALUE:1883`

### Third Step

Deploy local environment with Docker (since next time, the "--build" flag is unnecessary):

```sh
$ docker-compose up --build
```

### Fourth Step

Visit the Nuclio Dashboard by typing `http://localhost:8000` and create a project named `CamAlert`

### Fifth Step

- Create and deploy the Consumer function into the `CamAlert` project by using the YAML file stored in the `Nuclio/functions/consumer.yaml` path.
- Create and deploy the Sender function into the `CamAlert` project by using the YAML file stored in the `Nuclio/functions/sender.yaml` path.

### Enjoy :-)
