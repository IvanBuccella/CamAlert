require("dotenv-expand")(require("dotenv").config());
var amqp = require("amqplib");
var nodemailer = require("nodemailer");
const { MongoClient } = require("mongodb");
let mongoUrl = process.env.DATABASE_URL + "?authMechanism=DEFAULT";
let mongoOptions = { useUnifiedTopology: true };

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
