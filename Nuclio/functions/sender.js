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
      x: Math.random() * 100,
      y: Math.random() * 100,
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
