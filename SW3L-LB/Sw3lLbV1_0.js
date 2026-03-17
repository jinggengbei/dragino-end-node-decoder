/*-
 * SW3L-LB Decoder for Orange Live Objects
 * Version: 1.0
 * 
 * Description:
 * Decoder for Dragino SW3L-LB water flow sensor compatible with Orange Live Objects platform.
 * Supports multiple LoRaWAN ports:
 * - Port 3: Data log (multiple records)
 * - Port 4: Configuration (TDC, timers)
 * - Port 5: Device information (model, firmware, frequency band, battery)
 * - Other ports: Standard sensor data
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

    /* Port 3 (0x03): Data log with multiple records */
    if (port === 3) {
      var pnack = (bytes[0] >> 7) & 0x01 ? "True" : "False";
      result.nodeType = "SW3L-LB";
      result.pnackMode = pnack;
      result.dataLog = [];

      for (var i = 0; i < bytes.length; i += 11) {
        if (i + 10 < bytes.length) {
          var tdc_interval = (bytes[0 + i] & 0x01) ? "YES" : "NO";
          var alarm = (bytes[0 + i] & 0x02) ? "TRUE" : "FALSE";
          var calculate_flag = (bytes[0 + i] & 0x3C) >> 2;
          var pb15 = (bytes[1 + i] & 0x80) ? "H" : "L";
          var pa4 = (bytes[1 + i] & 0x40) ? "H" : "L";
          var timer = bytes[1 + i] & 0x3F;
          var rawValue = ((bytes[3 + i] << 24) | (bytes[4 + i] << 16) | (bytes[5 + i] << 8) | bytes[6 + i]) >>> 0;

          var water_flow_value;
          if (calculate_flag === 3) {
            water_flow_value = parseFloat((rawValue / 12).toFixed(1));
          } else if (calculate_flag === 2) {
            water_flow_value = parseFloat((rawValue / 64).toFixed(1));
          } else if (calculate_flag === 1) {
            water_flow_value = parseFloat((rawValue / 390).toFixed(1));
          } else {
            water_flow_value = parseFloat((rawValue / 450).toFixed(1));
          }

          var ts = ((bytes[7 + i] << 24) | (bytes[8 + i] << 16) | (bytes[9 + i] << 8) | bytes[10 + i]).toString(10);
          result.dataLog.push({
            tdcInterval: tdc_interval,
            alarm: alarm,
            calculateFlag: calculate_flag,
            pb15Level: pb15,
            pa4Level: pa4,
            timer: timer,
            waterFlowValue: water_flow_value,
            timestamp: getMyDate(ts)
          });
        }
      }
    }
    /* Port 4 (0x04): Configuration data */
    else if (port === 4) {
      result.nodeType = "SW3L-LB";
      result.tdc = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
      result.stopTimer = bytes[4];
      result.alarmTimer = (bytes[5] << 8) | bytes[6];
    }
    /* Port 5 (0x05): Device information */
    else if (port === 5) {
      var sensor = bytes[0] === 0x1F ? "SW3L-LB" : "Unknown";
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
    /* Default: Standard sensor data */
    else {
      result.nodeType = "SW3L-LB";
      result.mod = bytes[5] & 0x3F;
      result.pa4Level = (bytes[5] & 0x80) ? "H" : "L";
      result.pb15Level = (bytes[5] & 0x40) ? "H" : "L";
      result.calculateFlag = (bytes[0] & 0x3C) >> 2;
      result.alarm = (bytes[0] & 0x02) ? "TRUE" : "FALSE";
      result.tdcInterval = (bytes[0] & 0x01) ? "YES" : "NO";

      var rawValue = ((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
      if (result.calculateFlag === 3) {
        result.waterFlowValue = parseFloat((rawValue / 12).toFixed(1));
      } else if (result.calculateFlag === 2) {
        result.waterFlowValue = parseFloat((rawValue / 64).toFixed(1));
      } else if (result.calculateFlag === 1) {
        result.waterFlowValue = parseFloat((rawValue / 390).toFixed(1));
      } else {
        result.waterFlowValue = parseFloat((rawValue / 450).toFixed(1));
      }

      if (bytes[5] === 0x01) {
        result.lastPulse = rawValue;
      } else {
        result.totalPulse = rawValue;
      }

      var ts = ((bytes[7] << 24) | (bytes[8] << 16) | (bytes[9] << 8) | bytes[10]).toString(10);
      result.dataTime = getMyDate(ts);
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
