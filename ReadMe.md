# CamAlert

The application is mainly composed by:

- MongoDB service.
- Mongo Express service that can be used for managing the MongoDB databases.
- One serverless Sender Function which sends a new alert message `{motionBlock: x, cameraID: y,}` value on the MQTT Topic "iot/sensors/cam".
- One serverless Consume Function which is triggered by a new MQTT message on the Topi "iot/sensors/cam". It sends a new message `{motionBlock: x, cameraID: y,}` value on the MQTT Topic "iot/logs".
- A NodeJS server which logs the invocation of the consume function, this server waits for new messages on the MQTT queue "iot/logs". It's executed in a dedicated node service, processes the logs and, if an alarm is detected, sends an email to the `SENDER_EMAIL_ADDRESS` address. The alarm detection depends on the `MINIMUM_NUMBER_OF_MOVEMENT_DETECTIONS` and `MOVEMENT_DETECTION_TIME_WINDOW_IN_SECONDS` variables.

For executing this application and its own environment you will need Docker and Docker Compose. Install it from here: https://www.docker.com

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
