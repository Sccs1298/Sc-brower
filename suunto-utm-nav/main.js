// UTM Nav - main.js
//
// The Suunto 5 Peak (display "s") does not support the onEvent callback, so
// button presses cannot reach this file. All target entry and navigation logic
// therefore lives in nav.html. This file only forwards the GPS position and
// computes the direction of travel (course over ground) as a fallback heading
// for watches where the compass resource is not available to apps.

var COG_MIN_MOVE_M = 12;   // metres moved before a new direction of travel is computed
var COG_MAX_AGE_S = 30;    // direction of travel is dropped after this many seconds without movement

var anchorLat;
var anchorLon;
var cogAge;

var toRad = function(d) {
  return d * Math.PI / 180;
};

// Distance in metres and initial bearing in degrees between two points (degrees)
var distBearing = function(lat1, lon1, lat2, lon2) {
  var p1 = toRad(lat1);
  var p2 = toRad(lat2);
  var dp = p2 - p1;
  var dl = toRad(lon2 - lon1);
  var h = Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  var d = 2 * 6371008.8 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  var y = Math.sin(dl) * Math.cos(p2);
  var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  var b = Math.atan2(y, x) * 180 / Math.PI;
  return [d, (b + 360) % 360];
};

function onLoad(_input, output) {
  output.ready = 0;
  output.lat = 0;
  output.lon = 0;
  output.cog = -1;
  anchorLat = undefined;
  anchorLon = undefined;
  cogAge = 0;
}

// Runs about once per second
function evaluate(input, output) {
  var r = input.gpsReadiness;
  var la = input.latitude;
  var lo = input.longitude;
  var hasFix = typeof r === 'number' && r >= 100 &&
    typeof la === 'number' && typeof lo === 'number' && (la !== 0 || lo !== 0);

  output.ready = typeof r === 'number' ? r : 0;
  if (!hasFix) {
    return;
  }

  // Degrees multiplied by 10^7, passed on unchanged
  output.lat = la;
  output.lon = lo;

  var lat = la / 10000000;
  var lon = lo / 10000000;
  if (anchorLat === undefined) {
    anchorLat = lat;
    anchorLon = lon;
    return;
  }

  var db = distBearing(anchorLat, anchorLon, lat, lon);
  if (db[0] >= COG_MIN_MOVE_M) {
    output.cog = Math.round(db[1]);
    anchorLat = lat;
    anchorLon = lon;
    cogAge = 0;
  } else {
    cogAge++;
    if (cogAge > COG_MAX_AGE_S) {
      output.cog = -1;
    }
  }
}

function getUserInterface() {
  return { template: 'nav' };
}
