# CamAlert

CamAlert is an application built using a Serverless Computing approach. The application alerts the user via email of an emergency that is detected from the movement detection alerts which the IoT sensors of the house-installed cameras send into an MQTT queue. 

The application is mainly composed by:
- MongoDB NoSQL DBaaS service.
- Mongo Express service that can be used for managing the MongoDB databases.
- One serverless Sender Function (used for simulating the sensors) which sends a new alert message `{motionBlock: x, cameraID: y,}` value on the MQTT Topic `iot/sensors/cam`.
- One serverless Consume Function which is triggered by a new MQTT message on the Topic `iot/sensors/cam`. It sends a new message `{motionBlock: x, cameraID: y,}` value on the MQTT Topic `iot/logs`.
- A NodeJS server that logs the invocation of the consume function; this server waits for new messages on the MQTT queue `iot/logs` and it's executed in a dedicated nodeJS service. The server processes and stores the logs into the MongoDB database and, if an emergency is detected, sends an email to the user email address (the env `SENDER_EMAIL_ADDRESS` variable value). The alarm emergency of a camera depends on the `y` number of detections received from a camera in the last `x` seconds (`y` is env `MINIMUM_NUMBER_OF_MOVEMENT_DETECTIONS` variable value and `x` is the `MOVEMENT_DETECTION_TIME_WINDOW_IN_SECONDS` variable value). The sending of an email depends on the emergency situation detected but, if an email is sent (it will be known because the email logs are stored in the database), the server waits `z` seconds before sending a new email in case of a persistent emergency (`z` is the env `EMAIL_SENDING_TIME_WINDOW_IN_SECONDS` variable value).

#### Tutorial Structure

* **[The Code](#the-code)**
  * **[Sender Function](#sender-function)**
  * **[Consume Function](#consume-function)**
  * **[Server Application](#server-application)**
    * **[insertAlert function](#insertalert-function)**
    * **[sendEmail function](#sendemail-function)** 
    * **[isAnEmergency function](#isanemergency-function)**
* **[Installation](#installation)**
  * **[Prerequisites](#prerequisites)**
  * **[Repository](#repository)**
  * **[Environment Variables](#environment-variables)**
  * **[Build](#build)**
  * **[Deploy](#deploy)**

## The code
### The serverless functions
Every function in Nuclio is identified by a serving port, you can see the serving port in the Nuclio dashboard by visiting the URL `http://COMPUTER_IP:NUCLIO_DASHBOARD_PORT` where `COMPUTER_IP = localhost` and `NUCLIO_DASHBOARD_PORT = 8000` are two env variables.

#### Sender Function
The Sender Function is written in JavaScript and uses the `mqtt` JavaScript library in order to send a new alert message on the queue specified from the `MQTT_QUEUE = iot/sensors/cam` env variable value; the function sends a new message on the topic by following this structure `{motionBlock: x, cameraID: y,}` where `x` and `y` are two random values and respectively identify the `Camera` and the `Block` of the camera visual where the sensors detect the movements.
The JavaScript code is the following:
```javascript
var mqtt = require("mqtt"),
  url = require("url");

var mqtt_url = url.parse(process.env.MQTT_URL);
var auth = (mqtt_url.auth || ":").split(":");
var url = "mqtt://" + mqtt_url.host;

var options = {
  port: mqtt_url.port,
  clientId: "sender_" + Math.random().toString(16).substr(2, 8),
  username: auth[0],
  password: auth[1],
};

exports.handler = function (context, event) {
  var client = mqtt.connect(url, options);

  client.on("connect", function () {
    let coordinates = {
      motionBlock: Math.floor(Math.random() * 10),
      cameraID: Math.floor(Math.random() * 5),
    };
    client.publish(
      process.env.MQTT_QUEUE,
      JSON.stringify(coordinates),
      function () {
        client.end();
        context.callback("MQTT Message Sent");
      }
    );
  });
};
```
The function is deployed using the Docker compose specifics for Nuclio: using a `.yaml` file that defines all functions configurations and the source code.
- The source code (the JavaScript code) is encoded in base64 and copied in the attribute `functionSourceCode` of the `.yaml` file. 
- The Javascript dependencies (libraries) install commands are defined in the `commands` attribute of the `.yaml` file. 
```yaml
metadata:
  name: sender
  labels:
    nuclio.io/project-name: c4f033ae-fbb7-4649-abf9-f8b75f7c436b
spec:
  handler: "main:handler"
  runtime: nodejs
  env:
    - name: MQTT_URL
      value: "mqtt://guest:guest@10.10.1.1:1883"
    - name: MQTT_QUEUE
      value: iot/sensors/cam
  resources: {}
  image: "nuclio/processor-sender:latest"
  minReplicas: 1
  maxReplicas: 1
  targetCPU: 75
  build:
    image: ""
    noCache: true
    offline: false
    dependencies: []
    runtimeAttributes:
      repositories: []
    functionSourceCode: dmFyIG1xdHQgPSByZXF1aXJlKCJtcXR0IiksDQogIHVybCA9IHJlcXVpcmUoInVybCIpOw0KDQp2YXIgbXF0dF91cmwgPSB1cmwucGFyc2UocHJvY2Vzcy5lbnYuTVFUVF9VUkwpOw0KdmFyIGF1dGggPSAobXF0dF91cmwuYXV0aCB8fCAiOiIpLnNwbGl0KCI6Iik7DQp2YXIgdXJsID0gIm1xdHQ6Ly8iICsgbXF0dF91cmwuaG9zdDsNCg0KdmFyIG9wdGlvbnMgPSB7DQogIHBvcnQ6IG1xdHRfdXJsLnBvcnQsDQogIGNsaWVudElkOiAic2VuZGVyXyIgKyBNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDE2KS5zdWJzdHIoMiwgOCksDQogIHVzZXJuYW1lOiBhdXRoWzBdLA0KICBwYXNzd29yZDogYXV0aFsxXSwNCn07DQoNCmV4cG9ydHMuaGFuZGxlciA9IGZ1bmN0aW9uIChjb250ZXh0LCBldmVudCkgew0KICB2YXIgY2xpZW50ID0gbXF0dC5jb25uZWN0KHVybCwgb3B0aW9ucyk7DQoNCiAgY2xpZW50Lm9uKCJjb25uZWN0IiwgZnVuY3Rpb24gKCkgew0KICAgIGxldCBjb29yZGluYXRlcyA9IHsNCiAgICAgIG1vdGlvbkJsb2NrOiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMCksDQogICAgICBjYW1lcmFJRDogTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogNSksDQogICAgfTsNCiAgICBjbGllbnQucHVibGlzaChwcm9jZXNzLmVudi5NUVRUX1FVRVVFLCBKU09OLnN0cmluZ2lmeShjb29yZGluYXRlcyksIGZ1bmN0aW9uICgpIHsNCiAgICAgIGNsaWVudC5lbmQoKTsNCiAgICAgIGNvbnRleHQuY2FsbGJhY2soIk1RVFQgTWVzc2FnZSBTZW50Iik7DQogICAgfSk7DQogIH0pOw0KfTsNCg0K
    commands:
      - 'npm install mqtt'
      - 'npm install url'
    codeEntryType: sourceCode
  platform: {}
  readinessTimeoutSeconds: 10
```
#### Consume Function
The Consume Function is written in JavaScript and uses the `amqplib` JavaScript library in order to send a new alert message on the queue specified from the `AMQP_QUEUE = iot/logs` env variable value; the invocation of the function is triggered by a new MQTT message on the topic specified from the `MQTT_QUEUE = iot/sensors/cam` env variable value. The JavaScript code is the following:
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
### Server Application
The server application is written in JavaScript and uses the `amqplib, mongodb and nodemailer` JavaScript libraries in order to receive alert messages on the queue specified from the `AMQP_QUEUE = iot/logs` env variable value, store the alerts, and send an email in case of a detected emergency.

The server processes and stores the logs into the MongoDB database (by using the `insertAlert` utility function) and, if an emergency is detected, sends an email to the `SENDER_EMAIL_ADDRESS`. 

The alarm detection of a camera depends on the `MINIMUM_NUMBER_OF_MOVEMENT_DETECTIONS` number of detections received from a camera in the last `MOVEMENT_DETECTION_TIME_WINDOW_IN_SECONDS` seconds. 

The sending of an email (by using the `sendEmail` utility function) depends on the emergency situation detected (by using the `isAnEmergency` utility function) but, if an email is sent, the server waits `EMAIL_SENDING_TIME_WINDOW_IN_SECONDS` seconds before sending a new email in case of a persistent emergency.

The JavaScript code - by hiding the utility functions - is the following:
```javascript
require("dotenv-expand")(require("dotenv").config());
var amqp = require("amqplib");
var nodemailer = require("nodemailer");
const { MongoClient } = require("mongodb");
let mongoUrl = process.env.DATABASE_URL + "?authMechanism=DEFAULT";
let mongoOptions = { useUnifiedTopology: true };

.........
Utility functions
.........

var ampq_url = process.env.AMQP_URL;
var ampq_queue = process.env.AMQP_QUEUE;

amqp
  .connect(ampq_url)
  .then(function (conn) {
    process.once("SIGINT", function () {
      conn.close();
    });
    return conn.createChannel().then(function (ch) {
      var ok = ch.assertQueue(process.env.AMQP_QUEUE, { durable: false });

      ok = ok.then(function (_qok) {
        return ch.consume(
          ampq_queue,
          async function (msg) {
            var json = JSON.parse(msg.content);
            json.date = new Date().toISOString();
            await insertAlert(json).then(async function (result) {
              const emergency = await isAnEmergency(json);
              if (emergency) {
                await sendEmail(json);
              }
            });
          },
          { noAck: true }
        );
      });

      return ok.then(function (_consumeOk) {
        console.log("Waiting for messages. To exit press CTRL+C");
      });
    });
  })
  .catch(console.warn);
```
#### insertAlert function
This function uses the `mongodb` JavaScript library for storing an alert identified by the `json` variable and returns the mongodb `document` returned from the `insertOne` method; the alert is stored into the `CamAlert` database and `alerts` collection.

The JavaScript code is the following:
```javascript
async function insertAlert(json) {
  const client = new MongoClient(mongoUrl, mongoOptions);
  try {
    await client.connect();
    const col = client.db("CamAlert").collection("alerts");
    const result = await col.insertOne(json);
    console.log(
      "A movement for cam " +
        json.cameraID +
        " and motion block " +
        json.motionBlock +
        " has been detected"
    );
    return result;
  } finally {
    await client.close();
  }
}
```
#### sendEmail function
This function uses the `mongodb` JavaScript library for storing the sent emails (into the CamAlert database and alerts collection), and uses the `nodemailer` JavaScript library for sending the emails to the `SENDER_EMAIL_ADDRESS`.

The JavaScript code is the following:
```javascript
async function sendEmail(json) {
  const client = new MongoClient(mongoUrl, mongoOptions);
  try {
    await client.connect();
    const col = client.db("CamAlert").collection("emails");
    json.to = process.env.RECIPIENT_EMAIL_ADDRESS;
    await col.insertOne(json).then(async function () {
      let transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: process.env.SENDER_EMAIL_ADDRESS,
        to: process.env.RECIPIENT_EMAIL_ADDRESS,
        subject: "Movement Detected",
        text:
          "A movement on cam " +
          json.cameraID +
          " has been detected in motion block " +
          json.motionBlock,
      });
    });
  } finally {
    await client.close();
  }
}
```

#### isAnEmergency function
This function uses the `mongodb` JavaScript library for retrieving the alerts (stored into the `CamAlert` database and `alerts` collection) identified by the `json` variable, and returns `true` if the `numberOfAlerts` is greater than `MINIMUM_NUMBER_OF_MOVEMENT_DETECTIONS` and the `numberOfEmailsSent` in the last `EMAIL_SENDING_TIME_WINDOW_IN_SECONDS` seconds is zero, `false` otherwise.

The JavaScript code is the following:
```javascript
async function isAnEmergency(json) {
  const client = new MongoClient(mongoUrl, mongoOptions);

  var movementTimeBreakpoint = new Date();
  movementTimeBreakpoint.setSeconds(
    movementTimeBreakpoint.getSeconds() -
      process.env.MOVEMENT_DETECTION_TIME_WINDOW_IN_SECONDS
  ); //MOVEMENT_DETECTION_TIME_WINDOW_IN_SECONDS seconds backward

  var emailTimeBreakpoint = new Date();
  emailTimeBreakpoint.setSeconds(
    emailTimeBreakpoint.getSeconds() -
      process.env.EMAIL_SENDING_TIME_WINDOW_IN_SECONDS
  ); //EMAIL_SENDING_TIME_WINDOW_IN_SECONDS seconds backward

  try {
    await client.connect();

    const numberOfAlerts = await client
      .db("CamAlert")
      .collection("alerts")
      .countDocuments({
        cameraId: json.cameraId,
        motionBlock: json.motionBlock,
        date: { $gte: movementTimeBreakpoint.toISOString() },
      });

    if (numberOfAlerts < process.env.MINIMUM_NUMBER_OF_MOVEMENT_DETECTIONS) {
      console.log(
        "The number of movement detection stored for cam " +
          json.cameraID +
          " and motion block " +
          json.motionBlock +
          " in the last " +
          process.env.MOVEMENT_DETECTION_TIME_WINDOW_IN_SECONDS +
          " seconds is: " +
          numberOfAlerts +
          ". It is still not considered as an emergency."
      );
      return false;
    }

    const numberOfEmailsSent = await client
      .db("CamAlert")
      .collection("emails")
      .countDocuments({
        cameraId: json.cameraId,
        motionBlock: json.motionBlock,
        date: { $gte: emailTimeBreakpoint.toISOString() },
      });
    if (numberOfEmailsSent > 0) {
      console.log(
        "The number of movement detection stored for cam " +
          json.cameraID +
          " and motion block " +
          json.motionBlock +
          " in the last " +
          process.env.MOVEMENT_DETECTION_TIME_WINDOW_IN_SECONDS +
          " seconds is: " +
          numberOfAlerts +
          ". It is considered as an emergency but an email has already been sent in the last " +
          process.env.EMAIL_SENDING_TIME_WINDOW_IN_SECONDS +
          " seconds."
      );
      return false;
    }

    console.log(
      "The number of movement detection stored for cam " +
        json.cameraID +
        " and motion block " +
        json.motionBlock +
        " in the last " +
        process.env.MOVEMENT_DETECTION_TIME_WINDOW_IN_SECONDS +
        " seconds is: " +
        numberOfAlerts +
        ". It is considered as an emergency and an email is sent!!!"
    );
    return true;
  } finally {
    await client.close();
  }
}
```

## Installation

### Prerequisites
  - Docker and Docker Compose (Application containers engine). Install it from here https://www.docker.com
  - Nuclio (Serverless computing provider)
  - RabbitMQ (AMQP and MQTT message broker)
  - Node.js 

### Repository

Clone the repository:

```sh
$ git clone https://github.com/IvanBuccella/CamAlert
```

### Environment Variables

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

### Build

Deploy local environment with Docker (since next time, the "--build" flag is unnecessary):

```sh
$ docker-compose up --build
```

### Deploy

Visit the Nuclio Dashboard by typing `http://COMPUTER_IP:NUCLIO_DASHBOARD_PORT` where `COMPUTER_IP = localhost` and `NUCLIO_DASHBOARD_PORT = 8000` are two env variables, and create a project named `CamAlert`. Then:

- Create and deploy the Consumer function into the `CamAlert` project by using the YAML file stored in the `Nuclio/functions/consumer.yaml` path.
- Create and deploy the Sender function into the `CamAlert` project by using the YAML file stored in the `Nuclio/functions/sender.yaml` path.

### Enjoy :-)
