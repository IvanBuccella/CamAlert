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
