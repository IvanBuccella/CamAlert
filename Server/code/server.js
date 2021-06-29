require("dotenv-expand")(require("dotenv").config());

var amqp = require("amqplib");
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
          function (msg) {
            console.log(msg.content.toString());
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
