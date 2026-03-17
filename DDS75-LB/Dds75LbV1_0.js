/*-
 * DDS75-LB Decoder for Orange Live Objects
 * Version: 1.0
 * 
 * Description:
 * Decoder for Dragino DDS75-LB distance sensor compatible with Orange Live Objects platform.
 * Supports multiple LoRaWAN ports:
 * - Port 2: Standard sensor data (distance, temperature, battery)
 * - Port 3: Data log (multiple records)
 * - Port 5: Device information (model, firmware, frequency band, battery)
 * - Port 6: Detect mode data
 * 
 * Reference: Orange Live Objects Payload Decoder Guidelines
 * https://github.com/DatavenueLiveObjects/Payload-decoders/wiki/Guidelines-for-script-development
 */

var decode = function(encoded, dataMessage) {
  try {
    /* Convert hex string to byte array */
    var bytes = [];
    for (var i = 0; i < encoded.length; i += 2) {
      bytes.push(parseInt(encoded.substr(i, 2), 16));
    }

    /* Get LoRaWAN port from metadata */
    var port = null;
    if (dataMessage) {
      var dm = JSON.parse(dataMessage);
      if (dm.metadata && dm.metadata.network && dm.metadata.network.lora) {
        port = dm.metadata.network.lora.port;
      }
    }

    var result = {};

    /* Port 2 (0x02): Standard sensor data */
    if (port === 2) {
      /* Check the 5th bit of the first byte */
      if (bytes[0] & 0x10) {
        /* Extended data mode */
        var value = (bytes[0] << 8 | bytes[1]) & 0x0FFF;
        var batV = value / 1000;

        /* Parse additional distance data */
        var additionalDistanceData = [];
        var endIndex = bytes.length - 4;
        var maxIndex = Math.min(8 + 40, endIndex);
        for (var i = 8; i < maxIndex; i += 2) {
          value = bytes[i] << 8 | bytes[i + 1];
          additionalDistanceData.push(value);
        }

        /* Parse last 4 bytes */
        var i_flag = bytes[bytes.length - 4];
        value = bytes[bytes.length - 3] << 8 | bytes[bytes.length - 2];
        if (value & 0x8000) {
          value = -(0x10000 - value);
        }
        var temp_DS18B20 = (value / 10).toFixed(2);
        var s_flag = bytes[bytes.length - 1];

        result.nodeType = "DDS75-LB";
        result.battery = { voltage: { value: batV, unit: "V" } };
        result.additionalDistanceData = additionalDistanceData;
        result.interruptFlag = i_flag;
        result.temperature = { value: parseFloat(temp_DS18B20), unit: "掳C" };
        result.sensorFlag = s_flag;
      } else {
        /* Standard data mode */
        value = (bytes[0] << 8 | bytes[1]) & 0x3FFF;
        batV = value / 1000;

        value = bytes[2] << 8 | bytes[3];
        var distance = value;

        i_flag = bytes[4];

        value = bytes[5] << 8 | bytes[6];
        if (bytes[5] & 0x80) {
          value |= 0xFFFF0000;
        }
        temp_DS18B20 = (value / 10).toFixed(2);

        s_flag = bytes[7];

        result.nodeType = "DDS75-LB";
        result.battery = { voltage: { value: batV, unit: "V" } };
        result.distance = { value: distance, unit: "mm" };
        result.interruptFlag = i_flag;
        result.temperature = { value: parseFloat(temp_DS18B20), unit: "掳C" };
        result.sensorFlag = s_flag;
      }
    }
    /* Port 3 (0x03): Data log with multiple records */
    else if (port === 3) {
      var pnack = (bytes[0] >> 7) & 0x01 ? "True" : "False";
      result.nodeType = "DDS75-LB";
      result.pnackMode = pnack;
      result.dataLog = [];

      for (var i = 0; i < bytes.length; i += 11) {
        if (i + 10 < bytes.length) {
          var waterLevel = bytes[0 + i] << 8 | bytes[1 + i];
          var distance = bytes[2 + i] << 8 | bytes[3 + i];
          var temp = (bytes[4 + i] << 8 | bytes[5 + i]) / 10;
          var tdc_interval = (bytes[6 + i] & 0x01) ? "YES" : "NO";
          var alarm = ((bytes[6 + i] >> 1) & 0x01) ? "TRUE" : "FALSE";
          var mode = (bytes[6 + i] & 0x40) ? "1" : "0";
          var ts = ((bytes[7 + i] << 24) | (bytes[8 + i] << 16) | (bytes[9 + i] << 8) | bytes[10 + i]).toString(10);

          result.dataLog.push({
            waterLevel: waterLevel,
            distance: distance,
            temperature: { value: temp, unit: "掳C" },
            tdcInterval: tdc_interval,
            alarm: alarm,
            mode: mode,
            timestamp: getMyDate(ts)
          });
        }
      }
    }
    /* Port 5 (0x05): Device information */
    else if (port === 5) {
      var sensor = bytes[0] === 0x27 ? "DDS75-LB" : "Unknown";
      var freq_band;

      switch (bytes[3]) {
        case 0x01: freq_band = "EU868"; break;
        case 0x02: freq_band = "US915"; break;
        case 0x03: freq_band = "IN865"; break;
        case 0x04: freq_band = "AU915"; break;
        case 0x05: freq_band = "KZ865"; break;
        case 0x06: freq_band = "RU864"; break;
        case 0x07: freq_band = "AS923"; break;
        case 0x08: freq_band = "AS923_1"; break;
        case 0x09: freq_band = "AS923_2"; break;
        case 0x0A: freq_band = "AS923_3"; break;
        case 0x0B: freq_band = "CN470"; break;
        case 0x0C: freq_band = "EU433"; break;
        case 0x0D: freq_band = "KR920"; break;
        case 0x0E: freq_band = "MA869"; break;
        default: freq_band = "Unknown";
      }

      var sub_band = bytes[4] === 0xFF ? "NULL" : bytes[4];
      var firm_ver = (bytes[1] & 0x0F) + "." + ((bytes[2] >> 4) & 0x0F) + "." + (bytes[2] & 0x0F);
      var bat = ((bytes[5] << 8) | bytes[6]) / 1000;

      result.sensorModel = sensor;
      result.firmwareVersion = firm_ver;
      result.frequencyBand = freq_band;
      result.subBand = sub_band;
      result.battery = { voltage: { value: bat, unit: "V" } };
    }
    /* Port 6 (0x06): Detect mode data */
    else if (port === 6) {
      result.nodeType = "DDS75-LB";
      var detectData = [];
      for (var i = 0; i < bytes.length; i += 2) {
        if (i + 1 < bytes.length) {
          detectData.push(bytes[i] << 8 | bytes[i + 1]);
        }
      }
      result.detectModeData = detectData;
    }
    /* Unknown port */
    else {
      result.nodeType = "DDS75-LB";
      result.rawData = encoded;
    }

    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({ error: "decoding failed" });
  }
};

/* Helper function to pad single digits with leading zero */
function getzf(c_num) {
  if (parseInt(c_num) < 10) {
    c_num = '0' + c_num;
  }
  return c_num;
}

/* Helper function to convert Unix timestamp to date string */
function getMyDate(str) {
  var c_Date;
  if (str > 9999999999) {
    c_Date = new Date(parseInt(str));
  } else {
    c_Date = new Date(parseInt(str) * 1000);
  }

  var c_Year = c_Date.getFullYear();
  var c_Month = c_Date.getMonth() + 1;
  var c_Day = c_Date.getDate();
  var c_Hour = c_Date.getHours();
  var c_Min = c_Date.getMinutes();
  var c_Sen = c_Date.getSeconds();

  return c_Year + '-' + getzf(c_Month) + '-' + getzf(c_Day) + ' ' + getzf(c_Hour) + ':' + getzf(c_Min) + ':' + getzf(c_Sen);
}
